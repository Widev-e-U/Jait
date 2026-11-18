import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
const activation = { id: 'chat-complete:alpha', link: '/chat?sessionId=alpha' }

it('retains cold-start taps until navigation is ready and consumes once', async () => {
  const nav = await import('./notification-navigation')
  nav.openNotification(activation)
  const handler = vi.fn(async () => true)
  const unsubscribe = nav.subscribeNotificationNavigation(handler)
  await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
  nav.retryNotificationNavigation()
  expect(handler).toHaveBeenCalledOnce()
  unsubscribe()
})

it('retains failed or offline destinations for retry', async () => {
  const nav = await import('./notification-navigation')
  const handler = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(false).mockResolvedValue(true)
  const unsubscribe = nav.subscribeNotificationNavigation(handler)
  nav.openNotification(activation)
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
  nav.retryNotificationNavigation()
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
  nav.retryNotificationNavigation()
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(3))
  nav.retryNotificationNavigation()
  expect(handler).toHaveBeenCalledTimes(3)
  unsubscribe()
})

it('coalesces native pending reads but preserves a newer tap during a load', async () => {
  const nav = await import('./notification-navigation')
  let finish!: (opened: boolean) => void
  const handler = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve })).mockResolvedValue(true)
  const unsubscribe = nav.subscribeNotificationNavigation(handler)
  nav.openNotification(activation)
  nav.openNotification({ ...activation })
  expect(handler).toHaveBeenCalledOnce()
  const second = { id: 'chat-complete:beta', link: '/chat?sessionId=beta' }
  nav.openNotification(second)
  finish(true)
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
  expect(handler).toHaveBeenLastCalledWith(second)
  unsubscribe()
})

it('ignores arbitrary external activation URLs', async () => {
  const nav = await import('./notification-navigation')
  const handler = vi.fn(async () => true)
  const unsubscribe = nav.subscribeNotificationNavigation(handler)
  nav.openNotification({ id: 'untrusted', link: 'https://evil.test' })
  expect(handler).not.toHaveBeenCalled()
  unsubscribe()
})

it.each(['synchronous', 'promise'])('handles %s Android notification bridge results', async (mode) => {
  const nav = await import('./notification-navigation')
  const accept = vi.fn()
  const remove = vi.fn()
  const result = <T>(value: T) => mode === 'promise' ? Promise.resolve(value) : value
  const bridge = {
    addListener: vi.fn(() => result({ remove })),
    getPendingNotification: vi.fn(() => result({ activation })),
    setNotificationContext: vi.fn(() => result(undefined)),
  }

  const watcher = nav.watchAndroidNotifications(bridge, accept)
  nav.setAndroidNotificationContext(bridge, { sessionId: 'alpha', visible: true })
  watcher.read()
  await vi.waitFor(() => expect(accept).toHaveBeenCalledWith(activation))
  expect(bridge.setNotificationContext).toHaveBeenCalledWith({ sessionId: 'alpha', visible: true })
  watcher.dispose()
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
})

it('removes an Android listener that resolves after disposal', async () => {
  const nav = await import('./notification-navigation')
  const remove = vi.fn()
  let resolve!: (listener: { remove: typeof remove }) => void
  const bridge = { addListener: () => new Promise<{ remove: typeof remove }>(r => { resolve = r }) }
  const watcher = nav.watchAndroidNotifications(bridge, vi.fn())
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
  watcher.dispose()
  resolve({ remove })
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
})
