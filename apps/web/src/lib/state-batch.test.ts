import { afterEach, describe, expect, it, vi } from 'vitest'

describe('fetchStateBatched', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('batches same-tick requests for the same entity and token', async () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:8000',
      },
    } as unknown as Window & typeof globalThis)

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        alpha: 'first',
        beta: 'second',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStateBatched } = await import('./state-batch')

    const alpha = fetchStateBatched('sessions', 'session-1', 'alpha', 'token-a')
    const beta = fetchStateBatched('sessions', 'session-1', 'beta', 'token-a')

    await expect(Promise.all([alpha, beta])).resolves.toEqual(['first', 'second'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/sessions/session-1/state?keys=alpha%2Cbeta',
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-a',
        },
      },
    )
  })

  it('does not merge same-tick requests that use different tokens', async () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:8000',
      },
    } as unknown as Window & typeof globalThis)

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      return {
        ok: true,
        json: async () => ({
          alpha: auth === 'Bearer token-a' ? 'from-a' : 'from-b',
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStateBatched } = await import('./state-batch')

    const alpha = fetchStateBatched('sessions', 'session-1', 'alpha', 'token-a')
    const beta = fetchStateBatched('sessions', 'session-1', 'alpha', 'token-b')

    await expect(Promise.all([alpha, beta])).resolves.toEqual(['from-a', 'from-b'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls).toEqual([
      [
        'http://localhost:8000/api/sessions/session-1/state?keys=alpha',
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-a',
          },
        },
      ],
      [
        'http://localhost:8000/api/sessions/session-1/state?keys=alpha',
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-b',
          },
        },
      ],
    ])
  })
})
