export interface BrowserWindowBox { left: number; top: number; width: number; height: number }
interface Frame { width: number; height: number; top: number }

export function constrainBrowserWindow(box: BrowserWindowBox, frame: Frame): BrowserWindowBox {
  const inset = Math.min(12, frame.width / 2)
  const top = Math.min(frame.top, Math.max(0, frame.height - 90))
  const width = Math.min(Math.max(320, box.width), Math.max(0, frame.width - inset * 2))
  const height = Math.min(Math.max(180, box.height), Math.max(0, frame.height - top - 12))
  return {
    width, height,
    left: Math.max(inset, Math.min(box.left, frame.width - inset - width)),
    top: Math.max(top, Math.min(box.top, frame.height - 12 - height)),
  }
}

export function resizeBrowserWindow(box: BrowserWindowBox, edge: string, dx: number, dy: number, frame: Frame): BrowserWindowBox {
  let { left, top, width, height } = box
  const right = left + width
  const bottom = top + height
  const minWidth = Math.min(320, frame.width - 24)
  const minHeight = Math.min(180, frame.height - frame.top - 12)
  if (edge.includes('e')) width = Math.max(minWidth, Math.min(width + dx, frame.width - 12 - left))
  if (edge.includes('s')) height = Math.max(minHeight, Math.min(height + dy, frame.height - 12 - top))
  if (edge.includes('w')) { left = Math.max(12, Math.min(left + dx, right - minWidth)); width = right - left }
  if (edge.includes('n')) { top = Math.max(frame.top, Math.min(top + dy, bottom - minHeight)); height = bottom - top }
  return constrainBrowserWindow({ left, top, width, height }, frame)
}
