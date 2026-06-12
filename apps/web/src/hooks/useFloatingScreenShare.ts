import { useCallback, useEffect, useRef, useState } from 'react'

import {
  clampFloatingScreenSharePosition,
  clampFloatingScreenShareSize,
  getDefaultFloatingScreenSharePosition,
} from '@/lib/floating-screen-share'

export interface UseFloatingScreenShareOptions {
  /** Whether the floating screen-share window is currently shown. */
  showScreenShare: boolean
}

/**
 * Owns the floating screen-share window's position/size and the pointer-driven
 * drag/resize interactions, including viewport clamping and cleanup. Extracted
 * from the `App` god component as a self-contained UI-geometry concern; `App`
 * still owns the `showScreenShare` toggle and passes it in.
 */
export function useFloatingScreenShare({ showScreenShare }: UseFloatingScreenShareOptions) {
  const [floatingSSPos, setFloatingSSPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 })
  const [floatingSSSize, setFloatingSSSize] = useState<{ w: number; h: number }>({ w: 420, h: 320 })
  const floatingDragRef = useRef<{ pointerId: number; startX: number; startY: number; posX: number; posY: number } | null>(null)
  const floatingResizeRef = useRef<{ pointerId: number; startX: number; startY: number; w: number; h: number } | null>(null)
  const floatingDragCleanupRef = useRef<(() => void) | null>(null)
  const floatingResizeCleanupRef = useRef<(() => void) | null>(null)

  const getFloatingViewport = useCallback(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }), [])

  const getDefaultFloatingPos = useCallback((size = floatingSSSize) => (
    getDefaultFloatingScreenSharePosition({
      size,
      viewport: getFloatingViewport(),
    })
  ), [floatingSSSize, getFloatingViewport])

  const onFloatingDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, [role="button"], a, input, textarea, select')) return
    e.preventDefault()
    const dragTarget = e.currentTarget

    const viewport = getFloatingViewport()
    const nextSize = clampFloatingScreenShareSize({ size: floatingSSSize, viewport })
    const nextPos = floatingSSPos.x < 0 || floatingSSPos.y < 0
      ? getDefaultFloatingPos(nextSize)
      : clampFloatingScreenSharePosition({ position: floatingSSPos, size: nextSize, viewport })

    if (nextSize.w !== floatingSSSize.w || nextSize.h !== floatingSSSize.h) {
      setFloatingSSSize(nextSize)
    }
    if (nextPos.x !== floatingSSPos.x || nextPos.y !== floatingSSPos.y) {
      setFloatingSSPos(nextPos)
    }

    floatingDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      posX: nextPos.x,
      posY: nextPos.y,
    }

    const onMove = (ev: PointerEvent) => {
      if (!floatingDragRef.current || floatingDragRef.current.pointerId !== ev.pointerId) return
      setFloatingSSPos(clampFloatingScreenSharePosition({
        position: {
          x: floatingDragRef.current.posX + ev.clientX - floatingDragRef.current.startX,
          y: floatingDragRef.current.posY + ev.clientY - floatingDragRef.current.startY,
        },
        size: nextSize,
        viewport: getFloatingViewport(),
      }))
    }
    const cleanup = () => {
      if (dragTarget.hasPointerCapture?.(e.pointerId)) {
        dragTarget.releasePointerCapture?.(e.pointerId)
      }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      floatingDragCleanupRef.current = null
    }
    const onUp = (ev: PointerEvent) => {
      if (!floatingDragRef.current || floatingDragRef.current.pointerId !== ev.pointerId) return
      floatingDragRef.current = null
      cleanup()
    }

    if (e.pointerType !== 'touch') {
      document.body.style.cursor = 'move'
    }
    document.body.style.userSelect = 'none'
    floatingDragCleanupRef.current?.()
    floatingDragCleanupRef.current = cleanup
    dragTarget.setPointerCapture?.(e.pointerId)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [floatingSSPos, floatingSSSize, getDefaultFloatingPos, getFloatingViewport])

  const onFloatingResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget

    const viewport = getFloatingViewport()
    const nextSize = clampFloatingScreenShareSize({ size: floatingSSSize, viewport })
    if (nextSize.w !== floatingSSSize.w || nextSize.h !== floatingSSSize.h) {
      setFloatingSSSize(nextSize)
    }

    floatingResizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      w: nextSize.w,
      h: nextSize.h,
    }

    const onMove = (ev: PointerEvent) => {
      if (!floatingResizeRef.current || floatingResizeRef.current.pointerId !== ev.pointerId) return
      const resized = clampFloatingScreenShareSize({
        size: {
          w: floatingResizeRef.current.w + ev.clientX - floatingResizeRef.current.startX,
          h: floatingResizeRef.current.h + ev.clientY - floatingResizeRef.current.startY,
        },
        viewport: getFloatingViewport(),
      })
      setFloatingSSSize(resized)
      setFloatingSSPos((prev) => (
        prev.x < 0 || prev.y < 0
          ? prev
          : clampFloatingScreenSharePosition({
            position: prev,
            size: resized,
            viewport: getFloatingViewport(),
          })
      ))
    }
    const cleanup = () => {
      if (target.hasPointerCapture?.(e.pointerId)) {
        target.releasePointerCapture?.(e.pointerId)
      }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      floatingResizeCleanupRef.current = null
    }
    const onUp = (ev: PointerEvent) => {
      if (!floatingResizeRef.current || floatingResizeRef.current.pointerId !== ev.pointerId) return
      floatingResizeRef.current = null
      cleanup()
    }

    if (e.pointerType !== 'touch') {
      document.body.style.cursor = 'nwse-resize'
    }
    document.body.style.userSelect = 'none'
    floatingResizeCleanupRef.current?.()
    floatingResizeCleanupRef.current = cleanup
    target.setPointerCapture?.(e.pointerId)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [floatingSSSize, getFloatingViewport])

  useEffect(() => {
    if (showScreenShare) return
    floatingDragRef.current = null
    floatingResizeRef.current = null
    floatingDragCleanupRef.current?.()
    floatingResizeCleanupRef.current?.()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [showScreenShare])

  useEffect(() => {
    return () => {
      floatingDragCleanupRef.current?.()
      floatingResizeCleanupRef.current?.()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  useEffect(() => {
    if (!showScreenShare) return

    const syncFloatingScreenShareBounds = () => {
      const viewport = getFloatingViewport()
      let clampedSize: { w: number; h: number } | undefined
      setFloatingSSSize(prev => {
        const next = clampFloatingScreenShareSize({ size: prev, viewport })
        clampedSize = next
        return (next.w === prev.w && next.h === prev.h) ? prev : next
      })
      setFloatingSSPos(prev => {
        if (prev.x < 0 && prev.y < 0) return prev
        const next = clampFloatingScreenSharePosition({
          position: prev,
          size: clampedSize!,
          viewport,
        })
        return (next.x === prev.x && next.y === prev.y) ? prev : next
      })
    }

    syncFloatingScreenShareBounds()
    window.addEventListener('resize', syncFloatingScreenShareBounds)
    return () => window.removeEventListener('resize', syncFloatingScreenShareBounds)
  }, [showScreenShare, getFloatingViewport])

  return {
    floatingSSPos,
    floatingSSSize,
    onFloatingDragStart,
    onFloatingResizeStart,
  }
}
