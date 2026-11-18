import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearNotifications, getNotifications, markAllNotificationsRead, markNotificationsRead, onNotificationRead, recordNotification } from './notification-center'

afterEach(() => clearNotifications())

const record = (id: string) => recordNotification({ id, title: id, body: '', level: 'info' })
const ids = () => getNotifications().map(item => item.id)

describe('notification center', () => {
  it('keeps newest first and lets a repeated id replace the older entry', () => {
    record('a'); record('b')
    record('a')
    expect(ids()).toEqual(['a', 'b'])
  })

  it('removes an entry as soon as it is read, with no clear step', () => {
    record('a'); record('b'); record('c')
    markNotificationsRead(['b'])
    expect(ids()).toEqual(['c', 'a'])
    markAllNotificationsRead()
    expect(ids()).toEqual([])
  })

  it('ignores ids that are not in the list', () => {
    const listener = vi.fn()
    const stop = onNotificationRead(listener)
    record('a')
    markNotificationsRead(['missing'])
    stop()
    expect(ids()).toEqual(['a'])
    expect(listener).not.toHaveBeenCalled()
  })

  it('runs read side effects once per entry that was actually read', () => {
    const listener = vi.fn()
    const stop = onNotificationRead(listener)
    record('a'); record('b')
    markNotificationsRead(['a'])
    markAllNotificationsRead()
    markAllNotificationsRead()
    stop()
    expect(ids()).toEqual([])
    expect(listener.mock.calls.map(([entry]) => entry.id)).toEqual(['a', 'b'])
  })

  it('removes reads handled elsewhere without running read side effects', () => {
    const listener = vi.fn()
    const stop = onNotificationRead(listener)
    record('a')
    markNotificationsRead(['a'], false)
    stop()
    expect(ids()).toEqual([])
    expect(listener).not.toHaveBeenCalled()
  })
})
