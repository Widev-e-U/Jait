import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentsApi } from './agents-api'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AgentsApi.listProviderModels', () => {
  it('shares slow discovery beyond the TTL and caches from completion time', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    let resolve!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetchMock)
    const api = new AgentsApi()
    const first = api.listProviderModels('codex')
    now += 6 * 60_000
    const second = api.listProviderModels('codex')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolve(Response.json({ models: [{ id: 'model', name: 'Model' }] }))
    await Promise.all([first, second])
    now += 4 * 60_000
    expect((await api.listProviderModels('codex')).models[0].id).toBe('model')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    now += 61_000
    fetchMock.mockResolvedValueOnce(Response.json({ models: [] }))
    await api.listProviderModels('codex')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not let an old failed discovery discard a replacement after reset', async () => {
    let reject!: (reason: Error) => void
    let resolve!: (response: Response) => void
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((_, fail) => { reject = fail }))
      .mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetchMock)
    const api = new AgentsApi()
    const old = api.listProviderModels('codex').catch(() => null)
    api.resetProviderModels()
    const replacement = api.listProviderModels('codex')
    reject(new Error('old request failed'))
    await old
    const shared = api.listProviderModels('codex')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolve(Response.json({ models: [] }))
    await Promise.all([replacement, shared])
  })

  it('retries discovery after a failure', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ models: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const api = new AgentsApi()
    await expect(api.listProviderModels('codex')).rejects.toThrow('offline')
    await expect(api.listProviderModels('codex')).resolves.toEqual({ models: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('targets the selected node for a remote CLI provider', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ models: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new AgentsApi()
    await (api.listProviderModels as unknown as (providerId: string, nodeId: string) => Promise<unknown>)('codex', 'windows-node')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers/codex/models?nodeId=windows-node'),
      expect.any(Object),
    )
  })

  it('always loads built-in Jait models from the gateway', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ models: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new AgentsApi()
    await (api.listProviderModels as unknown as (providerId: string, nodeId: string) => Promise<unknown>)('jait', 'windows-node')

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/providers\/jait\/models$/)
  })
})

describe('AgentsApi.refreshProviderModels', () => {
  it('clears cached models and reloads the requested remote account', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ models: [{ id: 'old', name: 'Old' }] }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ models: [{ id: 'new', name: 'New' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const api = new AgentsApi()
    await api.listProviderModels('codex-account', 'windows-node')
    await api.listProviderModels('codex-account', 'windows-node')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const result = await api.refreshProviderModels('codex-account', 'windows-node')

    expect(result.models[0]?.id).toBe('new')
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      expect.stringContaining('/api/providers/models/reset'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(3,
      expect.stringContaining('/api/providers/codex-account/models?nodeId=windows-node'),
      expect.any(Object),
    )
  })

  it('reports a reset failure instead of returning cached models as refreshed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503, statusText: 'Unavailable' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new AgentsApi().refreshProviderModels('codex')).rejects.toThrow('Failed to refresh models')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('AgentsApi.updateProvider', () => {
  it('posts the provider update request and returns the installed version', async () => {
    const result = {
      ok: true,
      message: 'Updated Codex to 0.157.0',
      currentVersion: '0.157.0',
      latestVersion: '0.157.0',
      updateAvailable: false,
      checkedAt: '2026-09-23T12:00:00.000Z',
    }
    const fetchMock = vi.fn(async () => Response.json(result))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new AgentsApi().updateProvider('codex-work')).resolves.toEqual(result)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers/codex-work/update'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('surfaces the provider update error returned by the gateway', async () => {
    const fetchMock = vi.fn(async () => Response.json(
      { error: 'npm install failed' },
      { status: 500 },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new AgentsApi().updateProvider('codex-work')).rejects.toThrow('npm install failed')
  })
})
