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
