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
    vi.unstubAllEnvs()
    storage.clear()
  })

  it('normalizes direct gateway URLs to port 8000 in dev', async () => {
    const mod = await import('./gateway-url')
    expect(mod.normalizeDirectGatewayBase('http://host.docker.internal:4173', true)).toBe('http://host.docker.internal:8000')
  })

  it('uses VITE_WS_URL when Vite runs with NODE_ENV=test', async () => {
    vi.stubEnv('VITE_WS_URL', 'ws://127.0.0.1:8100')

    const mod = await import('./gateway-url')
    expect(mod.getWsUrl()).toBe('ws://127.0.0.1:8100')
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

  it('treats the Tauri localhost fallback as unconfigured until the user saves a URL', async () => {
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', {
      location: {
        origin: 'tauri://localhost',
        protocol: 'tauri:',
        hostname: 'localhost',
        port: '',
      },
      localStorage: storage,
      jaitDesktop: {
        gatewayUrl: 'http://localhost:8000',
      },
      __JAIT_DESKTOP_BOOT__: {
        gatewayUrl: 'http://localhost:8000',
        gatewayConfigured: false,
        platform: 'tauri',
      },
      dispatchEvent: () => true,
    } as unknown as Window & typeof globalThis)

    const mod = await import('./gateway-url')
    expect(mod.isGatewayConfigured()).toBe(false)

    mod.setStoredGatewayUrl('http://192.168.1.20:8000')
    expect(mod.isGatewayConfigured()).toBe(true)
  })

  it('respects an explicitly configured Tauri gateway from the environment', async () => {
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', {
      location: {
        origin: 'tauri://localhost',
        protocol: 'tauri:',
        hostname: 'localhost',
        port: '',
      },
      localStorage: storage,
      jaitDesktop: {
        gatewayUrl: 'http://192.168.1.30:8000',
      },
      __JAIT_DESKTOP_BOOT__: {
        gatewayUrl: 'http://192.168.1.30:8000',
        gatewayConfigured: true,
        platform: 'tauri',
      },
      dispatchEvent: () => true,
    } as unknown as Window & typeof globalThis)

    const mod = await import('./gateway-url')
    expect(mod.isGatewayConfigured()).toBe(true)
  })
})

describe('native gateway selection', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  it.each(['local', 'remote'] as const)('keeps HTTP and WebSocket on the selected %s gateway', async (mode) => {
    const config = { mode, remoteUrl: 'https://selected.example', port: 18000, allowNetwork: false }
    vi.stubGlobal('window', {
      __JAIT_DESKTOP_BOOT__: { runtime: 'tauri', platform: 'win32', gatewayConfig: config },
      jaitDesktop: { gatewayUrl: 'https://old-boot.example' },
      location: { origin: 'http://tauri.localhost' },
    })
    vi.stubGlobal('localStorage', { getItem: () => 'https://stale.example' })
    vi.stubEnv('VITE_API_URL', 'https://build.example')
    vi.stubEnv('VITE_WS_URL', 'wss://build.example')
    const mod = await import('./gateway-url')
    const expected = mode === 'local' ? 'http://127.0.0.1:18000' : 'https://selected.example'
    expect(mod.getApiUrl()).toBe(expected)
    expect(mod.getWsUrl()).toBe(expected.replace(/^http/, 'ws'))
    expect(mod.isGatewayConfigured()).toBe(true)
  })
  it('shows setup for the actual Tauri boot shape on a fresh install', async () => {
    vi.stubGlobal('window', {
      __JAIT_DESKTOP_BOOT__: { runtime: 'tauri', platform: 'win32', gatewayConfigured: false },
      jaitDesktop: { gatewayUrl: 'http://localhost:8000' },
    })
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubEnv('VITE_API_URL', '')
    expect((await import('./gateway-url')).isGatewayConfigured()).toBe(false)
  })
})
