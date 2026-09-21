import { safeNotificationLink, type NotificationActivation } from '@jait/shared'

let pending: NotificationActivation | null = null
let handler: ((activation: NotificationActivation) => Promise<boolean>) | null = null
let running = false

export function openNotification(activation: NotificationActivation): void {
  const link = safeNotificationLink(activation.link)
  if (!link) return
  if (pending?.id === activation.id && pending.link === link && pending.scope === activation.scope) {
    void drain()
    return
  }
  pending = { ...activation, link }
  void drain()
}

async function drain(): Promise<void> {
  if (running || !handler || !pending) return
  running = true
  const next = pending
  try {
    if (await handler(next)) {
      if (pending === next) pending = null
    }
  } catch {
    // Network/bootstrap failures retain the destination for a later retry.
  } finally {
    running = false
    if (pending && pending !== next) void drain()
  }
}

/** Subscribe only once auth and project restoration are ready. Failed/offline opens remain pending. */
export function subscribeNotificationNavigation(callback: NonNullable<typeof handler>): () => void {
  handler = callback
  void drain()
  return () => { if (handler === callback) handler = null }
}

export function retryNotificationNavigation(): void { void drain() }

export interface NotificationBridge {
  getPendingNotification?: () => Promise<{ activation?: NotificationActivation | null }>
  acknowledgeNotification?: (input: { id: string }) => Promise<unknown>
  addListener?: (name: string, callback: (activation: NotificationActivation) => void) => Promise<{ remove(): Promise<void> }>
  setNotificationContext?: (input: { sessionId: string; visible: boolean }) => Promise<unknown>
  cancelNotification?: (input: { id: string }) => Promise<unknown>
}

export function androidNotificationBridge(): NotificationBridge | undefined {
  return (window.Capacitor as { Plugins?: { AgentOverlay?: NotificationBridge } } | undefined)?.Plugins?.AgentOverlay
}
