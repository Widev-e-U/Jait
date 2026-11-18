import { safeNotificationLink, type NotificationActivation } from '@jait/shared'

let pending: NotificationActivation | null = null
let handler: ((activation: NotificationActivation) => Promise<boolean>) | null = null
let running = false

export function pendingNotificationLink(): string | null { return pending?.link ?? null }

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

type NativeResult<T> = T | PromiseLike<T>

export interface NotificationBridge {
  getPendingNotification?: () => NativeResult<{ activation?: NotificationActivation | null }>
  acknowledgeNotification?: (input: { id: string }) => NativeResult<unknown>
  addListener?: (name: string, callback: (activation: NotificationActivation) => void) => NativeResult<{ remove(): NativeResult<void> }>
  setNotificationContext?: (input: { sessionId: string; visible: boolean }) => NativeResult<unknown>
  cancelNotification?: (input: { id: string; eventId?: string }) => NativeResult<unknown>
}

/** Keep native bridge methods that return synchronously from crashing notification setup. */
export function setAndroidNotificationContext(
  bridge: NotificationBridge | undefined,
  input: { sessionId: string; visible: boolean },
): void {
  if (!bridge?.setNotificationContext) return
  void Promise.resolve().then(() => bridge.setNotificationContext!(input)).catch(() => {})
}

export function watchAndroidNotifications(
  bridge: NotificationBridge | undefined,
  accept: (activation: NotificationActivation) => void,
): { read: () => void; dispose: () => void } {
  let disposed = false
  let removeListener: (() => NativeResult<void>) | undefined

  if (bridge?.addListener) {
    void Promise.resolve().then(() => bridge.addListener!('notificationOpen', accept)).then((listener) => {
      if (disposed) void Promise.resolve().then(() => listener.remove()).catch(() => {})
      else removeListener = () => listener.remove()
    }).catch(() => {})
  }

  const read = () => {
    if (!bridge?.getPendingNotification) return
    void Promise.resolve().then(() => bridge.getPendingNotification!()).then((result) => {
      if (!disposed && result?.activation) accept(result.activation)
    }).catch(() => {})
  }

  return {
    read,
    dispose: () => {
      disposed = true
      if (removeListener) void Promise.resolve().then(removeListener).catch(() => {})
    },
  }
}

export function androidNotificationBridge(): NotificationBridge | undefined {
  return (window.Capacitor as { Plugins?: { AgentOverlay?: NotificationBridge } } | undefined)?.Plugins?.AgentOverlay
}
