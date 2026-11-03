import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssistantMarkdown, type OnOpenPath } from '@/components/chat/assistant-markdown'
import { isProjectImage } from './project-image-viewer'
import './project-pdf-text-layer.css'

export function isProjectPdf(path: string) {
  return /\.pdf$/i.test(path)
}

export function isProjectMarkdown(path: string) {
  return /\.(md|markdown|mdx)$/i.test(path)
}

/** Files the gateway hands out as a data URL instead of UTF-8 text. */
export function isProjectBinaryPreview(path: string) {
  return isProjectImage(path) || isProjectPdf(path)
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

/**
 * Renders a PDF with pdf.js onto canvases. Browsers could show a PDF in an
 * iframe, but Android's WebView has no built-in PDF viewer, so the app would
 * show nothing there.
 */
export function ProjectPdfViewer({ src, path }: { src: string; path: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [zoomIndex, setZoomIndex] = useState(2)
  const [pageCount, setPageCount] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const update = () => setWidth(Math.max(200, scroll.offsetWidth - 48))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const scroll = scrollRef.current
    if (!container || !scroll || !width) return
    if (!src.startsWith('data:')) { setState('error'); return }
    let cancelled = false
    let destroy: (() => void) | undefined
    let observer: IntersectionObserver | undefined
    const active = new Map<Element, { cancel?: () => void; canvas?: HTMLCanvasElement; textLayer?: HTMLDivElement; cancelText?: () => void }>()
    const release = (element: Element) => {
      const item = active.get(element)
      active.delete(element)
      item?.cancel?.()
      item?.cancelText?.()
      item?.textLayer?.remove()
      if (item?.canvas) {
        item.canvas.width = 0
        item.canvas.height = 0
        item.canvas.remove()
      }
    }
    setState('loading')
    setPageCount(0)
    container.replaceChildren()
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        if (cancelled) return
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const task = pdfjs.getDocument({ data: dataUrlToBytes(src) })
        destroy = () => { void task.destroy() }
        const pdf = await task.promise
        if (cancelled) return
        const first = await pdf.getPage(1)
        if (cancelled) return
        const firstSize = first.getViewport({ scale: 1 })
        const pageWidth = width * ZOOM_STEPS[zoomIndex]
        setPageCount(pdf.numPages)
        observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const element = entry.target as HTMLDivElement
            if (!entry.isIntersecting) { release(element); continue }
            if (active.has(element)) continue
            const item: { cancel?: () => void; canvas?: HTMLCanvasElement; textLayer?: HTMLDivElement; cancelText?: () => void } = {}
            active.set(element, item)
            void (async () => {
              try {
                const page = await pdf.getPage(Number(element.dataset.page))
                if (cancelled || active.get(element) !== item) return
                const base = page.getViewport({ scale: 1 })
                const cssScale = pageWidth / base.width
                // Bound each backing canvas, even at high zoom or device pixel ratio.
                const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(16_000_000 / (base.width * base.height * cssScale * cssScale)))
                const viewport = page.getViewport({ scale: cssScale * ratio })
                const canvas = document.createElement('canvas')
                canvas.width = Math.max(1, Math.floor(viewport.width))
                canvas.height = Math.max(1, Math.floor(viewport.height))
                canvas.style.width = `${pageWidth}px`
                canvas.style.height = `${base.height * cssScale}px`
                canvas.className = 'block bg-white shadow-sm'
                canvas.setAttribute('aria-label', `Page ${element.dataset.page}`)
                element.style.height = canvas.style.height
                element.appendChild(canvas)
                item.canvas = canvas
                const context = canvas.getContext('2d')
                if (!context) throw new Error('Canvas unavailable')
                const render = page.render({ canvasContext: context, viewport })
                item.cancel = () => render.cancel()
                await render.promise
                if (cancelled || active.get(element) !== item) return
                const textLayer = document.createElement('div')
                textLayer.className = 'project-pdf-text-layer'
                textLayer.style.setProperty('--scale-factor', String(cssScale * page.userUnit))
                element.appendChild(textLayer)
                item.textLayer = textLayer
                const text = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport: page.getViewport({ scale: cssScale }) })
                item.cancelText = () => text.cancel()
                // A text layer failure should not hide an otherwise readable page.
                await text.render().catch(() => {})
              } catch {
                if (!cancelled && active.get(element) === item) {
                  release(element)
                  element.textContent = 'Unable to render this page.'
                }
              }
            })()
          }
        }, { root: scroll, rootMargin: '200px 0px' })
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const placeholder = document.createElement('div')
          placeholder.dataset.page = String(pageNumber)
          placeholder.className = 'relative mx-auto mb-4 bg-white shadow-sm'
          placeholder.style.width = `${pageWidth}px`
          placeholder.style.height = `${pageWidth * firstSize.height / firstSize.width}px`
          container.appendChild(placeholder)
          observer.observe(placeholder)
        }
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
      observer?.disconnect()
      for (const element of active.keys()) release(element)
      destroy?.()
    }
  }, [src, zoomIndex, width])

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-pdf-viewer">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b p-2 text-xs">
        <Button variant="ghost" size="sm" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}>−</Button>
        <span>{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</span>
        <Button variant="ghost" size="sm" aria-label="Zoom in" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}>+</Button>
        {pageCount > 0 && <span className="ml-auto text-muted-foreground">{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>}
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
        {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…</div>}
        {state === 'error' && <p role="alert" className="text-sm text-muted-foreground">Unable to display {path.split(/[/\\]/).pop()}.</p>}
        <div ref={containerRef} />
      </div>
    </div>
  )
}

/** Markdown files open rendered; the editor is one toggle away. */
export function ProjectMarkdownView({
  content,
  editor,
  onOpenPath,
}: {
  content: string
  editor: ReactNode
  onOpenPath?: OnOpenPath
}) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-markdown-view">
      <div className="flex shrink-0 items-center gap-1 border-b p-1.5">
        <Button variant={mode === 'preview' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('preview')}>Preview</Button>
        <Button variant={mode === 'edit' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('edit')}>Edit</Button>
      </div>
      <div className="min-h-0 flex-1">
        {mode === 'preview' ? (
          <div className="h-full overflow-auto px-5 py-4">
            <AssistantMarkdown content={content} onOpenPath={onOpenPath} />
          </div>
        ) : editor}
      </div>
    </div>
  )
}
