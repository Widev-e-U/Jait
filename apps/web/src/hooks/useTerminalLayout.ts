import { useCallback, useRef, useState } from 'react'

const DEFAULT_TERMINAL_HEIGHT = 360

/**
 * Owns the developer-terminal panel's resize geometry: its height and column
 * width plus the mouse-driven drag handles. Extracted from the `App` god
 * component as a self-contained layout concern. `terminalFullscreen` stays in
 * `App` since it is used across the wider layout; this hook exposes
 * `terminalHeightBeforeFullscreenRef` so the fullscreen toggle can save/restore
 * the pre-fullscreen height.
 */
export function useTerminalLayout() {
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const terminalHeightBeforeFullscreenRef = useRef(DEFAULT_TERMINAL_HEIGHT)
  const [terminalColumnWidth, setTerminalColumnWidth] = useState(480)
  const isDragging = useRef(false)

  const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startY = e.clientY
    const startH = terminalHeight
    const maxH = window.innerHeight * 0.9
    const cleanup = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onWindowBlur)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startY - ev.clientY
      setTerminalHeight(Math.min(maxH, Math.max(160, startH + delta)))
    }
    const onUp = () => {
      cleanup()
    }
    const onWindowBlur = () => {
      cleanup()
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onWindowBlur)
  }, [terminalHeight])

  const handleTerminalColumnDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = terminalColumnWidth
    const maxW = window.innerWidth * 0.7
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setTerminalColumnWidth(Math.min(maxW, Math.max(280, startW + delta)))
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', cleanup)
      window.removeEventListener('blur', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', cleanup)
    window.addEventListener('blur', cleanup)
  }, [terminalColumnWidth])

  return {
    terminalHeight,
    setTerminalHeight,
    terminalHeightBeforeFullscreenRef,
    terminalColumnWidth,
    handleTerminalDragStart,
    handleTerminalColumnDragStart,
  }
}
