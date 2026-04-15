import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { buildNoVncViewerUrl, isNoVncViewerUrl, isWebSocketUrl, type NoVncResizeMode, type NoVncSessionOptions } from '@/lib/no-vnc'
import { getApiUrl } from '@/lib/gateway-url'

export interface NoVncSessionViewProps extends NoVncSessionOptions {
  source?: string | null
  title?: string
  className?: string
  overlay?: ReactNode
  onLoad?: () => void
}

export function resolveNoVncSessionUrl(source: string | null | undefined, options: NoVncSessionOptions = {}): string | null {
  const trimmed = source?.trim()
  if (!trimmed) return null
  if (isWebSocketUrl(trimmed)) {
    return resolveGatewayRelativeUrl(buildNoVncViewerUrl({ ...options, websocketUrl: trimmed }))
  }
  if (isNoVncViewerUrl(trimmed)) {
    return appendNoVncScaleParams(resolveGatewayRelativeUrl(trimmed), options)
  }
  return trimmed
}

function resolveGatewayRelativeUrl(url: string): string {
  if (!url.startsWith('/')) return url
  return `${getApiUrl()}${url}`
}

/** Append scaling hash-params to an existing noVNC viewer URL so
 *  the VNC canvas fills the iframe instead of rendering at native resolution. */
function appendNoVncScaleParams(url: string, _options: NoVncSessionOptions): string {
  // vnc_lite.html uses query params and auto-connects to the websockify
  // endpoint at the same host:port. Just append ?scale=true.
  if (/vnc_lite\.html/i.test(url)) {
    const sep = url.includes('?') ? '&' : '?'
    if (!/[?&]scale=/i.test(url)) return `${url}${sep}scale=true`
    return url
  }
  // vnc.html uses hash params (#key=value)
  const [base = url, existingHash = ''] = url.split('#')
  const params = new URLSearchParams(existingHash)
  if (!params.has('autoconnect')) params.set('autoconnect', 'true')
  if (!params.has('resize')) params.set('resize', _options.resize ?? 'scale')
  if (!params.has('scale'))  params.set('scale', _options.scaleViewport != null ? (_options.scaleViewport ? '1' : '0') : '1')
  if (!params.has('show_dot')) params.set('show_dot', 'true')
  if (!params.has('bell'))   params.set('bell', '0')
  return `${base}#${params.toString()}`
}

export function NoVncSessionView({
  source,
  viewerUrl,
  websocketUrl,
  viewOnly,
  shared,
  reconnect,
  reconnectDelayMs,
  resize,
  scaleViewport,
  quality,
  compression,
  bell,
  title = 'Remote session',
  className = 'h-full w-full bg-white',
  overlay,
  onLoad,
}: NoVncSessionViewProps) {
  const src = resolveNoVncSessionUrl(source, {
    viewerUrl,
    websocketUrl,
    viewOnly,
    shared,
    reconnect,
    reconnectDelayMs,
    resize,
    scaleViewport,
    quality,
    compression,
    bell,
  })

  if (!src) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No remote session source available.
      </div>
    )
  }

  return (
    <ZoomPanWrapper overlay={overlay}>
      <iframe
        key={src}
        src={src}
        title={title}
        className={className}
        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
        onLoad={onLoad}
      />
    </ZoomPanWrapper>
  )
}

// ---------------------------------------------------------------------------
// Zoom / pan wrapper
// ---------------------------------------------------------------------------
const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

function ZoomPanWrapper({ children, overlay, controls }: { children: ReactNode; overlay?: ReactNode; controls?: ReactNode }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isHintExpanded, setIsHintExpanded] = useState(false)
  // "navigating" = overlay is active → scroll zooms, middle-drag pans.
  // "interacting" = overlay is transparent → clicks/scrolls go to iframe.
  const [navigating, setNavigating] = useState(true)
  const lastPos = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Keep zoom/pan in refs so the document-level handler can read them
  // without re-registering. The handler is intentionally only registered
  // once (empty deps) to avoid capture-listener churn.
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  zoomRef.current = zoom
  panRef.current = pan

  // Re-enable overlay when parent window regains focus.
  useEffect(() => {
    const handleFocus = () => setNavigating(true)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Zoom toward a point in container-space (CSS pixels from container edge).
  // The transform is `translate(pan) scale(zoom)` with origin 0,0, so a
  // content point P maps to screen as: screen = pan + P * zoom.
  // To keep the point under the cursor fixed after zoom:
  //   newPan = cursor - (cursor - oldPan) * (newZoom / oldZoom)
  const applyZoom = useCallback((deltaY: number, deltaMode: number, clientX: number, clientY: number): boolean => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return false
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return false
    // Normalise delta to pixels (deltaMode 1 = lines ≈ 16px each)
    const dy = deltaY * (deltaMode === 1 ? 16 : 1)
    // Clamp factor to avoid insane jumps on some trackpads
    const raw = 1 - dy * 0.002
    const factor = Math.max(0.5, Math.min(2, raw))
    const prev = zoomRef.current
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor))
    if (next === prev) return true
    const ratio = next / prev
    const p = panRef.current
    const nx = cx - ratio * (cx - p.x)
    const ny = cy - ratio * (cy - p.y)
    zoomRef.current = next
    panRef.current = { x: nx, y: ny }
    setZoom(next)
    setPan({ x: nx, y: ny })
    return true
  }, [])

  // Document-level capture handler — catches Ctrl+wheel even when the
  // cross-origin iframe has focus. Capture phase + passive:false lets us
  // preventDefault() before Chrome applies its native page zoom.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (applyZoom(e.deltaY, e.deltaMode, e.clientX, e.clientY)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => document.removeEventListener('wheel', onWheel, { capture: true })
  }, [applyZoom])

  // Overlay handler — plain scroll (no Ctrl needed) also zooms while
  // navigating, giving an immediate zoom experience on hover.
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return // handled by document capture
      e.preventDefault()
      applyZoom(e.deltaY, e.deltaMode, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // Middle-mouse drag → pan
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      lastPos.current = { x: e.clientX, y: e.clientY }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    // Left / right click → switch to interact mode so the iframe gets focus.
    setNavigating(false)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    e.preventDefault()
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setPan(p => {
      const next = { x: p.x + dx, y: p.y + dy }
      panRef.current = next
      return next
    })
  }, [isDragging])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button !== 1) return
    setIsDragging(false)
  }, [])

  // Double-click → reset zoom & pan
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setZoom(1)
    setPan({ x: 0, y: 0 })
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
  }, [])

  // Re-enable overlay when cursor leaves the preview area.
  const handlePointerLeave = useCallback(() => {
    if (!isDragging) setNavigating(true)
  }, [isDragging])

  const isTransformed = zoom !== 1 || pan.x !== 0 || pan.y !== 0

  const zoomIn = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    const cx = rect ? rect.width / 2 : 0
    const cy = rect ? rect.height / 2 : 0
    const prev = zoomRef.current
    const next = Math.min(MAX_ZOOM, prev * 1.2)
    const ratio = next / prev
    const p = panRef.current
    const np = { x: cx - ratio * (cx - p.x), y: cy - ratio * (cy - p.y) }
    zoomRef.current = next
    panRef.current = np
    setZoom(next)
    setPan(np)
  }, [])
  const zoomOut = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    const cx = rect ? rect.width / 2 : 0
    const cy = rect ? rect.height / 2 : 0
    const prev = zoomRef.current
    const next = Math.max(MIN_ZOOM, prev / 1.2)
    const ratio = next / prev
    const p = panRef.current
    const np = { x: cx - ratio * (cx - p.x), y: cy - ratio * (cy - p.y) }
    zoomRef.current = next
    panRef.current = np
    setZoom(next)
    setPan(np)
  }, [])
  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
  }, [])
  const toggleMode = useCallback(() => {
    setNavigating(n => !n)
  }, [])
  const toggleHint = useCallback(() => {
    setIsHintExpanded(expanded => !expanded)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden"
      onPointerLeave={handlePointerLeave}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
          willChange: isTransformed ? 'transform' : undefined,
        }}
      >
        {children}
      </div>
      {/* Event intercept overlay — captures scroll (zoom), middle-mouse
          (pan), and double-click (reset). Deactivates on left-click so the
          iframe can receive normal VNC interaction. */}
      <div
        ref={overlayRef}
        className="absolute inset-0 z-10"
        style={{
          pointerEvents: navigating || isDragging ? 'auto' : 'none',
          cursor: isDragging ? 'grabbing' : navigating ? 'default' : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
      <div className="absolute left-2 top-2 z-20 flex items-start gap-2">
        <div className="pointer-events-auto flex items-start gap-2">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow backdrop-blur-sm transition-colors hover:bg-background"
            onClick={toggleHint}
            aria-expanded={isHintExpanded}
            aria-label={isHintExpanded ? 'Hide pan and zoom help' : 'Show pan and zoom help'}
            title={isHintExpanded ? 'Hide pan and zoom help' : 'Show pan and zoom help'}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          {isHintExpanded ? (
            <div className="max-w-[260px] rounded-xl bg-background/90 px-3 py-2 text-[11px] text-muted-foreground shadow backdrop-blur-sm">
              Scroll to zoom. Middle-drag to pan. Click the preview to interact.
            </div>
          ) : null}
        </div>
        {overlay ? (
          <div className="rounded bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
            {overlay}
          </div>
        ) : null}
      </div>
      {controls ? (
        <div className="absolute right-2 top-2 z-20">
          {controls}
        </div>
      ) : null}
      {/* Floating controls — always accessible */}
      <div className="absolute bottom-2 right-2 z-20 flex items-center gap-0.5 rounded bg-background/90 px-1.5 py-1 text-[11px] text-muted-foreground shadow">
        <button
          type="button"
          className={`rounded px-1.5 py-0.5 ${navigating ? 'bg-primary/15 text-primary' : 'hover:bg-muted'}`}
          onClick={toggleMode}
          title={navigating ? 'Switch to interact mode (click VNC)' : 'Switch to navigate mode (scroll to zoom)'}
        >
          {navigating ? '🔍 Navigate' : '👆 Interact'}
        </button>
        <span className="mx-0.5 text-border">│</span>
        <button type="button" className="rounded px-1 hover:bg-muted" onClick={zoomOut} title="Zoom out">
          −
        </button>
        <span className="min-w-[3ch] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" className="rounded px-1 hover:bg-muted" onClick={zoomIn} title="Zoom in">
          +
        </button>
        {isTransformed ? (
          <button
            type="button"
            className="ml-0.5 rounded px-1 hover:bg-muted"
            onClick={resetView}
            title="Reset view (double-click)"
          >
            ↺
          </button>
        ) : null}
      </div>
    </div>
  )
}

export type { NoVncResizeMode }
