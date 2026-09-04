import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config.js'
import { ProviderRegistry } from '../providers/registry.js'
import { signAuthToken } from '../security/http-auth.js'
import { registerProviderRoutes } from './providers.js'

/**
 * Route-level coverage for provider/device scoping. These tests stub the
 * account service so they can run without a database (the DB-backed suites
 * need an SQLite build with FTS5).
 */

const USER = { id: 'user-1', username: 'scope-user' }

function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}

function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}

const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}

const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}

describe('provider listing', () => {
  it('returns one flat list where every provider names the device it runs on', async () => {
    const proxyProviderOp = vi.fn(async (_nodeId: string, op: string) => (
      op === 'auth-status'
        ? { authenticated: true, login: true, logout: true, deviceCode: true }
        : []
    ))
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({ method: 'GET', url: '/api/providers', headers })
    expect(response.statusCode).toBe(200)
    const { providers, remoteProviders } = response.json()

    expect(providers.map((provider: { id: string; nodeId: string }) => [provider.id, provider.nodeId])).toEqual([
      ['jait', 'gateway'],
      ['codex-gateway', 'gateway'],
      ['codex-windows', 'windows-node'],
    ])
    const windows = providers.find((provider: { id: string }) => provider.id === 'codex-windows')
    expect(windows.nodeName).toBe('Windows workstation')
    expect(windows.installed).toBe(true)
    expect(windows.available).toBe(true)

    // Grouped view stays available for the settings screen.
    expect(remoteProviders).toHaveLength(1)
    expect(remoteProviders[0].providers).toContain('codex-windows')

    await app.close()
  })

  it('marks a device account unavailable with a reason when it is not signed in', async () => {
    const proxyProviderOp = vi.fn(async (_nodeId: string, op: string) => (
      op === 'auth-status'
        ? { authenticated: false, login: true, logout: false, deviceCode: true }
        : []
    ))
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({ method: 'GET', url: '/api/providers', headers })
    const windows = response.json().providers.find((provider: { id: string }) => provider.id === 'codex-windows')

    expect(windows.installed).toBe(true)
    expect(windows.available).toBe(false)
    expect(windows.unavailableReason).toContain('Login required')
    expect(windows.auth.authenticated).toBe(false)

    await app.close()
  })
})

describe('provider model routing', () => {
  it('loads models from the device that hosts the account, ignoring a stale nodeId hint', async () => {
    const proxyProviderOp = vi.fn(async () => [{ id: 'windows-model', name: 'Windows model' }])
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/codex-windows/models?nodeId=gateway',
      headers,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().models).toEqual([{ id: 'windows-model', name: 'Windows model' }])
    expect(proxyProviderOp).toHaveBeenCalledWith(
      'windows-node',
      'list-models',
      { providerId: 'codex-windows', providerType: 'codex' },
      90_000,
    )

    await app.close()
  })

  it('keeps a gateway account on the gateway even inside a project pinned to a device', async () => {
    const { app, headers, proxyProviderOp } = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/codex-gateway/models?nodeId=windows-node',
      headers,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().models).toEqual([{ id: 'gateway-codex-model', name: 'Gateway Codex model' }])
    expect(proxyProviderOp).not.toHaveBeenCalled()

    await app.close()
  })
})
