import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installVersionWatchdog } from './version-watchdog'

describe('installVersionWatchdog', () => {
  let reloadSpy: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>
  let intervalCallbacks: Array<() => void>

  beforeEach(() => {
    vi.restoreAllMocks()
    reloadSpy = vi.fn()
    intervalCallbacks = []
    fetchMock = vi.fn(async () => new Response(null, {
      status: 200,
      headers: { etag: 'W/"abc"' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', { addEventListener: vi.fn() })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { origin: 'https://app.test', reload: reloadSpy, pathname: '/' },
        addEventListener: vi.fn(),
        setInterval: vi.fn((cb: () => void) => {
          intervalCallbacks.push(cb)
          return intervalCallbacks.length
        }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is a no-op in Vite dev (HMR owns updates)', () => {
    installVersionWatchdog(60_000, { dev: true })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('is a no-op inside the gateway preview proxies', () => {
    for (const pathname of ['/api/dev-proxy/3000/chats', '/api/dev-file/index.html']) {
      (window as any).location = { reload: reloadSpy, pathname }

      installVersionWatchdog(60_000, { dev: false })

      expect(fetchMock, `no polling for ${pathname}`).not.toHaveBeenCalled()
      expect(reloadSpy, `no reload for ${pathname}`).not.toHaveBeenCalled()
    }
  })

  it('polls the origin root in production and reloads when the stamp changes', async () => {
    installVersionWatchdog(60_000, { dev: false })

    // Baseline read happens immediately on install.
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Next tick sees a changed build stamp → one full-page reload.
    fetchMock.mockImplementation(async () => new Response(null, {
      status: 200,
      headers: { etag: 'W/"def"' },
    }))
    for (const cb of intervalCallbacks) cb()
    await vi.waitFor(() => {
      expect(reloadSpy).toHaveBeenCalledTimes(1)
    })
  })
})