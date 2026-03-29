/**
 * Lightweight preview-session event bus.
 *
 * The WS handler in App pushes `preview.session` events here; the
 * workspace-panel and dev-preview-panel subscribe to receive them
 * instead of polling.
 */
type PreviewSessionListener = (session: Record<string, unknown>) => void

const listeners = new Set<PreviewSessionListener>()

export function subscribePreviewSession(fn: PreviewSessionListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function emitPreviewSession(session: Record<string, unknown>): void {
  for (const fn of listeners) fn(session)
}
