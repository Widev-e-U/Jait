import { useEffect, useId, useState } from 'react'
import { unwrapCatalogData } from './catalog-tool-result'

// Mermaid uses global configuration and a render queue; keep chat jobs ordered.
let renderQueue: Promise<unknown> = Promise.resolve()

export function MermaidToolResult({ data }: { data: unknown }) {
  const record = unwrapCatalogData(data)
  const diagram = typeof record.diagram === 'string' ? record.diagram : ''
  const title = typeof record.title === 'string' ? record.title : 'Diagram'
  const id = `chat-mermaid-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const [result, setResult] = useState<{ source: string; svg?: string; error?: string }>({ source: '' })

  useEffect(() => {
    let cancelled = false
    const job = renderQueue.then(async () => {
      try {
        if (!diagram.trim() || diagram.length > 20000) throw new Error('Missing or oversized Mermaid source')
        if (/<\s*\/?[a-zA-Z]/.test(diagram)) throw new Error('HTML tags are not supported in chat diagram labels')
        if (/%%\s*\{|@\{[^}]*\bimg\s*:/s.test(diagram)) throw new Error('Diagram configuration directives and external images are not supported in chat')
        const { default: mermaid } = await import('mermaid')
        if (cancelled) return
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', maxTextSize: 20000, maxEdges: 500, suppressErrorRendering: true, htmlLabels: false, flowchart: { htmlLabels: false } })
        await mermaid.parse(diagram)
        const { svg } = await mermaid.render(id, diagram)
        if (!cancelled) setResult({ source: diagram, svg })
      } catch (error) {
        if (!cancelled) setResult({ source: diagram, error: error instanceof Error ? error.message : 'Invalid Mermaid diagram' })
      }
    })
    renderQueue = job.catch(() => {})
    return () => { cancelled = true }
  }, [diagram, id])

  const ready = result.source === diagram
  return <section className="space-y-2 rounded-md border bg-background p-3" data-testid="mermaid-tool-result">
    <h3 className="text-sm font-medium">{title}</h3>
    {ready && result.error ? <p role="alert" className="text-sm text-destructive">Diagram could not render: {result.error}</p>
      : ready && result.svg ? <iframe title={title} sandbox="" className="h-[420px] w-full rounded border-0 bg-white" srcDoc={`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>body{margin:12px}svg{max-width:100%;height:auto}</style>${result.svg}`} />
      : <p role="status" className="text-xs text-muted-foreground">Rendering diagram…</p>}
    <details><summary className="cursor-pointer text-xs text-muted-foreground">Mermaid source</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{diagram}</pre></details>
  </section>
}
