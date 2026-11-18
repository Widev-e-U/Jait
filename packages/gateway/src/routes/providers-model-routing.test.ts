import { encodeJaitModelId, serializeJaitBackendInstances } from '@jait/shared'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config.js'
import { migrateDatabase, openDatabase } from '../db/index.js'
import { resetModelFetcherCaches } from '../providers/model-fetchers.js'
import { ProviderRegistry } from '../providers/registry.js'
import { signAuthToken } from '../security/http-auth.js'
import { ProviderAccountService } from '../services/provider-accounts.js'
import { UserService } from '../services/users.js'
import { registerProviderRoutes } from './providers.js'

describe('provider model node routing', () => {
  it('invalidates cached ACP models when refreshing', async () => {
    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), jwtSecret: 'provider-model-reset-test', logLevel: 'silent' }
    const users = new UserService(db)
    const user = users.createUser('refresh-user', 'password123')
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)
    const registry = new ProviderRegistry()
    const resetModels = vi.fn()
    registry.register({
      id: 'codex-account',
      ownerUserId: user.id,
      info: { id: 'codex-account', name: 'Codex', description: 'Codex ACP', available: true, modes: ['full-access'] },
      checkAvailability: async () => true,
      listModels: async () => [],
      resetModels,
    } as any)
    const app = Fastify({ logger: false })
    registerProviderRoutes(app, config, { providerRegistry: registry, userService: users })
    const response = await app.inject({
      method: 'POST',
      url: '/api/providers/models/reset',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(200)
    expect(resetModels).toHaveBeenCalledOnce()
    await app.close()
    sqlite.close()
  })

  it('re-reads a named Ollama server when refreshing the Jait picker', async () => {
    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), jwtSecret: 'ollama-model-refresh-test', logLevel: 'silent' }
    const users = new UserService(db)
    const user = users.createUser('ollama-user', 'password123')
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)
    const headers = { authorization: `Bearer ${token}` }
    const baseUrl = 'http://office.test:11434'
    users.updateSettings(user.id, { apiKeys: {
      JAIT_BACKEND_INSTANCES: serializeJaitBackendInstances([
        { id: 'office', type: 'ollama', name: 'Office', baseUrl },
      ]),
    } })
    const registry = new ProviderRegistry()
    registry.register({
      id: 'jait',
      info: { id: 'jait', name: 'Jait', description: 'Gateway provider', available: true, modes: ['full-access'] },
      checkAvailability: async () => true,
      listModels: async () => [],
    } as any)
    const app = Fastify({ logger: false })
    registerProviderRoutes(app, config, { providerRegistry: registry, userService: users })
    let installedTags = ['gemma3:27b']
    const fetchMock = vi.fn(async (url: string) => url === `${baseUrl}/api/tags`
      ? Response.json({ models: installedTags.map(name => ({ name })) })
      : new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    resetModelFetcherCaches()

    try {
      const url = '/api/providers/jait/models'
      const initial = await app.inject({ url, headers })
      expect(initial.statusCode).toBe(200)
      expect(initial.json().models.map(({ name }: { name: string }) => name)).toEqual(installedTags)
      installedTags = ['gemma4:31b']
      const refreshed = await app.inject({ url: `${url}?refresh=true`, headers })
      expect(refreshed.statusCode).toBe(200)
      expect(refreshed.headers['cache-control']).toBe('no-store')
      expect(refreshed.json().models).toEqual([expect.objectContaining({
        id: encodeJaitModelId('ollama', 'office', 'gemma4:31b'),
        group: 'Office · Ollama',
      })])
      expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/api/tags`, expect.objectContaining({
        headers: { 'Cache-Control': 'no-cache' },
      }))
    } finally {
      await app.close()
      sqlite.close()
      vi.unstubAllGlobals()
      resetModelFetcherCaches()
    }
  })

  it('loads remote CLI models from the selected node and keeps Jait on the gateway', async () => {
    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), jwtSecret: 'provider-model-node-test', logLevel: 'silent' }
    const users = new UserService(db)
    const user = users.createUser('model-user', 'password123')
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)
    const headers = { authorization: `Bearer ${token}` }

    const registry = new ProviderRegistry()
    registry.register({
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
    } as any)

    const node = {
      id: 'windows-node',
      name: 'Windows workstation',
      platform: 'windows',
      clientId: 'client-1',
      isGateway: false,
      providers: ['codex'],
      registeredAt: new Date().toISOString(),
    }
    const providerAccounts = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex CLI",
      command: "codex-acp",
      auth: "acp",
    }], "/tmp/jait-provider-model-routing-test")
    const account = providerAccounts.create(user.id, "codex", "Windows", node.id)

    const proxyProviderOp = vi.fn(async () => [
      { id: 'windows-codex-model', name: 'Windows Codex model' },
    ])
    const ws = {
      getFsNodes: () => [node],
      findNodeByDeviceId: (nodeId: string) => nodeId === node.id ? node : undefined,
      proxyProviderOp,
    }

    const app = Fastify({ logger: false })
    registerProviderRoutes(app, config, {
      providerRegistry: registry,
      userService: users,
      providerAccountService: providerAccounts,
      ws: ws as any,
    })

    const remoteResponse = await app.inject({
      method: 'GET',
      url: `/api/providers/${account.id}/models?nodeId=windows-node`,
      headers,
    })
    expect(remoteResponse.statusCode).toBe(200)
    expect(remoteResponse.json().models).toEqual([
      { id: 'windows-codex-model', name: 'Windows Codex model' },
    ])
    expect(proxyProviderOp).toHaveBeenCalledWith(
      'windows-node',
      'list-models',
      { providerId: account.id, providerType: 'codex' },
      90_000,
    )

    const jaitResponse = await app.inject({
      method: 'GET',
      url: '/api/providers/jait/models?nodeId=windows-node',
      headers,
    })
    expect(jaitResponse.statusCode).toBe(200)
    expect(jaitResponse.json().models).toContainEqual({
      id: 'gateway-model',
      name: 'Gateway model',
      group: 'OpenAI',
    })
    expect(proxyProviderOp).toHaveBeenCalledTimes(1)

    await app.close()
    sqlite.close()
  })
})
