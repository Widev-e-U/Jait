import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getApiUrl } from '@/lib/gateway-url'
import { bindMessengerNotifications } from '@/lib/messenger/notification-actions'
import type { MessengerSnapshot } from '@/lib/messenger/model'
import type { MessengerStoreApi } from '@/lib/messenger/store'
import { GatewayMessengerStore } from '@/lib/messenger/gateway-store'

export const MessengerContext = createContext<MessengerStoreApi | null>(null)

export function MessengerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const owner = user ? getApiUrl() + '|' + user.id : null
  const store = useMemo(() => owner ? new GatewayMessengerStore(owner) : null, [owner])
  useEffect(() => {
    if (!store) return
    const unbind = bindMessengerNotifications(store)
    void store.resume().catch(() => {})
    return () => { unbind(); store.dispose() }
  }, [store])
  return <MessengerContext.Provider value={store}>{children}</MessengerContext.Provider>
}

export function useMessenger() {
  const store = useContext(MessengerContext)
  if (!store) throw new Error('Sign in to Jait to use Messenger.')
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { store, snapshot }
}

const EMPTY_SNAPSHOT: MessengerSnapshot = { status: 'disconnected', error: null, session: null, rooms: [], messages: [], selectedRoomId: null, notifications: false, assistantAccess: false }
const noSubscribe = () => () => {}
const emptySnapshot = () => EMPTY_SNAPSHOT
const preferenceEvent = 'jait-messenger-badge-preference'

/** The exclusion is local to this browser and Matrix account. */
export function useMessengerBadge() {
  const store = useContext(MessengerContext)
  const snapshot = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getSnapshot ?? emptySnapshot, store?.getSnapshot ?? emptySnapshot)
  const session = snapshot.session
  const key = session ? 'jait.messenger.badge-excluded.' + [getApiUrl(), session.homeserver, session.userId].map(encodeURIComponent).join('.') : null
  const subscribe = (listener: () => void) => {
    window.addEventListener('storage', listener)
    window.addEventListener(preferenceEvent, listener)
    return () => { window.removeEventListener('storage', listener); window.removeEventListener(preferenceEvent, listener) }
  }
  const read = () => { try { return key ? localStorage.getItem(key) ?? '[]' : '[]' } catch { return '[]' } }
  const raw = useSyncExternalStore(subscribe, read, () => '[]')
  let excluded: string[] = []
  try { const parsed: unknown = JSON.parse(raw); if (Array.isArray(parsed)) excluded = parsed.filter((id): id is string => typeof id === 'string') } catch { /* Ignore malformed preferences. */ }
  const setExcluded = (id: string, exclude: boolean) => {
    if (!key) return
    const next = exclude ? [...new Set([...excluded, id])] : excluded.filter(value => value !== id)
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event(preferenceEvent)) } catch { /* Storage may be unavailable. */ }
  }
  const count = snapshot.rooms.reduce((sum, room) => sum + (excluded.includes(room.id) || room.kind === 'team' ? 0 : Math.max(room.unread || 0, room.markedUnread ? 1 : 0)), 0)
  return { count, excluded, setExcluded }
}
