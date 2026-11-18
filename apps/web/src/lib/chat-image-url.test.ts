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

  it('proxies local project image paths through the gateway', () => {
    expect(resolveChatImageUrl('/home/user/project/.tmp-docs-site.png', apiUrl)).toBe(
      'http://localhost:8000/api/browser/screenshot?path=%2Fhome%2Fuser%2Fproject%2F.tmp-docs-site.png',
    )
  })

  it('keeps existing gateway asset routes addressable from the web app origin', () => {
    expect(resolveChatImageUrl('/api/browser/screenshot?path=%2Ftmp%2Fshot.png', apiUrl)).toBe(
      'http://localhost:8000/api/browser/screenshot?path=%2Ftmp%2Fshot.png',
    )
  })

  it('includes the owning chat when resolving a project image', () => {
    expect(resolveChatImageUrl('.jait/shots/provider-selector-390.png', apiUrl, 'chat-1')).toBe(
      'http://localhost:8000/api/browser/screenshot?path=.jait%2Fshots%2Fprovider-selector-390.png&sessionId=chat-1',
    )
  })

  it('rejects non-image custom schemes', () => {
    expect(resolveChatImageUrl('file:///tmp/shot.png', apiUrl)).toBeNull()
  })
})
