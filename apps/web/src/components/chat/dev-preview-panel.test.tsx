import { beforeAll, describe, expect, it } from 'vitest'

let resolvePreviewTarget: typeof import('./dev-preview-panel')['resolvePreviewTarget']
let getPreviewTargetWarning: typeof import('./dev-preview-panel')['getPreviewTargetWarning']

describe('resolvePreviewTarget', () => {
  beforeAll(async () => {
    ;(globalThis as typeof globalThis & { window?: unknown }).window = {
      location: {
        origin: 'http://localhost:8000',
        port: '8000',
        protocol: 'http:',
        hostname: 'localhost',
      },
    }
    ;(globalThis as typeof globalThis & { localStorage?: Storage }).localStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    }
    ;({ resolvePreviewTarget, getPreviewTargetWarning } = await import('./dev-preview-panel'))
  })

  it('accepts full loopback urls with paths', () => {
    expect(resolvePreviewTarget('http://127.0.0.1:8765/index.html')).toEqual({
      iframeSrc: 'http://localhost:8000/api/dev-proxy/8765/index.html',
      label: '127.0.0.1:8765/index.html',
    })
  })

  it('accepts local html files from the workspace', () => {
    expect(resolvePreviewTarget('docs/site/index.html')).toEqual({
      iframeSrc: 'http://localhost:8000/api/dev-file/ZG9jcy9zaXRlL2luZGV4Lmh0bWw',
      label: 'docs/site/index.html',
    })
  })

  it('accepts gateway-relative managed preview paths', () => {
    expect(resolvePreviewTarget('/api/preview/proxy/test-session/')).toEqual({
      iframeSrc: 'http://localhost:8000/api/preview/proxy/test-session/',
      label: '/api/preview/proxy/test-session/',
    })
  })

  it('rejects non-loopback hosts', () => {
    expect(resolvePreviewTarget('https://example.com:3000')).toBeNull()
  })

  it('warns when localhost preview goes through a remote gateway', () => {
    expect(getPreviewTargetWarning('5173')).toBeNull()

    ;(globalThis as typeof globalThis & { window?: unknown }).window = {
      location: {
        origin: 'https://jait.basenetwork.net',
        port: '',
        protocol: 'https:',
        hostname: 'jait.basenetwork.net',
      },
      dispatchEvent: () => true,
    }
    ;(globalThis as typeof globalThis & { localStorage?: Storage }).localStorage = {
      getItem: (key: string) => key === 'jait-gateway-url' ? 'https://jait.basenetwork.net' : null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    }

    expect(getPreviewTargetWarning('5173')).toContain('localhost resolves on that gateway host')
  })
})
