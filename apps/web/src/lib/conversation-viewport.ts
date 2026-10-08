import { observeElementRect, type Rect, type Virtualizer } from '@tanstack/react-virtual'

/** Recheck a suspended chat's viewport even if its ResizeObserver missed the restore. */
export function observeConversationRect(
  instance: Virtualizer<HTMLDivElement, Element>,
  onRect: (rect: Rect) => void,
): (() => void) | undefined {
  const stopObserving = observeElementRect(instance, onRect)
  const element = instance.scrollElement
  const targetWindow = instance.targetWindow
  if (!element || !targetWindow) return stopObserving
  const document = element.ownerDocument
  let frame: number | null = null

  const recover = () => {
    if (document.visibilityState !== 'visible') return
    if (frame !== null) targetWindow.cancelAnimationFrame(frame)
    frame = targetWindow.requestAnimationFrame(() => {
      frame = null
      const width = element.offsetWidth
      const height = element.offsetHeight
      // A collapsed panel still has no viewport. Its normal resize observer
      // will report when it opens; a wake event must not invent a size for it.
      if (width > 0 && height > 0) onRect({ width, height })
    })
  }

  document.addEventListener('visibilitychange', recover)
  targetWindow.addEventListener('focus', recover)
  targetWindow.addEventListener('pageshow', recover)
  return () => {
    stopObserving?.()
    if (frame !== null) targetWindow.cancelAnimationFrame(frame)
    document.removeEventListener('visibilitychange', recover)
    targetWindow.removeEventListener('focus', recover)
    targetWindow.removeEventListener('pageshow', recover)
  }
}
