import { safeNotificationLink, type NotificationContext } from '@jait/shared'
import { openNotification, androidNotificationBridge } from './notification-navigation'
import { getApiUrl } from './gateway-url'
import { toast } from 'sonner'

export interface SystemNotificationInput extends NotificationContext {
  id: string
  title: string
  body: string
  level?: 'info' | 'success' | 'warning' | 'error'
  includeToast?: boolean
}

type BrowserNotificationCtor = typeof Notification

// Without an explicit icon, Chrome (and other browsers) show their own logo on
// web notifications. Point at the Jait app icons so notifications are branded.
const NOTIFICATION_ICON = '/apple-touch-icon.png'
const NOTIFICATION_BADGE = '/favicon-32x32.png'

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/**
 * Whether this client owns the OS-level notification for its machine. The
 * gateway sets it from live client presence (`attention.raised.native`): when
 * the Desktop app is connected, browser tabs on the same PC drop to in-app
 * toasts only so one request never produces two system notifications.
 *
 * Defaults to true — a client that has not heard otherwise must still notify.
 */
let nativeNotificationsEnabled = true
let visibleSessionId: string | null = null
export function setVisibleNotificationSession(sessionId: string | null): void { visibleSessionId = sessionId }
const seenEvents = new Set<string>()

export function setNativeNotificationsEnabled(enabled: boolean): void {
  nativeNotificationsEnabled = enabled
}

export function isNativeNotificationsEnabled(): boolean {
  return nativeNotificationsEnabled
}

/**
 * Browser notifications shown by this tab, keyed by notification id. The
 * `tag` option already collapses duplicates, but only a live handle can be
 * closed when another device answers first.
 */
const liveBrowserNotifications = new Map<string, Notification>()

export function normalizeSystemNotification(input: SystemNotificationInput): (SystemNotificationInput & {
  title: string
  body: string
}) | null {
  const rawTitle = input.title.trim()
  const rawBody = input.body.trim()
  if (!rawTitle && !rawBody) return null
  const title = rawTitle || rawBody
  const body = rawTitle ? rawBody : ''
  return {
    ...input,
    title,
    body,
  }
}

async function notifyWithBrowserApi(
  NotificationCtor: BrowserNotificationCtor | undefined,
  notif: {
    id: string
    title: string
    body: string
    link?: string
  },
): Promise<void> {
  if (!NotificationCtor) return

  const options: NotificationOptions = {
    body: notif.body,
    tag: notif.id,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
  }

  if (NotificationCtor.permission === 'granted') {
    trackBrowserNotification(notif.id, new NotificationCtor(notif.title, options), notif.link)
    return
  }

  if (NotificationCtor.permission === 'denied') return

  const permission = await NotificationCtor.requestPermission()
  if (permission === 'granted') {
    trackBrowserNotification(notif.id, new NotificationCtor(notif.title, options), notif.link)
  }
}

function trackBrowserNotification(id: string, notification: Notification, link?: string): void {
  liveBrowserNotifications.get(id)?.close()
  liveBrowserNotifications.set(id, notification)
  const forget = () => {
    if (liveBrowserNotifications.get(id) === notification) liveBrowserNotifications.delete(id)
  }
  notification.addEventListener('close', forget)
  notification.addEventListener('click', () => {
    window.focus?.()
    if (link) openNotification({ id, link })
    notification.close()
    forget()
  })
}

/**
 * Pull down a notification this client previously raised, because the same
 * request was answered on another device. Best-effort on every transport —
 * a notification the user already dismissed is simply not there to close.
 */
export async function revokeSystemNotification(id: string): Promise<void> {
  const browserNotification = liveBrowserNotifications.get(id)
  if (browserNotification) {
    liveBrowserNotifications.delete(id)
    try { browserNotification.close() } catch { /* already gone */ }
  }

  try { await androidNotificationBridge()?.cancelNotification?.({ id }) } catch { /* already gone */ }
  const desktop = window.jaitDesktop
  if (desktop?.closeNotification) {
    try { await desktop.closeNotification(id) } catch { /* already gone */ }
  }

  const capacitorLocalNotifications = capacitorNotifications()
  if (capacitorLocalNotifications?.cancel) {
    try {
      await capacitorLocalNotifications.cancel({ notifications: [{ id: Math.abs(hashCode(id)) }] })
    } catch { /* already gone */ }
  }
}

interface CapacitorLocalNotifications {
  requestPermissions?: () => Promise<{ display?: 'granted' | 'denied' | 'prompt' }>
  schedule?: (options: {
    notifications: Array<{
      id: number
      title: string
      body: string
      schedule: { at: Date }
    }>
  }) => Promise<unknown>
  cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<unknown>
}

function capacitorNotifications(): CapacitorLocalNotifications | undefined {
  return (window.Capacitor as {
    Plugins?: { LocalNotifications?: CapacitorLocalNotifications }
  } | undefined)?.Plugins?.LocalNotifications
}

export async function triggerSystemNotification(input: SystemNotificationInput): Promise<void> {
  const normalized = normalizeSystemNotification(input)
  if (!normalized) return

  const notif = {
    level: 'info' as const,
    includeToast: true,
    ...normalized,
  }
  if (notif.kind === 'completion') {
    if (seenEvents.has(notif.id)) return
    seenEvents.add(notif.id)
    if (seenEvents.size > 256) seenEvents.delete(seenEvents.values().next().value!)
    if (notif.sessionId === visibleSessionId && typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) {
      await revokeSystemNotification(notif.replaceId ?? notif.id)
      return
    }
  }
  const link = safeNotificationLink(notif.link)
  const nativeInput = {
    id: notif.id, title: notif.title, body: notif.body,
    ...(link ? { link, scope: getApiUrl() || window.location?.origin || '' } : {}),
    ...(notif.replaceId ? { replaceId: notif.replaceId } : {}),
    ...(notif.sessionId ? { sessionId: notif.sessionId } : {}),
    ...(notif.kind ? { kind: notif.kind } : {}),
  }
  const browserInput = { ...nativeInput, id: notif.replaceId ?? notif.id }
  const capacitorLocalNotifications = capacitorNotifications()
  const browserNotification = 'Notification' in window ? window.Notification : undefined
  const android = (window.Capacitor as { Plugins?: { AgentOverlay?: {
    notify?: (input: { id: string; title: string; body: string }) => Promise<unknown>
  } } } | undefined)?.Plugins?.AgentOverlay

  // Another surface on this machine owns the system toast — show the in-app
  // toast only, so the user is told once per device rather than once per client.
  if (!nativeNotificationsEnabled) {
    emitToast(notif)
    return
  }

  if (window.jaitDesktop?.notify) {
    try {
      await window.jaitDesktop.notify(nativeInput)
    } catch {
      await notifyWithBrowserApi(browserNotification, browserInput)
    }
  } else if (android?.notify) {
    try {
      await android.notify(nativeInput)
    } catch { /* The in-app toast remains available if Android notifications are disabled. */ }
  } else if (capacitorLocalNotifications) {
    try {
      const perm = await capacitorLocalNotifications.requestPermissions?.()
      if (perm?.display === 'granted') {
        await capacitorLocalNotifications.schedule?.({
          notifications: [{
            id: Math.abs(hashCode(notif.id)),
            title: notif.title,
            body: notif.body,
            schedule: { at: new Date() },
          }],
        })
      } else {
        throw new Error('notification permission denied')
      }
    } catch {
      await notifyWithBrowserApi(browserNotification, browserInput)
    }
  } else {
    await notifyWithBrowserApi(browserNotification, browserInput)
  }

  emitToast(notif)
}

function emitToast(notif: SystemNotificationInput): void {
  if (!notif.includeToast) return
  const toastFn = notif.level === 'error' ? toast.error
    : notif.level === 'warning' ? toast.warning
    : notif.level === 'success' ? toast.success
    : toast.info
  const link = safeNotificationLink(notif.link)
  toastFn(notif.title, { description: notif.body, ...(link ? { action: {
    label: 'Open', onClick: () => openNotification({ id: notif.replaceId ?? notif.id, link }),
  } } : {}) })
}
