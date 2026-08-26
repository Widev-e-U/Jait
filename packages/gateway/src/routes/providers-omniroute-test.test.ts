import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config.js'
import { migrateDatabase, openDatabase } from '../db/index.js'
import { ProviderRegistry } from '../providers/registry.js'
import { signAuthToken } from '../security/http-auth.js'
import { UserService } from '../services/users.js'
import { registerProviderRoutes } from './providers.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}

describe('POST /api/providers/omniroute/test', () => {
  it('reports the model count and a sample when the router answers', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ id: 'auto/coding' }, { id: 'openai/gpt-4o' }, { id: 'x/y' }, { id: 'a/b' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/providers/omniroute/test', headers, payload: {} })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.modelCount).toBe(4)
    expect(body.sampleModels).toEqual(['auto/coding', 'openai/gpt-4o', 'x/y'])
    expect(body.authenticated).toBe(false)
    await app.close()
  })

  it('probes the draft base URL rather than the saved one', async () => {
    // The button exists so a user can check a URL *before* committing it.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { app, headers } = await buildApp({ OMNIROUTE_BASE_URL: 'http://saved:20128/v1' })
    await app.inject({
      method: 'POST',
      url: '/api/providers/omniroute/test',
      headers,
      payload: { base_url: 'http://draft:20128/v1' },
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://draft:20128/v1/models')
    await app.close()
  })

  it('explains a 401 as a rejected key instead of echoing the status', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/providers/omniroute/test',
      headers,
      payload: { api_key: 'wrong-key' },
    })

    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain('401')
    expect(body.error).toContain('keyless free tier')
    await app.close()
  })

  it('turns an unreachable router into an actionable message', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:20128') }) as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/providers/omniroute/test', headers, payload: {} })

    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/Could not reach the router — start it, or correct the base URL/)
    await app.close()
  })

  it('rejects a malformed base URL before attempting a request', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/providers/omniroute/test',
      headers,
      payload: { base_url: 'not a url' },
    })

    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    await app.close()
  })

  it('requires authentication', async () => {
    const { app } = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/providers/omniroute/test', payload: {} })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
