import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthToken, setAuthToken } from './auth-token'
import { apiFetch } from './api-fetch'

describe('apiFetch', () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

  beforeEach(() => {
    vi.restoreAllMocks()
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { port: '3000' },
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        sessionStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    })
    clearAuthToken()
  })

  it('adds Bearer authorization for native app requests', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { port: '3000' },
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        sessionStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        jaitDesktop: {},
      },
    })
    setAuthToken('native-token')

    await apiFetch('https://example.test/api')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer native-token')
    expect(init?.credentials).toBeUndefined()
  })

  it('does not overwrite an explicit authorization header on native requests', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { port: '3000' },
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        sessionStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        jaitDesktop: {},
      },
    })
    setAuthToken('native-token')

    await apiFetch('https://example.test/api', {
      headers: {
        Authorization: 'Bearer explicit-token',
      },
    })

    const [, init] = fetchMock.mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer explicit-token')
  })

  it('does not add bearer authorization to browser requests', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { port: '3000' },
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        sessionStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    })
    setAuthToken('web-token')

    await apiFetch('https://example.test/api')

    const [, init] = fetchMock.mock.calls[0]!
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
  })

  it('keeps same-origin browser requests unchanged', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { port: '8000' },
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        sessionStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    })

    await apiFetch('https://example.test/api')

    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.credentials).toBeUndefined()
  })
})
