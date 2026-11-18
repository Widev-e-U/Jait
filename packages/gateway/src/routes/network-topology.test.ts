import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import { registerNetworkRoutes } from './network.js'
import { setLatestNetworkScan } from '../tools/network-tools.js'
import { containerResource } from '../services/network-resources.js'
import { DockerResourceInventory } from '../services/network-resources.js'

// Exercise the real topology route while keeping Docker and network probes out of tests.
vi.mock('node:os', async importOriginal => ({ ...await importOriginal<typeof import('node:os')>(), networkInterfaces: () => ({ eth0: [{ address: '192.168.1.2', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: null }] }) }))

describe('network topology resources', () => {
  it('deduplicates local aliases and container IPs while preserving ordinary hosts', async () => {
    const resource = containerResource({ id: 'a'.repeat(64), name: '/nginx', image: 'nginx:alpine', state: 'running', networks: { bridge: { IPAddress: '172.17.0.2' } } }, 'now')!
    const mock = vi.spyOn(DockerResourceInventory.prototype, 'get').mockResolvedValue({ status: 'available', resources: [resource] })
    const app = Fastify()
    registerNetworkRoutes(app)
    const hosts = ['192.168.1.2', '172.17.0.2', '192.168.1.10'].map(ip => ({ ip, mac: null, hostname: null, vendor: null, alive: true, openPorts: [], sshReachable: false, agentStatus: 'not-installed' as const, osVersion: null, lastSeen: 'now' }))
    setLatestNetworkScan({ subnet: '192.168.1', hosts, scannedAt: 'now', durationMs: 0 })
    try {
      const result = await app.inject({ method: 'GET', url: '/api/network/topology' })
      expect(result.statusCode).toBe(200)
      expect(result.json().hosts.map((host: { ip: string }) => host.ip)).toEqual(['192.168.1.10'])
      expect(result.json().resources).toEqual([resource])
      mock.mockResolvedValue({ status: 'unavailable', resources: [] })
      const unavailable = await app.inject({ method: 'GET', url: '/api/network/topology' })
      expect(unavailable.json().hosts).toHaveLength(2)
      expect(unavailable.json().inventory.status).toBe('unavailable')
    } finally {
      await app.close()
      mock.mockRestore()
    }
  })
})
