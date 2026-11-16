import { useSyncExternalStore } from 'react'

export interface NotificationEntry {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'error'
  link?: string
  markReadLink?: string
  createdAt: number
  read: boolean
}

type ReadListener = (entry: NotificationEntry) => void

const MAX_ENTRIES = 50
let entries: NotificationEntry[] = []
const listeners = new Set<() => void>()
const readListeners = new Set<ReadListener>()

function publish(next: NotificationEntry[]): void {
  entries = next
  for (const listener of listeners) listener()
}

/** Records a notification; a repeated id replaces the older entry and is unread again. */
export function recordNotification(entry: Omit<NotificationEntry, 'createdAt' | 'read'> & { createdAt?: number }): void {
  publish([
    { ...entry, createdAt: entry.createdAt ?? Date.now(), read: false },
    ...entries.filter(item => item.id !== entry.id),
  ].slice(0, MAX_ENTRIES))
}

/**
 * Marks entries read. `notify` runs the read side effects (toast dismissal,
 * Matrix read receipts); it is off when another device already handled it.
 */
export function markNotificationsRead(ids: Iterable<string>, notify = true): void {
  const wanted = new Set(ids)
  const changed: NotificationEntry[] = []
  const next = entries.map(item => {
    if (item.read || !wanted.has(item.id)) return item
    const read = { ...item, read: true }
    changed.push(read)
    return read
  })
  if (!changed.length) return
  publish(next)
  if (notify) for (const entry of changed) for (const listener of readListeners) listener(entry)
}

export function markAllNotificationsRead(): void {
  markNotificationsRead(entries.filter(item => !item.read).map(item => item.id))
}

export function clearNotifications(): void {
  publish([])
}

export function onNotificationRead(listener: ReadListener): () => void {
  readListeners.add(listener)
  return () => { readListeners.delete(listener) }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getNotifications(): NotificationEntry[] {
  return entries
}

export function useNotifications(): NotificationEntry[] {
  return useSyncExternalStore(subscribe, getNotifications, getNotifications)
}
