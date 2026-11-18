import { toast } from 'sonner'
import { safeNotificationLink, type NotificationActivation } from '@jait/shared'
import { getApiUrl } from '@/lib/gateway-url'
import { openNotification, retryNotificationNavigation, pendingNotificationLink, androidNotificationBridge } from '@/lib/notification-navigation'
import type { MessengerStoreApi } from './store'

type ReadAction = { roomId: string; eventId: string; account: string; homeserver: string }
let roomHandler: ((roomId: string) => void) | null = null
let readHandler: ((action: ReadAction) => Promise<boolean>) | null = null

export function messengerReadLink(roomId: string, eventId: string, account: string, homeserver: string) {
  return '/messenger?' + new URLSearchParams({ action: 'mark-read', roomId, eventId, account, homeserver })
}

export function parseMessengerReadLink(link: unknown): ReadAction | null {
  const safe = safeNotificationLink(link)
  if (!safe) return null
  const url = new URL(safe, 'https://jait.invalid')
  if (url.pathname !== '/messenger' || url.searchParams.get('action') !== 'mark-read') return null
  const roomId = url.searchParams.get('roomId'), eventId = url.searchParams.get('eventId')
  const account = url.searchParams.get('account'), homeserver = url.searchParams.get('homeserver')
  if (!roomId?.startsWith('!') || !eventId?.startsWith('$') || !account?.startsWith('@') || !homeserver) return null
  return { roomId, eventId, account, homeserver }
}

/** Called after the ordinary notification gateway-scope check. Null means normal navigation. */
export async function handleMessengerNotification(activation: NotificationActivation): Promise<boolean | null> {
  const action = parseMessengerReadLink(activation.link)
  if (!action) {
    const safe = safeNotificationLink(activation.link)
    if (safe) {
      const url = new URL(safe, 'https://jait.invalid')
      const roomId = url.searchParams.get('roomId')
      if (url.pathname === '/messenger' && roomId?.startsWith('!') && !url.searchParams.has('action')) roomHandler?.(roomId)
    }
    return null
  }
  if (!readHandler) return false
  const accepted = await readHandler(action)
  if (accepted && typeof window !== 'undefined' && parseMessengerReadLink(window.location.pathname + window.location.search)) {
    window.history.replaceState(null, '', '/messenger')
  }
  return accepted
}

/** Lives with the authenticated Matrix store, across Jait page changes. */
export function bindMessengerNotifications(store: MessengerStoreApi): () => void {
  const handler = async (action: ReadAction) => {
    const snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready' || snapshot.session?.userId !== action.account || snapshot.session.homeserver !== action.homeserver) return false
    try { await store.markRead(action.roomId, action.eventId); return true }
    catch { toast.error('Could not mark the message as read. Reconnect to Matrix and try again.'); return false }
  }
  const selectRoom = (roomId: string) => {
    store.selectRoom(roomId)
    window.history.replaceState(null, '', '/messenger?roomId=' + encodeURIComponent(roomId))
  }
  roomHandler = selectRoom
  readHandler = handler
  let previousStatus = store.getSnapshot().status
  const unsubscribe = store.subscribe(() => {
    const status = store.getSnapshot().status
    if (status === 'ready' && previousStatus !== status) retryNotificationNavigation()
    previousStatus = status
  })
  const workerUrl = new URL('/messenger-notifications-sw.js', window.location.origin).href
  const accept = (event: MessageEvent) => {
    if (!event.source || !('scriptURL' in event.source) || event.source.scriptURL !== workerUrl || event.data?.type !== 'jait-notification-open') return
    openNotification(event.data.activation)
  }
  navigator.serviceWorker?.addEventListener('message', accept)
  const initialLink = window.location.pathname + window.location.search
  const initial = parseMessengerReadLink(initialLink)
  if (initial) openNotification({ id: 'matrix:' + initial.eventId, link: initialLink, scope: getApiUrl() || window.location.origin })
  return () => {
    if (readHandler === handler) readHandler = null
    if (roomHandler === selectRoom) roomHandler = null
    unsubscribe()
    navigator.serviceWorker?.removeEventListener('message', accept)
  }
}

/** Native action activation can focus the WebView before its JS event arrives. */
export async function automaticReadAllowed(): Promise<boolean> {
  if (parseMessengerReadLink(pendingNotificationLink())) return false
  const pending = await Promise.all([
    window.jaitDesktop?.getPendingNotification?.(),
    androidNotificationBridge()?.getPendingNotification?.(),
  ])
  return !pending.some(result => parseMessengerReadLink(result?.activation?.link))
}
