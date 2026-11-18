import { describe, expect, it, vi } from 'vitest'
import { containerResource, DockerResourceInventory } from './network-resources.js'

const id = 'a'.repeat(64)
const record = { id, name: '/jait-agent-sb-test', image: 'jait/sandbox:latest', state: 'running', created: '2026-10-15T10:00:00Z', networks: { bridge: { IPAddress: '172.17.0.2' } } }

describe('Docker resource inventory', () => {
  it('provides stable identity and selected facts without leaking arbitrary inspect fields', () => {
    const resource = containerResource({ ...record, Env: ['TOKEN=secret'], mounts: ['/private'], labels: { secret: 'secret' } }, 'now')!
    expect(resource).toMatchObject({ id: `docker-${id}`, name: 'jait-agent-sb-test', icon: 'jait', category: 'sandbox', parentId: 'gateway', addresses: ['172.17.0.2'] })
    expect(JSON.stringify(resource)).not.toMatch(/secret|TOKEN|private/)
  })
  it('uses explicit image mappings and does not trust lookalike repositories', () => {
    expect(containerResource({ ...record, image: 'docker.io/library/nginx:alpine' }, 'now')?.icon).toBe('nginx')
    expect(containerResource({ ...record, image: 'attacker/nginx:latest' }, 'now')?.icon).toBe('docker')
    expect(containerResource({ ...record, state: 'exited' }, 'now')?.online).toBe(false)
    expect(containerResource({ ...record, id: '--malformed' }, 'now')).toBeNull()
  })
  it('coalesces concurrent polls and caches the sanitized inventory', async () => {
    const run = vi.fn(async (args: string[]) => args[0] === 'ps' ? `${id}\n` : JSON.stringify(record))
    const inventory = new DockerResourceInventory(run)
    const [a, b] = await Promise.all([inventory.get(), inventory.get()])
    expect(a).toBe(b)
    expect(a.resources).toHaveLength(1)
    expect(await inventory.get()).toBe(a)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1]![0]).toContain('--type')
  })
  it('handles unavailable Docker and malformed output without reporting a successful empty inventory', async () => {
    const denied = new DockerResourceInventory(async () => { throw new Error('denied secret') })
    expect(await denied.get()).toEqual({ status: 'unavailable', resources: [] })
    const malformed = new DockerResourceInventory(async args => args[0] === 'ps' ? id : '{broken')
    expect((await malformed.get()).status).toBe('unavailable')
  })
  it('caps work and passes only validated container IDs to inspect', async () => {
    const ids = Array.from({ length: 520 }, (_, i) => i.toString(16).padStart(64, '0'))
    const run = vi.fn(async (args: string[]) => args[0] === 'ps' ? ['--evil', ...ids].join('\n') : '')
    expect(await new DockerResourceInventory(run).get()).toMatchObject({ status: 'available', truncated: true })
    const inspected = run.mock.calls.slice(1).flatMap(([args]) => args.slice(5))
    expect(inspected).toHaveLength(512)
    expect(inspected).not.toContain('--evil')
  })
})
