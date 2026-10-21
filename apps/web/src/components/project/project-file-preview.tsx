import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssistantMarkdown, type OnOpenPath } from '@/components/chat/assistant-markdown'
import { isProjectImage } from './project-image-viewer'

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [zoomIndex, setZoomIndex] = useState(2)
  const [pageCount, setPageCount] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container || !src.startsWith('data:')) {
      setState('error')
      return
    }
    let cancelled = false
    let destroy: (() => void) | null = null
    setState('loading')
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const task = pdfjs.getDocument({ data: dataUrlToBytes(src) })
        destroy = () => { void task.destroy() }
        const pdf = await task.promise
        if (cancelled) return
        setPageCount(pdf.numPages)
        container.replaceChildren()
        const available = Math.max(200, container.clientWidth - 32)
        const ratio = window.devicePixelRatio || 1
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const scale = (available / base.width) * ZOOM_STEPS[zoomIndex]
          const viewport = page.getViewport({ scale: scale * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`
          canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
          canvas.className = 'mx-auto mb-4 block bg-white shadow-sm'
          canvas.setAttribute('aria-label', `Page ${pageNumber}`)
          container.appendChild(canvas)
          const context = canvas.getContext('2d')
          if (context) await page.render({ canvasContext: context, viewport }).promise
          if (pageNumber === 1 && !cancelled) setState('ready')
        }
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
      destroy?.()
    }
  }, [src, zoomIndex])

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-pdf-viewer">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b p-2 text-xs">
        <Button variant="ghost" size="sm" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}>−</Button>
        <span>{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</span>
        <Button variant="ghost" size="sm" aria-label="Zoom in" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}>+</Button>
        {pageCount > 0 && <span className="ml-auto text-muted-foreground">{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>}
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
          </div>
        )}
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
