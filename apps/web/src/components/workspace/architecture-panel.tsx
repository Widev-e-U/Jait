import { useEffect, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'
import { Loader2, RefreshCw, Download, Copy, Check, Sparkles, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface ArchitecturePanelProps {
  /** The mermaid diagram source code */
  diagram: string | null
  /** Whether the diagram is currently being generated */
  isGenerating?: boolean
  /** Called when the user wants to regenerate the diagram */
  onRegenerate?: () => void
  /** Called when the user wants to generate for the first time */
  onGenerate?: () => void
  /** Current theme */
  theme?: 'dark' | 'light'
  /** Reports render success/failure for the current diagram */
  onRenderResult?: (result: { ok: true } | { ok: false; error: string }) => void
}

/* ------------------------------------------------------------------ */
/*  Mermaid initialization                                             */
/* ------------------------------------------------------------------ */

let mermaidInitialized = false
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function zoomAroundPoint(
  scale: number,
  nextScale: number,
  pan: { x: number; y: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  if (scale === nextScale) return pan
  const ratio = nextScale / scale
  return {
    x: point.x - (point.x - pan.x) * ratio,
    y: point.y - (point.y - pan.y) * ratio,
  }
}

function initMermaid(theme: 'dark' | 'light') {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    flowchart: { htmlLabels: true, curve: 'basis' },
    themeVariables: theme === 'dark' ? {
      primaryColor: '#1e293b',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#475569',
      lineColor: '#64748b',
      secondaryColor: '#334155',
      tertiaryColor: '#1e293b',
      background: '#0f172a',
      mainBkg: '#1e293b',
      nodeBorder: '#475569',
      clusterBkg: '#1e293b',
      clusterBorder: '#334155',
      titleColor: '#e2e8f0',
      edgeLabelBackground: '#1e293b',
    } : {},
  })
  mermaidInitialized = true
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ArchitecturePanel({
  diagram,
  isGenerating,
  onRegenerate,
  onGenerate,
  theme = 'dark',
  onRenderResult,
}: ArchitecturePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const renderIdRef = useRef(0)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const pinchRef = useRef<{ distance: number; scale: number; pan: { x: number; y: number } } | null>(null)

  const renderDiagram = useCallback(async (source: string) => {
    if (!containerRef.current) return
    const id = ++renderIdRef.current

    try {
      if (!mermaidInitialized) initMermaid(theme)

      // Validate first
      const valid = await mermaid.parse(source)
      if (!valid || id !== renderIdRef.current) return

      const { svg } = await mermaid.render(`arch-${id}`, source)
      if (id !== renderIdRef.current) return
      containerRef.current.innerHTML = svg
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setRenderError(null)
      onRenderResult?.({ ok: true })
    } catch (err) {
      if (id !== renderIdRef.current) return
      const error = err instanceof Error ? err.message : 'Failed to render diagram'
      setRenderError(error)
      onRenderResult?.({ ok: false, error })
    }
  }, [onRenderResult, theme])

  // Re-init mermaid when theme changes
  useEffect(() => {
    initMermaid(theme)
    mermaidInitialized = true
    if (diagram) {
      void renderDiagram(diagram)
    }
  }, [theme, diagram, renderDiagram])

  // Render diagram when it changes
  useEffect(() => {
    if (diagram) {
      void renderDiagram(diagram)
    }
  }, [diagram, renderDiagram])

  const handleCopy = useCallback(() => {
    if (!diagram) return
    navigator.clipboard.writeText(diagram).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [diagram])

  const handleDownloadSvg = useCallback(() => {
    if (!containerRef.current) return
    const svg = containerRef.current.querySelector('svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgData], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'architecture.svg'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const getViewportPoint = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    }
  }, [])

  const updateZoom = useCallback((nextZoom: number, point?: { x: number; y: number } | null) => {
    setZoom((currentZoom) => {
      const clamped = clampZoom(nextZoom)
      if (clamped === currentZoom) return currentZoom
      setPan((currentPan) => point ? zoomAroundPoint(currentZoom, clamped, currentPan, point) : currentPan)
      return clamped
    })
  }, [])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const point = getViewportPoint(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    updateZoom(zoom * factor, point)
  }, [getViewportPoint, updateZoom, zoom])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY }
    pointersRef.current.set(event.pointerId, point)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (pointersRef.current.size === 1) {
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      pinchRef.current = null
      return
    }

    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()]
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      pinchRef.current = { distance, scale: zoom, pan }
      dragRef.current = null
    }
  }, [pan, zoom])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    const previous = pointersRef.current.get(event.pointerId)!
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointersRef.current.size === 1 && dragRef.current?.pointerId === event.pointerId) {
      const deltaX = event.clientX - previous.x
      const deltaY = event.clientY - previous.y
      setPan((current) => ({ x: current.x + deltaX, y: current.y + deltaY }))
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      return
    }

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [first, second] = [...pointersRef.current.values()]
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      }
      const relativeMidpoint = getViewportPoint(midpoint.x, midpoint.y)
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      if (!relativeMidpoint || pinchRef.current.distance <= 0) return
      const nextZoom = clampZoom(pinchRef.current.scale * (distance / pinchRef.current.distance))
      const zoomedPan = zoomAroundPoint(pinchRef.current.scale, nextZoom, pinchRef.current.pan, relativeMidpoint)
      setZoom(nextZoom)
      setPan(zoomedPan)
    }
  }, [getViewportPoint])

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
    if (pointersRef.current.size < 2) {
      pinchRef.current = null
    }
    if (pointersRef.current.size === 1) {
      const [remainingId, remainingPoint] = [...pointersRef.current.entries()][0] ?? []
      if (typeof remainingId === 'number' && remainingPoint) {
        dragRef.current = { pointerId: remainingId, x: remainingPoint.x, y: remainingPoint.y }
      }
    }
  }, [])

  // Empty state — no diagram yet 
  if (!diagram && !isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 px-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-sm font-medium text-foreground">Software Architecture</h3>
          <p className="text-xs max-w-sm">
            Generate a visual architecture diagram of your workspace. The AI will analyze
            your project structure, dependencies, and code organization to create a Mermaid diagram.
          </p>
        </div>
        {onGenerate && (
          <button
            onClick={onGenerate}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate Architecture Diagram
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 h-8 border-b bg-muted/20 shrink-0">
        <span className="text-xs font-medium text-muted-foreground mr-auto">Architecture</span>
        <button
          onClick={() => updateZoom(zoom - 0.25)}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-3 w-3" />
        </button>
        <span className="text-2xs text-muted-foreground min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => updateZoom(zoom + 0.25)}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Reset zoom"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        {diagram && (
          <>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Copy Mermaid source"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
            <button
              onClick={handleDownloadSvg}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Download SVG"
            >
              <Download className="h-3 w-3" />
            </button>
          </>
        )}
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Regenerate diagram"
            disabled={isGenerating}
          >
            <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Diagram area */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-hidden relative touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        style={{ cursor: pointersRef.current.size > 0 ? 'grabbing' : 'grab' }}
      >
        {isGenerating && !diagram && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Analyzing workspace architecture…</span>
          </div>
        )}
        {isGenerating && diagram && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded bg-background/80 border text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Regenerating…
          </div>
        )}
        {renderError && (
          <div className="p-4 text-xs text-destructive bg-destructive/10 rounded m-2">
            <p className="font-medium mb-1">Render error</p>
            <pre className="whitespace-pre-wrap">{renderError}</pre>
            {diagram && (
              <details className="mt-2">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View source</summary>
                <pre className="mt-1 p-2 bg-muted rounded text-2xs whitespace-pre-wrap">{diagram}</pre>
              </details>
            )}
          </div>
        )}
        <div
          className="absolute inset-0 flex items-center justify-center p-4"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
        >
          <div ref={containerRef} className="flex items-center justify-center" />
        </div>
      </div>
    </div>
  )
}
