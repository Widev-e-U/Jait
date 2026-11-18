import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { promisify } from 'node:util'
import type { NetworkResource, NetworkResourceInventory } from '@jait/shared'

const execFileAsync = promisify(execFile)
const MAX_CONTAINERS = 512
const TTL_MS = 30_000

// Only selected metadata leaves Docker. Never collect env, mounts or arbitrary labels.
const INSPECT_FORMAT = '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"state":{{json .State.Status}},"created":{{json .Created}},"networks":{{json .NetworkSettings.Networks}}}'

export function containerResource(value: unknown, observedAt: string): NetworkResource | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !/^[a-f0-9]{12,64}$/.test(row.id)
    || typeof row.name !== 'string' || typeof row.image !== 'string' || typeof row.state !== 'string') return null
  const name = row.name.replace(/^\//, '').slice(0, 256)
  const image = row.image.slice(0, 512)
  const sandbox = /^jait-(?:agent-sb|sb)-/.test(name) && image.startsWith('jait/')
  // Match complete known repositories; unfamiliar images use the Docker fallback.
  const repository = image.replace(/@.*$/, '').replace(/:[^/]*$/, '').replace(/^docker\.io\/(?:library\/)?/, '')
  const icons: Record<string, NetworkResource['icon']> = {
    nginx: 'nginx', redis: 'redis', postgres: 'postgresql',
    'ghcr.io/home-assistant/home-assistant': 'homeassistant',
    'homeassistant/home-assistant': 'homeassistant',
  }
  const networks = row.networks && typeof row.networks === 'object' ? row.networks as Record<string, unknown> : {}
  const addresses: string[] = []
  for (const network of Object.values(networks)) {
    const ip = network && typeof network === 'object' ? (network as Record<string, unknown>).IPAddress : null
    if (typeof ip === 'string' && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) addresses.push(ip)
  }
  return {
    id: `docker-${row.id}`, type: 'resource', kind: 'container', name,
    parentId: 'gateway', icon: sandbox ? 'jait' : (icons[repository] ?? 'docker'),
    online: row.state === 'running', status: row.state, source: 'Local Docker inventory', observedAt,
    addresses: [...new Set(addresses)], category: sandbox ? 'sandbox' : 'application',
    facts: [
      { label: 'Image', value: image }, { label: 'Container ID', value: row.id },
      ...(sandbox ? [{ label: 'Owner', value: 'Not recorded' }] : []),
      { label: 'Networks', value: Object.keys(networks).join(', ') || 'None' },
      ...(typeof row.created === 'string' ? [{ label: 'Created', value: row.created }] : []),
      { label: 'Access', value: 'Metadata available' },
    ],
  }
}

/** Coalesce polls and bound work. Docker failure never removes ordinary scan results. */
export class DockerResourceInventory {
  private cached: { at: number; value: NetworkResourceInventory } | undefined
  private pending: Promise<NetworkResourceInventory> | undefined

  constructor(private readonly run = async (args: string[]) => {
    const configured = process.env.DOCKER_HOST
    // Resource parents are local: never silently query a remote Docker context.
    if (configured && !configured.startsWith('unix://') && !configured.startsWith('npipe://')) throw new Error('Non-local Docker endpoint')
    const endpoint = configured ?? (platform() === 'win32' ? 'npipe:////./pipe/docker_engine'
      : existsSync(`${homedir()}/.docker/run/docker.sock`) ? `unix://${homedir()}/.docker/run/docker.sock` : 'unix:///var/run/docker.sock')
    const { stdout } = await execFileAsync('docker', ['--host', endpoint, ...args], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true })
    return stdout
  }) {}

  async get(): Promise<NetworkResourceInventory> {
    if (this.cached && Date.now() - this.cached.at < TTL_MS) return this.cached.value
    if (this.pending) return this.pending
    this.pending = this.collect().catch((): NetworkResourceInventory => ({ status: 'unavailable', resources: [] }))
      .then(value => { this.cached = { at: Date.now(), value }; return value })
      .finally(() => { this.pending = undefined })
    return this.pending
  }

  private async collect(): Promise<NetworkResourceInventory> {
    const stdout = await this.run(['ps', '--all', '--no-trunc', '--format', '{{.ID}}'])
    const all = stdout.trim().split(/\r?\n/).filter(id => /^[a-f0-9]{64}$/.test(id))
    const ids = all.slice(0, MAX_CONTAINERS)
    const resources: NetworkResource[] = []
    const observedAt = new Date().toISOString()
    // Small batches also keep argv below Windows command length limits.
    for (let offset = 0; offset < ids.length; offset += 32) {
      const output = await this.run(['inspect', '--type', 'container', '--format', INSPECT_FORMAT, ...ids.slice(offset, offset + 32)])
      for (const line of output.trim().split(/\r?\n/).filter(Boolean)) {
        const resource = containerResource(JSON.parse(line), observedAt)
        if (resource) resources.push(resource)
      }
    }
    return { status: 'available', resources, truncated: all.length > MAX_CONTAINERS }
  }
}
