import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentsApi } from './agents-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AgentsApi.listProviderModels', () => {
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
