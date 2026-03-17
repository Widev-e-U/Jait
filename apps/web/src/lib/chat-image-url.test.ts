import { beforeAll, describe, expect, it } from 'vitest'

let resolveChatImageUrl: typeof import('./chat-image-url')['resolveChatImageUrl']

describe('resolveChatImageUrl', () => {
  beforeAll(async () => {
    ;(globalThis as typeof globalThis & { window?: unknown }).window = {
      location: {
        origin: 'http://localhost:8000',
        port: '8000',
        protocol: 'http:',
        hostname: 'localhost',
      },
    }
    ;({ resolveChatImageUrl } = await import('./chat-image-url'))
  })

  const apiUrl = 'http://localhost:8000'

  it('passes through remote image urls', () => {
    expect(resolveChatImageUrl('https://example.com/image.png', apiUrl)).toBe('https://example.com/image.png')
  })

  it('proxies local workspace image paths through the gateway', () => {
    expect(resolveChatImageUrl('/home/jakob/jait/.tmp-docs-site.png', apiUrl)).toBe(
      'http://localhost:8000/api/browser/screenshot?path=%2Fhome%2Fjakob%2Fjait%2F.tmp-docs-site.png',
    )
  })

  it('keeps existing gateway asset routes addressable from the web app origin', () => {
    expect(resolveChatImageUrl('/api/browser/screenshot?path=%2Ftmp%2Fshot.png', apiUrl)).toBe(
      'http://localhost:8000/api/browser/screenshot?path=%2Ftmp%2Fshot.png',
    )
  })

  it('rejects non-image custom schemes', () => {
    expect(resolveChatImageUrl('file:///tmp/shot.png', apiUrl)).toBeNull()
  })
})
