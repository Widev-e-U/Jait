import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const SCROLL_EDGE_PX = 48
const SCROLL_STEP_PX = 10

/**
 * Pointer-driven drag for touch screens, where HTML5 drag-and-drop never fires.
 * The caller decides what a drop on each `[data-dnd-key]` element means; this
 * hook tracks the finger, previews the pending action, auto-scrolls the list
 * and commits on release.
 */
export function useTouchSidebarDrag<Source extends { label: string }, Action>({
  resolve,
  onPreview,
  onCommit,
}: {
  resolve: (source: Source, key: string | null, rect: DOMRect | null, clientY: number) => Action | null
  onPreview: (action: Action | null) => void
  onCommit: (action: Action) => void
}) {
  const [active, setActive] = useState<{ source: Source; x: number; y: number } | null>(null)
  const latest = useRef({ resolve, onPreview, onCommit })
  latest.current = { resolve, onPreview, onCommit }
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])

  const start = useCallback((source: Source, event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    cleanupRef.current?.()
    const handle = event.currentTarget
    const viewport = handle.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
    let x = event.clientX
    let y = event.clientY
    let action: Action | null = null
    let frame = 0
    setActive({ source, x, y })

    const evaluate = () => {
      const key = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-dnd-key]') ?? null
      action = latest.current.resolve(source, key?.dataset.dndKey ?? null, key?.getBoundingClientRect() ?? null, y)
      latest.current.onPreview(action)
    }
    const tick = () => {
      if (viewport) {
        const rect = viewport.getBoundingClientRect()
        if (y < rect.top + SCROLL_EDGE_PX) viewport.scrollTop -= SCROLL_STEP_PX
        else if (y > rect.bottom - SCROLL_EDGE_PX) viewport.scrollTop += SCROLL_STEP_PX
      }
      evaluate()
      frame = requestAnimationFrame(tick)
    }
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      setActive({ source, x, y })
    }
    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      cleanupRef.current = null
      setActive(null)
      const pending = action
      latest.current.onPreview(null)
      if (commit && pending) latest.current.onCommit(pending)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    cleanupRef.current = () => finish(false)
    frame = requestAnimationFrame(tick)
  }, [])

  return { active, start }
}
