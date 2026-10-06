import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type Point = { x: number; y: number }
type View = Point & { scale: number }
const initialView: View = { scale: 1, x: 0, y: 0 }

/** Shared expanded image view. Scale is relative to the image fitted to the viewport. */
function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const viewport = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const current = useRef<View>(initialView)
  const pointers = useRef(new Map<number, Point>())
  const [view, setView] = useState(initialView)
  const [dragging, setDragging] = useState(false)

  function update(next: View) {
    const area = viewport.current
    const img = image.current
    if (area && img) {
      const limitX = Math.max(0, (img.offsetWidth * next.scale - area.clientWidth) / 2)
      const limitY = Math.max(0, (img.offsetHeight * next.scale - area.clientHeight) / 2)
      next = { ...next, x: Math.max(-limitX, Math.min(limitX, next.x)), y: Math.max(-limitY, Math.min(limitY, next.y)) }
    }
    current.current = next
    setView(next)
  }

  function zoom(factor: number, anchor: Point = { x: 0, y: 0 }, movement: Point = { x: 0, y: 0 }) {
    const old = current.current
    const scale = Math.max(1, Math.min(16, old.scale * factor))
    const ratio = scale / old.scale
    update({ scale, x: anchor.x - (anchor.x - old.x) * ratio + movement.x, y: anchor.y - (anchor.y - old.y) * ratio + movement.y })
  }

  function local(clientX: number, clientY: number): Point {
    const rect = viewport.current!.getBoundingClientRect()
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
  }

  useEffect(() => {
    const area = viewport.current!
    // A native non-passive listener prevents page scrolling and browser trackpad zoom.
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1)
      zoom(Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.003), local(event.clientX, event.clientY))
    }
    area.addEventListener('wheel', wheel, { passive: false })
    const observer = new ResizeObserver(() => update(initialView))
    observer.observe(area)
    update(initialView)
    return () => { area.removeEventListener('wheel', wheel); observer.disconnect() }
  }, [src])

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, local(event.clientX, event.clientY))
    setDragging(true)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    const before = [...pointers.current.values()]
    const old = pointers.current.get(event.pointerId)!
    const next = local(event.clientX, event.clientY)
    pointers.current.set(event.pointerId, next)
    const after = [...pointers.current.values()]
    if (before.length === 2) {
      const midpoint = (points: Point[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
      const distance = (points: Point[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      const a = midpoint(before)
      const b = midpoint(after)
      zoom(distance(after) / Math.max(1, distance(before)), a, { x: b.x - a.x, y: b.y - a.y })
    } else if (before.length === 1) {
      update({ ...current.current, x: current.current.x + next.x - old.x, y: current.current.y + next.y - old.y })
    }
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    setDragging(pointers.current.size > 0)
  }

  return <>
    <DialogTitle className="mr-10 truncate px-1 text-sm">{alt}</DialogTitle>
    <DialogDescription className="px-1 text-xs">Scroll to zoom · Middle mouse to drag · Pinch and drag on touchscreens</DialogDescription>
    <div className="flex items-center gap-2 px-1">
      <button type="button" aria-label="Zoom out" className="rounded border px-3 py-1" disabled={view.scale <= 1} onClick={() => zoom(1 / 1.5)}>−</button>
      <output className="min-w-12 text-center text-xs" aria-label="Image zoom">{Math.round(view.scale * 100)}%</output>
      <button type="button" aria-label="Zoom in" className="rounded border px-3 py-1" disabled={view.scale >= 16} onClick={() => zoom(1.5)}>+</button>
      <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => update(initialView)}>Reset zoom</button>
    </div>
    <div ref={viewport} role="region" aria-label="Image viewport" tabIndex={0}
      className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden rounded bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
      onMouseDown={(event) => { if (event.button === 1) event.preventDefault() }} onAuxClick={(event) => event.preventDefault()}
      onDoubleClick={() => update(initialView)}
      onKeyDown={(event) => {
        if (event.key === '+' || event.key === '=') zoom(1.5)
        else if (event.key === '-') zoom(1 / 1.5)
        else if (event.key === '0') update(initialView)
        else if (event.key.startsWith('Arrow')) update({ ...current.current, x: current.current.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0), y: current.current.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) })
        else return
        event.preventDefault()
      }}>
      <img ref={image} src={src} alt={alt} draggable={false} onLoad={() => update(initialView)}
        className="pointer-events-none max-h-full max-w-full shrink-0 object-contain"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />
    </div>
  </>
}

export function ImageViewerContent(props: { src: string; alt: string }) {
  return <DialogContent className="flex h-[92dvh] w-[96vw] max-w-none flex-col gap-2 overflow-hidden p-2" showCloseButton>
    <ImageViewer {...props} />
  </DialogContent>
}
