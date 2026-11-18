import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindMessengerNotifications, handleMessengerNotification, messengerReadLink, parseMessengerReadLink, automaticReadAllowed } from './notification-actions'
import type { MessengerStore } from './store'

vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => 'https://gateway.test' }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const link = messengerReadLink('!room:matrix.test', '$old-message', '@alice:matrix.test', 'https://matrix.test')
let dispose: (() => void) | undefined
beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://gateway.test', pathname: '/', search: '' }, history: { replaceState: vi.fn() } })
  vi.stubGlobal('navigator', {})
})
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals() })
function setup(account = '@alice:matrix.test', status = 'ready') {
  const markRead = vi.fn(async () => {})
  const store = { getSnapshot: () => ({ status, session: { userId: account, homeserver: 'https://matrix.test' } }), subscribe: () => () => {}, markRead }
  dispose = bindMessengerNotifications(store as unknown as MessengerStore)
  return markRead
}
describe('notification read routing', () => {
  it('round trips encoded room, event and account identity', () => {
    expect(parseMessengerReadLink(link)).toEqual({ roomId: '!room:matrix.test', eventId: '$old-message', account: '@alice:matrix.test', homeserver: 'https://matrix.test' })
    expect(parseMessengerReadLink('//evil.test' + link)).toBeNull()
    expect(parseMessengerReadLink('/messenger?action=mark-read&roomId=!x')).toBeNull()
  })
  it('marks exactly the notified event without selecting the room', async () => {
    const markRead = setup()
    expect(await handleMessengerNotification({ id: 'notification', link })).toBe(true)
    expect(markRead).toHaveBeenCalledWith('!room:matrix.test', '$old-message')
  })
  it('keeps activations pending across offline state and account changes', async () => {
    const markRead = setup('@bob:matrix.test')
    expect(await handleMessengerNotification({ id: 'notification', link })).toBe(false)
    expect(markRead).not.toHaveBeenCalled()
    dispose!(); dispose = undefined
    const offline = setup('@alice:matrix.test', 'reconnecting')
    expect(await handleMessengerNotification({ id: 'notification', link })).toBe(false)
    expect(offline).not.toHaveBeenCalled()
    dispose!(); dispose = undefined
    expect(await handleMessengerNotification({ id: 'notification', link })).toBe(false)
  })
  it('does not acknowledge a failed Matrix write', async () => {
    const markRead = setup(); markRead.mockRejectedValueOnce(new Error('offline'))
    expect(await handleMessengerNotification({ id: 'notification', link })).toBe(false)
  })
  it('suppresses focus auto-read when the native shell has a mark-read activation', async () => {
    Object.assign(window, { jaitDesktop: { getPendingNotification: async () => ({ activation: { id: 'notification', link } }) } })
    expect(await automaticReadAllowed()).toBe(false)
    Object.assign(window, { jaitDesktop: { getPendingNotification: async () => ({ activation: null }) } })
    expect(await automaticReadAllowed()).toBe(true)
  })
})
