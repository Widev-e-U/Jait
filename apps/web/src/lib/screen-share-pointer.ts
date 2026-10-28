/** Map a point in an object-contain video to the displayed image, excluding bars. */
export function screenSharePoint(
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  videoWidth: number,
  videoHeight: number,
  clientX: number,
  clientY: number,
  clamp = false,
): { x: number; y: number } | null {
  if (![rect.left, rect.top, rect.width, rect.height, videoWidth, videoHeight, clientX, clientY].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0 || videoWidth <= 0 || videoHeight <= 0) return null
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight)
  const width = videoWidth * scale
  const height = videoHeight * scale
  const left = rect.left + (rect.width - width) / 2
  const top = rect.top + (rect.height - height) / 2
  const x = (clientX - left) / width
  const y = (clientY - top) / height
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
}
