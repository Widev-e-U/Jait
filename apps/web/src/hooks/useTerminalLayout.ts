import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const DEFAULT_TERMINAL_HEIGHT = 360
const DEFAULT_TERMINAL_COLUMN_WIDTH = 480

export interface TerminalLayoutState {
  terminalHeight: number
  terminalColumnWidth: number
}

interface UseTerminalLayoutOptions {
  projectId?: string | null
  savedHeight?: number | null
  savedColumnWidth?: number | null
  onLayoutChange?: (layout: TerminalLayoutState) => void
}

function clampTerminalHeight(height: number) {
  const maxHeight = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerHeight * 0.9
  return Math.min(maxHeight, Math.max(160, height))
}

function clampTerminalColumnWidth(width: number) {
  const maxWidth = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth * 0.7
  return Math.min(maxWidth, Math.max(280, width))
}

/**
 * Owns the developer-terminal panel's resize geometry. Persisted dimensions
 * are project-scoped and reported only once at drag end.
 */
export function useTerminalLayout({
  projectId = null,
  savedHeight = null,
  savedColumnWidth = null,
  onLayoutChange,
}: UseTerminalLayoutOptions = {}) {
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const terminalHeightBeforeFullscreenRef = useRef(DEFAULT_TERMINAL_HEIGHT)
  const [terminalColumnWidth, setTerminalColumnWidth] = useState(DEFAULT_TERMINAL_COLUMN_WIDTH)
  const terminalHeightRef = useRef(terminalHeight)
  const terminalColumnWidthRef = useRef(terminalColumnWidth)
  const isDragging = useRef(false)
  const userResizedRef = useRef(false)
  const onLayoutChangeRef = useRef(onLayoutChange)

  terminalHeightRef.current = terminalHeight
  terminalColumnWidthRef.current = terminalColumnWidth
  onLayoutChangeRef.current = onLayoutChange

  useLayoutEffect(() => {
    userResizedRef.current = false
    terminalHeightRef.current = DEFAULT_TERMINAL_HEIGHT
    terminalColumnWidthRef.current = DEFAULT_TERMINAL_COLUMN_WIDTH
    terminalHeightBeforeFullscreenRef.current = DEFAULT_TERMINAL_HEIGHT
    setTerminalHeight(DEFAULT_TERMINAL_HEIGHT)
    setTerminalColumnWidth(DEFAULT_TERMINAL_COLUMN_WIDTH)
  }, [projectId])

  useEffect(() => {
    if (userResizedRef.current || savedHeight == null || !Number.isFinite(savedHeight)) return
    const nextHeight = clampTerminalHeight(savedHeight)
    terminalHeightRef.current = nextHeight
    terminalHeightBeforeFullscreenRef.current = nextHeight
    setTerminalHeight(nextHeight)
  }, [projectId, savedHeight])

  useEffect(() => {
    if (userResizedRef.current || savedColumnWidth == null || !Number.isFinite(savedColumnWidth)) return
    const nextWidth = clampTerminalColumnWidth(savedColumnWidth)
    terminalColumnWidthRef.current = nextWidth
    setTerminalColumnWidth(nextWidth)
  }, [projectId, savedColumnWidth])

  const reportLayout = useCallback(() => {
    onLayoutChangeRef.current?.({
      terminalHeight: terminalHeightRef.current,
      terminalColumnWidth: terminalColumnWidthRef.current,
    })
  }, [])

  const handleTerminalDragStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    isDragging.current = true
    userResizedRef.current = true
    const startY = event.clientY
    const startHeight = terminalHeightRef.current
    let moved = false
    const cleanup = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onWindowBlur)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (moved) reportLayout()
    }
    const onMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return
      moved = true
      const nextHeight = clampTerminalHeight(startHeight + startY - moveEvent.clientY)
      terminalHeightRef.current = nextHeight
      setTerminalHeight(nextHeight)
    }
    const onUp = () => cleanup()
    const onWindowBlur = () => cleanup()
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onWindowBlur)
  }, [reportLayout])

  const handleTerminalColumnDragStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    userResizedRef.current = true
    const startX = event.clientX
    const startWidth = terminalColumnWidthRef.current
    let moved = false
    const onMove = (moveEvent: MouseEvent) => {
      moved = true
      const nextWidth = clampTerminalColumnWidth(startWidth + moveEvent.clientX - startX)
      terminalColumnWidthRef.current = nextWidth
      setTerminalColumnWidth(nextWidth)
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', cleanup)
      window.removeEventListener('blur', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (moved) reportLayout()
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', cleanup)
    window.addEventListener('blur', cleanup)
  }, [reportLayout])

  return {
    terminalHeight,
    setTerminalHeight,
    terminalHeightBeforeFullscreenRef,
    terminalColumnWidth,
    handleTerminalDragStart,
    handleTerminalColumnDragStart,
  }
}
