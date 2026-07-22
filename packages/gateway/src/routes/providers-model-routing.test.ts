import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config.js'
import { migrateDatabase, openDatabase } from '../db/index.js'
import { ProviderRegistry } from '../providers/registry.js'
import { signAuthToken } from '../security/http-auth.js'
import { ProviderAccountService } from '../services/provider-accounts.js'
import { UserService } from '../services/users.js'
import { registerProviderRoutes } from './providers.js'

describe('provider model node routing', () => {
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
