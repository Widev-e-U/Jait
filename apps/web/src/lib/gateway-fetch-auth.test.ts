import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./gateway-url', () => ({ getApiUrl: () => 'http://gateway.test:8000' }))
vi.mock('./auth-token', () => ({ getAuthToken: () => 'native-account-token' }))
afterEach(() => vi.unstubAllGlobals())
it('authenticates raw native gateway requests without sending tokens to external origins', async () => {
  const original = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('window', {
    fetch: original, jaitDesktop: {},
    location: { href: 'http://tauri.localhost/', origin: 'http://tauri.localhost' },
  })
  const { installGatewayFetchAuth } = await import('./api-fetch')
  installGatewayFetchAuth()
  await window.fetch('http://gateway.test:8000/api/filesystem/nodes')
  expect(new Headers(original.mock.calls[0]![1]?.headers).get('authorization')).toBe('Bearer native-account-token')
  await window.fetch('https://external.test/api/anything')
  expect(original.mock.calls[1]![1]).toBeUndefined()
  await window.fetch(new Request('http://gateway.test:8000/api/terminals', { headers: { authorization: 'Bearer explicit-token' } }))
  expect(new Headers(original.mock.calls[2]![1]?.headers).get('authorization')).toBe('Bearer explicit-token')
});
