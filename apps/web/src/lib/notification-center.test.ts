import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearNotifications, getNotifications, markAllNotificationsRead, markNotificationsRead, onNotificationRead, recordNotification } from './notification-center'

afterEach(() => clearNotifications())

const record = (id: string) => recordNotification({ id, title: id, body: '', level: 'info' })

describe('notification center', () => {
  it('keeps newest first and replaces a repeated id as unread', () => {
    record('a'); record('b')
    markNotificationsRead(['a'])
    record('a')
    expect(getNotifications().map(item => [item.id, item.read])).toEqual([['a', false], ['b', false]])
  })

  it('marks all unread entries read once, running read side effects', () => {
    const listener = vi.fn()
    const stop = onNotificationRead(listener)
    record('a'); record('b')
    markNotificationsRead(['a'])
    markAllNotificationsRead()
    markAllNotificationsRead()
    stop()
    expect(getNotifications().every(item => item.read)).toBe(true)
    expect(listener.mock.calls.map(([entry]) => entry.id)).toEqual(['a', 'b'])
  })

  it('skips read side effects for reads handled elsewhere', () => {
    const listener = vi.fn()
    const stop = onNotificationRead(listener)
    record('a')
    markNotificationsRead(['a'], false)
    stop()
    expect(getNotifications()[0]!.read).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })
})
