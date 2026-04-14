import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('browser-collaboration-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses a non-empty fallback message when an error response has no statusText', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn().mockResolvedValue(
        new Response('', {
          status: 503,
          statusText: '',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    })

    const { browserCollaborationApi } = await import('./browser-collaboration-api')

    await expect(browserCollaborationApi.listSessions('token')).rejects.toThrow('Request failed (HTTP 503)')
  })
})
