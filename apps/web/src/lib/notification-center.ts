import { useSyncExternalStore } from 'react'

/** An unread notification. Reading or viewing it removes the entry from the list. */
export interface NotificationEntry {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'error'
  link?: string
  markReadLink?: string
  createdAt: number
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

/** Records an unread notification; a repeated id replaces the older entry. */
export function recordNotification(entry: Omit<NotificationEntry, 'createdAt'> & { createdAt?: number }): void {
  publish([
    { ...entry, createdAt: entry.createdAt ?? Date.now() },
    ...entries.filter(item => item.id !== entry.id),
  ].slice(0, MAX_ENTRIES))
}

/**
 * Reading or viewing a notification removes it, so the list holds only unread
 * entries and needs no separate clear step. `notify` runs the read side effects
 * (toast dismissal, Matrix read receipts); it is off when another device or the
 * opened view already handled the read.
 */
export function markNotificationsRead(ids: Iterable<string>, notify = true): void {
  const wanted = new Set(ids)
  const read = entries.filter(item => wanted.has(item.id))
  if (!read.length) return
  publish(entries.filter(item => !wanted.has(item.id)))
  if (notify) for (const entry of read) for (const listener of readListeners) listener(entry)
}

export function markAllNotificationsRead(): void {
  markNotificationsRead(entries.map(item => item.id))
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
