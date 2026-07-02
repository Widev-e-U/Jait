import { afterEach, describe, expect, it, vi } from 'vitest'

function stubBrowserOrigin() {
  vi.stubGlobal('window', {
    location: {
      origin: 'http://localhost:8000',
    },
  } as unknown as Window & typeof globalThis)
}

describe('fetchStateBatched', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('batches same-tick requests for the same entity and token', async () => {
    stubBrowserOrigin()

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
    stubBrowserOrigin()

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

  it('dedupes same-key requests while the batched fetch is in flight', async () => {
    stubBrowserOrigin()

    let resolveJson!: (value: Record<string, unknown>) => void
    const jsonPromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveJson = resolve
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: () => jsonPromise,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStateBatched } = await import('./state-batch')

    const first = fetchStateBatched('sessions', 'session-1', 'alpha', 'token-a')
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = fetchStateBatched('sessions', 'session-1', 'alpha', 'token-a')
    resolveJson({ alpha: 'first' })

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'first'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses websocket-primed state without a REST fetch', async () => {
    stubBrowserOrigin()

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStateBatched, primeStateCache } = await import('./state-batch')
    primeStateCache('sessions', 'session-1', 'token-a', { alpha: 'from-ws' })

    await expect(fetchStateBatched('sessions', 'session-1', 'alpha', 'token-a')).resolves.toBe('from-ws')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves repeated reads from cache after the first REST fetch resolves', async () => {
    stubBrowserOrigin()

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ alpha: 'first' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStateBatched } = await import('./state-batch')

    await expect(fetchStateBatched('sessions', 'session-1', 'alpha', 'token-a')).resolves.toBe('first')
    await expect(fetchStateBatched('sessions', 'session-1', 'alpha', 'token-a')).resolves.toBe('first')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
