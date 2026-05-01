import { toast } from 'sonner'

export interface SystemNotificationInput {
  id: string
  title: string
  body: string
  level?: 'info' | 'success' | 'warning' | 'error'
  includeToast?: boolean
}

type BrowserNotificationCtor = typeof Notification

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

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
  },
): Promise<void> {
  if (!NotificationCtor) return

  if (NotificationCtor.permission === 'granted') {
    new NotificationCtor(notif.title, { body: notif.body, tag: notif.id })
    return
  }

  if (NotificationCtor.permission === 'denied') return

  const permission = await NotificationCtor.requestPermission()
  if (permission === 'granted') {
    new NotificationCtor(notif.title, { body: notif.body, tag: notif.id })
  }
}

export async function triggerSystemNotification(input: SystemNotificationInput): Promise<void> {
  const normalized = normalizeSystemNotification(input)
  if (!normalized) return

  const notif = {
    level: 'info' as const,
    includeToast: true,
    ...normalized,
  }
  const capacitorLocalNotifications = (window.Capacitor as {
    Plugins?: {
      LocalNotifications?: {
        requestPermissions?: () => Promise<{ display?: 'granted' | 'denied' | 'prompt' }>
        schedule?: (options: {
          notifications: Array<{
            id: number
            title: string
            body: string
            schedule: { at: Date }
          }>
        }) => Promise<unknown>
      }
    }
  } | undefined)?.Plugins?.LocalNotifications
  const browserNotification = 'Notification' in window ? window.Notification : undefined

  if (window.jaitDesktop?.notify) {
    try {
      await window.jaitDesktop.notify({ title: notif.title, body: notif.body })
    } catch {
      await notifyWithBrowserApi(browserNotification, notif)
    }
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
      await notifyWithBrowserApi(browserNotification, notif)
    }
  } else {
    await notifyWithBrowserApi(browserNotification, notif)
  }

  if (notif.includeToast) {
    const toastFn = notif.level === 'error' ? toast.error
      : notif.level === 'warning' ? toast.warning
      : notif.level === 'success' ? toast.success
      : toast.info
    toastFn(notif.title, { description: notif.body })
  }
}
