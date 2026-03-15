export interface FloatingScreenShareSize {
  w: number
  h: number
}

export interface FloatingScreenSharePosition {
  x: number
  y: number
}

interface FloatingScreenShareViewport {
  width: number
  height: number
}

const DEFAULT_MARGIN = 16
const MIN_WIDTH = 280
const MIN_HEIGHT = 200

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function clampFloatingScreenShareSize({
  size,
  viewport,
  margin = DEFAULT_MARGIN,
}: {
  size: FloatingScreenShareSize
  viewport: FloatingScreenShareViewport
  margin?: number
}): FloatingScreenShareSize {
  const maxWidth = Math.max(220, viewport.width - margin * 2)
  const maxHeight = Math.max(160, viewport.height - margin * 2)
  const minWidth = Math.min(MIN_WIDTH, maxWidth)
  const minHeight = Math.min(MIN_HEIGHT, maxHeight)

  return {
    w: clamp(size.w, minWidth, maxWidth),
    h: clamp(size.h, minHeight, maxHeight),
  }
}

export function clampFloatingScreenSharePosition({
  position,
  size,
  viewport,
}: {
  position: FloatingScreenSharePosition
  size: FloatingScreenShareSize
  viewport: FloatingScreenShareViewport
}): FloatingScreenSharePosition {
  return {
    x: clamp(position.x, 0, Math.max(0, viewport.width - size.w)),
    y: clamp(position.y, 0, Math.max(0, viewport.height - size.h)),
  }
}

export function getDefaultFloatingScreenSharePosition({
  size,
  viewport,
  margin = DEFAULT_MARGIN,
}: {
  size: FloatingScreenShareSize
  viewport: FloatingScreenShareViewport
  margin?: number
}): FloatingScreenSharePosition {
  return clampFloatingScreenSharePosition({
    position: {
      x: viewport.width - size.w - margin,
      y: viewport.height - size.h - margin,
    },
    size,
    viewport,
  })
}
