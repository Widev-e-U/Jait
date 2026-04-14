import { toast } from 'sonner'

export interface SystemNotificationInput {
  id: string
  title: string
  body: string
  level?: 'info' | 'success' | 'warning' | 'error'
  includeToast?: boolean
}

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

  if (window.jaitDesktop?.notify) {
    await window.jaitDesktop.notify({ title: notif.title, body: notif.body })
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
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(notif.title, { body: notif.body, tag: notif.id })
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission()
          if (perm === 'granted') {
            new Notification(notif.title, { body: notif.body, tag: notif.id })
          }
        }
      }
    }
  } else if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(notif.title, { body: notif.body, tag: notif.id })
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') {
        new Notification(notif.title, { body: notif.body, tag: notif.id })
      }
    }
  }

  if (notif.includeToast) {
    const toastFn = notif.level === 'error' ? toast.error
      : notif.level === 'warning' ? toast.warning
      : notif.level === 'success' ? toast.success
      : toast.info
    toastFn(notif.title, { description: notif.body })
  }
}
