import { createPortal } from 'react-dom'
import { usePreviewAccess } from '@/hooks/use-preview-access'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Info, Maximize, Minimize, Move } from 'lucide-react'
import { buildNoVncViewerUrl, isNoVncViewerUrl, isWebSocketUrl, type NoVncResizeMode, type NoVncSessionOptions } from '@/lib/no-vnc'
import { getApiUrl } from '@/lib/gateway-url'
import { TooltipHint } from '@/components/ui/tooltip'

export interface NoVncSessionViewProps extends NoVncSessionOptions {
  source?: string | null
  title?: string
  className?: string
  overlay?: ReactNode
  hideControls?: boolean
  controlsContainer?: HTMLElement | null
  onLoad?: () => void
  onKeyboardOpenChange?: (open: boolean) => void
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
    const [base, hash] = url.split('#')
    const [path, query] = base.split('?')
    const params = new URLSearchParams(query)
    if (!params.has('scale')) params.set('scale', 'true')
    // vnc_lite passes query strings directly to a boolean setter: even '0' is truthy.
    if (_options.viewOnly === true) params.set('view_only', '1')
    if (_options.viewOnly === false) params.delete('view_only')
    return `${path}?${params}${hash ? `#${hash}` : ''}`
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
  hideControls = false,
  controlsContainer,
  onLoad,
  onKeyboardOpenChange,
}: NoVncSessionViewProps) {
  const resolvedSource = resolveNoVncSessionUrl(source, {
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

  const [revision, setRevision] = useState(0)
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const attempts = useRef(0)
  const tracksConnection = (() => {
    if (!resolvedSource || !/\/vnc_lite\.html(?:[?#]|$)/i.test(resolvedSource) || typeof window === 'undefined') return false
    const gateway = new URL(getApiUrl() || window.location.origin, window.location.href)
    const target = new URL(resolvedSource, gateway)
    return target.origin === gateway.origin && target.pathname.startsWith('/noVNC/')
  })()
  // Our lite viewer accepts control changes over a checked message channel.
  // Keep its URL (and preview grant) stable so switching control never reconnects.
  // Start read-only until the parent applies the current, verified control state.
  const connectionSource = tracksConnection ? resolveNoVncSessionUrl(resolvedSource, { viewOnly: true }) : resolvedSource
  const src = usePreviewAccess(connectionSource, revision)
  const liveViewOnly = viewOnly ?? (tracksConnection && resolvedSource ? new URL(resolvedSource, 'http://gateway').searchParams.has('view_only') : true)
  const syncControl = useCallback(() => {
    if (!src || !tracksConnection) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'jait-vnc-control', viewOnly: liveViewOnly }, new URL(src, window.location.href).origin)
  }, [src, tracksConnection, liveViewOnly])
  useEffect(syncControl, [syncControl])
  const retry = useCallback(() => {
    attempts.current = 0
    setConnection('connecting')
    setRevision(value => value + 1)
  }, [])

  useEffect(() => {
    attempts.current = 0
    setConnection('connecting')
  }, [connectionSource])

  useEffect(() => {
    if (!src || !tracksConnection) return
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow ||
          event.origin !== new URL(src, window.location.href).origin) return
      if (event.data?.type === 'jait-vnc-keyboard') {
        onKeyboardOpenChange?.(event.data.open === true && !viewOnly && !hideControls)
        return
      }
      if (event.data?.type !== 'jait-vnc-status') return
      if (event.data.status === 'connected') {
        syncControl()
        attempts.current = 0
        setConnection('connected')
      } else if (event.data.status === 'disconnected') {
        onKeyboardOpenChange?.(false)
        setConnection('disconnected')
      }
    }
    window.addEventListener('message', receive)
    return () => {
      window.removeEventListener('message', receive)
      onKeyboardOpenChange?.(false)
    }
  }, [src, tracksConnection, onKeyboardOpenChange, viewOnly, hideControls, syncControl])

  useEffect(() => {
    if (!connectionSource || !tracksConnection || connection === 'connected') return
    if (connection === 'connecting') {
      const deadline = setTimeout(() => setConnection('disconnected'), 10000)
      return () => clearTimeout(deadline)
    }
    if (reconnect === false || attempts.current >= 3 || !navigator.onLine || document.visibilityState === 'hidden') return
    const timer = setTimeout(() => {
      attempts.current += 1
      setConnection('connecting')
      setRevision(value => value + 1)
    }, reconnectDelayMs ?? Math.min(1000 * 2 ** attempts.current, 8000))
    return () => clearTimeout(timer)
  }, [connection, connectionSource, revision, tracksConnection, reconnect, reconnectDelayMs])

  useEffect(() => {
    const resume = () => {
      if (tracksConnection && connection === 'disconnected' && navigator.onLine && document.visibilityState !== 'hidden') retry()
    }
    window.addEventListener('online', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('online', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [connection, retry, tracksConnection])

  if (!resolvedSource) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No remote session source available.
      </div>
    )
  }

  return (
    <ZoomPanWrapper controlsContainer={controlsContainer} hideControls={hideControls} overlay={overlay} controls={tracksConnection ? <button type="button" onClick={retry} className="rounded bg-background/90 px-2 py-1 text-xs shadow hover:bg-muted">Reconnect browser</button> : undefined}>
      {src && <iframe
        ref={iframeRef}
        key={`${src}:${revision}`}
        src={src}
        title={title}
        tabIndex={hideControls ? -1 : undefined}
        className={className}
        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
        onLoad={() => { syncControl(); if (!tracksConnection) setConnection('connected'); onLoad?.() }}
      />}
      {tracksConnection && connection !== 'connected' && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/95 p-4 text-center text-sm">
        <p role="status">{connection === 'connecting' ? 'Connecting to browser…' : 'Browser connection interrupted.'}</p>
      </div>}
    </ZoomPanWrapper>
  )
}

// ---------------------------------------------------------------------------
// Zoom / pan wrapper
// ---------------------------------------------------------------------------
const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

function ZoomPanWrapper({ children, overlay, controls, controlsContainer, hideControls = false }: { children: ReactNode; overlay?: ReactNode; controls?: ReactNode; controlsContainer?: HTMLElement | null; hideControls?: boolean }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isHintExpanded, setIsHintExpanded] = useState(false)
  // Page input passes through until the user explicitly adjusts the local view.
  const [adjusting, setAdjusting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const lastPos = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Wheel and pointer handlers use the latest transform between renders.
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  zoomRef.current = zoom
  panRef.current = pan

  useEffect(() => {
    const changed = () => {
      const root = containerRef.current
      setFullscreen(!!root && !!document.fullscreenElement && document.fullscreenElement.contains(root))
    }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  const toggleFullscreen = async () => {
    const root = containerRef.current
    if (!root) return
    setFullscreenError('')
    try {
      if (document.fullscreenElement?.contains(root)) await document.exitFullscreen()
      else {
        const target = root.closest<HTMLElement>('[data-browser-panel]') ?? root.closest<HTMLElement>('[data-browser-layout]') ?? root
        if (!target.requestFullscreen) throw new Error('Fullscreen is unavailable in this browser.')
        await target.requestFullscreen()
      }
    } catch {
      setFullscreenError('Could not open fullscreen. Try the fullscreen button again.')
    }
  }

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

  // Only the explicit adjustment overlay consumes wheel input for local zoom.
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      applyZoom(e.deltaY, e.deltaMode, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // Drag anywhere on the adjustment overlay to pan.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 0 || e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      lastPos.current = { x: e.clientX, y: e.clientY }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
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
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  // Double-click → reset zoom & pan
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setZoom(1)
    setPan({ x: 0, y: 0 })
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
  }, [])

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
  const toggleAdjustment = () => {
    setAdjusting(value => !value)
    containerRef.current?.focus()
  }
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Scope shortcuts to these controls, never the remote page or editable fields.
    if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return
    if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
    const key = event.key.toLowerCase()
    if (key === 'v') toggleAdjustment()
    else if (key === 'f') void toggleFullscreen()
    else if (key === 'escape' && adjusting) {
      setAdjusting(false)
      setIsDragging(false)
      containerRef.current?.querySelector('iframe')?.focus()
    } else if (adjusting && (key === '+' || key === '=')) zoomIn()
    else if (adjusting && key === '-') zoomOut()
    else if (adjusting && key === '0') resetView()
    else if (adjusting && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      const next = {
        x: panRef.current.x + (key === 'arrowleft' ? -40 : key === 'arrowright' ? 40 : 0),
        y: panRef.current.y + (key === 'arrowup' ? -40 : key === 'arrowdown' ? 40 : 0),
      }
      panRef.current = next
      setPan(next)
    } else return
    event.preventDefault()
    event.stopPropagation()
  }
  const toggleHint = useCallback(() => {
    setIsHintExpanded(expanded => !expanded)
  }, [])

  const viewControls = <>
      <div hidden={hideControls} className={hideControls ? "hidden" : controlsContainer ? "flex items-start gap-2" : "absolute left-2 top-2 z-20 flex items-start gap-2"}>
        <div className="pointer-events-auto flex items-start gap-2">
          <TooltipHint content={isHintExpanded ? 'Hide pan and zoom help' : 'Show pan and zoom help'}>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow backdrop-blur-sm transition-colors hover:bg-background sm:h-7 sm:w-7"
            onClick={toggleHint}
            aria-expanded={isHintExpanded}
            aria-label={isHintExpanded ? 'Hide pan and zoom help' : 'Show pan and zoom help'}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          </TooltipHint>
          {isHintExpanded ? (
            <div className="max-w-[260px] rounded-xl bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow backdrop-blur-sm">
              Click and scroll the page normally. Use Adjust view to zoom with the wheel and drag to pan. With view controls focused: V toggles adjustment, F toggles fullscreen. While adjusting: + / − zoom, 0 resets, arrow keys pan, Esc returns to the page.
            </div>
          ) : null}
        </div>
        {overlay ? (
          <div className="rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
            {overlay}
          </div>
        ) : null}
      </div>
      {controls && !hideControls ? (
        <div className={controlsContainer ? "" : "absolute right-2 top-2 z-20"}>
          {controls}
        </div>
      ) : null}
      {fullscreenError && <p role="alert" className={controlsContainer ? "text-xs text-destructive" : "absolute bottom-14 right-2 z-30 rounded bg-background p-2 text-xs text-destructive"}>{fullscreenError}</p>}
      {/* In chat these controls live in the header; other viewers keep the floating toolbar. */}
      <div hidden={hideControls} className={hideControls ? "hidden" : `${controlsContainer ? "flex flex-wrap" : "absolute bottom-2 right-2 z-20 flex shadow"} items-center gap-1 rounded bg-background/90 px-2 py-1.5 text-sm text-muted-foreground sm:gap-0.5 sm:px-1.5 sm:py-1 sm:text-xs`}>
        <TooltipHint content="Adjust view (V when view controls are focused)">
        <button
          type="button"
          aria-label="Adjust view"
          aria-pressed={adjusting}
          className={`flex min-h-10 items-center gap-1 rounded px-2 sm:min-h-0 sm:px-1.5 sm:py-0.5 ${adjusting ? 'bg-primary/15 text-primary' : 'hover:bg-muted'}`}
          onClick={toggleAdjustment}
        >
          <Move className="h-3.5 w-3.5" />{adjusting ? 'Done adjusting' : 'Adjust view'}
        </button>
        </TooltipHint>
        <TooltipHint content={fullscreen ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'}>
          <button type="button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={() => void toggleFullscreen()} className="min-h-10 rounded px-2 hover:bg-muted sm:min-h-0 sm:px-1.5 sm:py-0.5">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </TooltipHint>
        <span className="mx-0.5 text-border">│</span>
        <TooltipHint content="Zoom out">
        <button type="button" aria-label="Zoom out" className="min-h-10 min-w-10 rounded px-1 hover:bg-muted sm:min-h-0 sm:min-w-0" onClick={zoomOut}>
          −
        </button>
        </TooltipHint>
        <span aria-label="View zoom" className="min-w-[3ch] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <TooltipHint content="Zoom in">
        <button type="button" aria-label="Zoom in" className="min-h-10 min-w-10 rounded px-1 hover:bg-muted sm:min-h-0 sm:min-w-0" onClick={zoomIn}>
          +
        </button>
        </TooltipHint>
        {isTransformed ? (
          <TooltipHint content="Reset view (double-click)">
          <button
            type="button"
            className="ml-0.5 min-h-10 min-w-10 rounded px-1 hover:bg-muted sm:min-h-0 sm:min-w-0"
            aria-label="Reset view"
            onClick={resetView}
          >
            ↺
          </button>
          </TooltipHint>
        ) : null}
      </div>
  </>

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      tabIndex={hideControls ? -1 : 0}
      role="group"
      aria-label="Remote view controls"
      onKeyDown={handleKeyDown}
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
      {/* Overlay is opt-in; normal clicks and scrolling always reach the page. */}
      <div
        ref={overlayRef}
        className="absolute inset-0 z-10"
        style={{
          pointerEvents: adjusting || isDragging ? 'auto' : 'none',
          cursor: isDragging ? 'grabbing' : adjusting ? 'grab' : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={() => setIsDragging(false)}
        onDoubleClick={handleDoubleClick}
      />
      {controlsContainer ? createPortal(viewControls, controlsContainer) : viewControls}
    </div>
  )
}

export type { NoVncResizeMode }
