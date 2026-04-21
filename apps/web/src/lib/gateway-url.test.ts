import { afterEach, describe, expect, it, vi } from 'vitest'

describe('gateway-url websocket resolution', () => {
  const storage = (() => {
    const data = new Map<string, string>()
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) },
      clear: () => { data.clear() },
    }
  })()

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    storage.clear()
  })

  it('normalizes direct gateway URLs to port 8000 in dev', async () => {
    const mod = await import('./gateway-url')
    expect(mod.normalizeDirectGatewayBase('http://host.docker.internal:4173', true)).toBe('http://host.docker.internal:8000')
  })

  it('preserves the configured websocket URL outside dev normalization paths', async () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://127.0.0.1:4173',
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: '4173',
      },
      localStorage: storage,
      jaitDesktop: {
        gatewayUrl: 'http://host.docker.internal:4173',
      },
      dispatchEvent: () => true,
    } as unknown as Window & typeof globalThis)

    const mod = await import('./gateway-url')
    expect(mod.getWsUrl()).toBe('ws://host.docker.internal:4173')
  })
})
