import { beforeAll, describe, expect, it } from 'vitest'

let resolvePreviewTarget: typeof import('./dev-preview-panel')['resolvePreviewTarget']

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
    ;({ resolvePreviewTarget } = await import('./dev-preview-panel'))
  })

  it('accepts full loopback urls with paths', () => {
    expect(resolvePreviewTarget('http://127.0.0.1:8765/index.html')).toEqual({
      iframeSrc: 'http://localhost:8000/api/dev-proxy/8765/index.html',
      label: '127.0.0.1:8765/index.html',
    })
  })

  it('rejects non-loopback hosts', () => {
    expect(resolvePreviewTarget('https://example.com:3000')).toBeNull()
  })
})
