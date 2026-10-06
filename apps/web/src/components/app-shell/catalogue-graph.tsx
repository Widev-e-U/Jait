import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { JAIT_PAGES, JAIT_PAGE_IDS, type JaitPageId } from '@jait/shared'
import { ExternalLink, Loader2, RefreshCw, Search, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiUrl } from '@/lib/gateway-url'
import { getAuthToken } from '@/lib/auth-token'
import { openNotification } from '@/lib/notification-navigation'
import { buildCatalogueGraph, type CatalogueTool, type CatalogueNode, type CatalogueLink } from '@/lib/catalogue-graph'

const COLORS = { root: '#f472b6', page: '#38bdf8', feature: '#a78bfa', tool: '#34d399' }
function escapeLabel(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
}
export default function CatalogueGraph({ onOpenPage }: { onOpenPage: () => void }) {
  const [tools, setTools] = useState<CatalogueTool[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [pageFilter, setPageFilter] = useState<JaitPageId | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('jait')
  const detailsRef = useRef<HTMLElement>(null)
  const fitPendingRef = useRef(true)
  const textColorRef = useRef("#94a3b8")
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<CatalogueNode, CatalogueLink> | undefined>(undefined)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const graph = useMemo(() => {
    const data = buildCatalogueGraph(tools ?? [], pageFilter, query)
    if (pageFilter !== 'all') {
      const toolNodes = data.nodes.filter((node) => node.kind === 'tool')
      const positions = new Map(toolNodes.map((node, index) => [node.id, (index - (toolNodes.length - 1) / 2) * 70]))
      for (const node of data.nodes) {
        const x = node.kind === 'root' ? -180 : node.kind === 'page' ? -85 : node.kind === 'feature' ? 10 : 160
        const children = data.links.filter((link) => link.source === node.id)
          .map((link) => positions.get(String(link.target))).filter((y): y is number => y !== undefined)
        const y = node.kind === 'tool' ? positions.get(node.id) ?? 0
          : node.kind === 'feature' && children.length ? children.reduce((sum, value) => sum + value, 0) / children.length : 0
        node.x = node.fx = x
        node.y = node.fy = y
      }
    }
    return data
  }, [tools, pageFilter, query])
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0]
  const pageId = selected?.pageId
  const page = pageId ? JAIT_PAGES[pageId] : null
  const visibleTools = graph.nodes.filter((node) => node.kind === 'tool')
  const choose = useCallback((node: CatalogueNode) => {
    setSelectedId(node.id)
    detailsRef.current?.scrollTo({ top: 0 })
    if (node.kind === 'page' && node.pageId) setPageFilter(node.pageId)
    if (node.kind === 'root') setPageFilter('all')
  }, [])

  useEffect(() => { fitPendingRef.current = true }, [graph, size.width, size.height])

  useEffect(() => {
    let active: AbortController | null = null
    let disposed = false
    const load = async () => {
      active?.abort()
      const controller = new AbortController()
      active = controller
      setLoading(true)
      const token = getAuthToken()
      try {
        const response = await fetch(`${getApiUrl()}/api/tools`, { signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {} })
        if (!response.ok) throw new Error(`Could not load catalogue (${response.status})`)
        const data = await response.json() as { tools?: CatalogueTool[] }
        if (!Array.isArray(data.tools) || !data.tools.every((tool) => typeof tool.name === 'string' && typeof tool.description === 'string')) throw new Error('Invalid catalogue response')
        if (!disposed && active === controller) {
          setTools((previous) => JSON.stringify(previous) === JSON.stringify(data.tools) ? previous : data.tools!)
          setError('')
        }
      } catch (cause) {
        if (!disposed && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load catalogue')
      } finally {
        if (!disposed && active === controller) setLoading(false)
      }
    }
    void load()
    const focus = () => { void load() }
    const interval = setInterval(focus, 30_000)
    window.addEventListener('focus', focus)
    return () => { disposed = true; active?.abort(); clearInterval(interval); window.removeEventListener('focus', focus) }
  }, [refresh])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const readColor = () => { textColorRef.current = getComputedStyle(element).color }
    readColor()
    const themeObserver = new MutationObserver(readColor)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] })
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) })
    })
    observer.observe(element)
    return () => { observer.disconnect(); themeObserver.disconnect() }
  }, [])

  const drawNode = useCallback((node: CatalogueNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const radius = node.kind === 'root' ? 10 : node.kind === 'page' ? 8 : node.kind === 'feature' ? 5 : 3
    const color = node.available === false ? '#f59e0b' : COLORS[node.kind]
    const x = node.x ?? 0, y = node.y ?? 0
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    if (node.id === selectedId) { ctx.strokeStyle = color; ctx.lineWidth = 2 / scale; ctx.stroke() }
    if (pageFilter === 'all' && node.kind === 'tool' && scale < 0.7 && node.id !== selectedId) return
    ctx.font = `${11 / scale}px sans-serif`
    ctx.fillStyle = textColorRef.current
    ctx.textAlign = node.kind === 'tool' && pageFilter !== 'all' ? 'right' : 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(node.label.length > 42 ? node.label.slice(0, 40) + '…' : node.label, node.kind === 'tool' && pageFilter !== 'all' ? x - 5 : x, y + radius + 3)
  }, [selectedId, pageFilter])

  return <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="catalogue-explorer">
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="relative min-w-36 flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Find a page, feature, or tool…" aria-label="Search catalogue" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <select aria-label="Catalogue page" className="h-9 max-w-40 rounded-md border bg-background px-2 text-sm" value={pageFilter} onChange={(event) => {
        const id = event.target.value as JaitPageId | 'all'
        setPageFilter(id); setSelectedId(id === 'all' ? 'jait' : 'page:' + id)
      }}>
        <option value="all">All pages</option>
        {JAIT_PAGE_IDS.map((id) => <option key={id} value={id}>{JAIT_PAGES[id].title}</option>)}
      </select>
      <Button variant="outline" size="icon" aria-label="Refresh catalogue" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
    {error && <div role="alert" className="shrink-0 text-sm text-destructive">{error} <button className="underline" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row md:overflow-hidden">
      <div ref={containerRef} className="relative min-h-[220px] min-w-0 flex-1 overflow-hidden rounded-lg border bg-muted/15 text-foreground" data-testid="catalogue-graph" aria-label="Interactive catalogue graph">
        {tools && size.width > 0 && size.height > 0 ? <ForceGraph2D
          key={pageFilter}
          ref={graphRef} width={size.width} height={size.height}
          graphData={graph} nodeId="id" dagMode={pageFilter === "all" ? "radialout" : undefined} dagLevelDistance={90}
          nodeCanvasObject={drawNode} nodeLabel={(node: CatalogueNode) => escapeLabel(node.label)}
          nodePointerAreaPaint={(node: CatalogueNode, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x ?? 0, node.y ?? 0, 12, 0, Math.PI * 2); ctx.fill() }}
          linkColor={() => '#94a3b866'} linkWidth={1} linkDirectionalArrowLength={3}
          onNodeClick={choose}
          onEngineTick={() => { if (fitPendingRef.current) { graphRef.current?.zoomToFit(0, pageFilter === "all" ? 45 : 20); fitPendingRef.current = false } }}
          onEngineStop={() => graphRef.current?.zoomToFit(0, pageFilter === "all" ? 45 : 20)}
          warmupTicks={50} cooldownTicks={1} d3VelocityDecay={0.4} minZoom={0.2} maxZoom={8} backgroundColor="transparent"
        /> : <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Loading tools…</> : 'Catalogue unavailable'}</div>}
        {tools && <div className="absolute bottom-2 left-2 flex gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8 bg-background" aria-label="Fit catalogue graph" onClick={() => graphRef.current?.zoomToFit(250, pageFilter === "all" ? 45 : 20)}><Scan className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-background" aria-label="Zoom in catalogue graph" onClick={() => { const graph = graphRef.current; if (graph) graph.zoom(graph.zoom() * 1.5, 200) }}><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-background" aria-label="Zoom out catalogue graph" onClick={() => { const graph = graphRef.current; if (graph) graph.zoom(graph.zoom() / 1.5, 200) }}><ZoomOut className="h-4 w-4" /></Button>
        </div>}
        {tools && graph.nodes.length === 1 && <p className="absolute inset-x-4 top-4 text-sm text-muted-foreground">No matching pages or tools.</p>}
      </div>
      <aside ref={detailsRef} aria-label="Catalogue details" className="max-h-[36dvh] w-full shrink-0 space-y-3 overflow-y-auto rounded-lg border p-3 md:max-h-none md:w-72">
        <div><p className="text-xs capitalize text-muted-foreground">{selected?.kind}</p><h2 className="break-words text-sm font-semibold">{selected?.label}</h2><p className="mt-1 text-xs text-muted-foreground">{selected?.description}</p></div>
        {selected?.available === false && <p className="text-xs text-amber-600 dark:text-amber-400">Tool unavailable in this gateway</p>}
        {selected?.tool && <p className="text-xs text-muted-foreground">{selected.tool.category} · {selected.tool.risk ?? 'unknown'} risk · {selected.tool.source ?? 'builtin'}</p>}
        {page && pageId && <Button variant="outline" size="sm" className="w-full" onClick={() => { onOpenPage(); openNotification({ id: 'catalogue:' + pageId, link: page.path }) }}><ExternalLink className="mr-2 h-3.5 w-3.5" />Open {page.title}</Button>}
        <div className="space-y-1"><h3 className="text-xs font-medium">Pages</h3>
          {graph.nodes.filter((node) => node.kind === 'page').map((node) => <button key={node.id} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => choose(node)}>{node.label}</button>)}
          {pageFilter !== 'all' && <button className="px-2 py-1 text-xs text-primary" onClick={() => { setPageFilter('all'); setSelectedId('jait') }}>Show all pages</button>}
        </div>
        <div className="space-y-1"><h3 className="text-xs font-medium">Features</h3>
          {graph.nodes.filter((node) => node.kind === 'feature').map((node) => <button key={node.id} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => choose(node)}>{node.pageId ? JAIT_PAGES[node.pageId].title + ' · ' : ''}{node.label}</button>)}
        </div>
        <div className="space-y-1"><h3 className="text-xs font-medium">Tools ({visibleTools.length})</h3>
          {visibleTools.map((node) => <button key={node.id} className="block w-full break-words rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => choose(node)}>{node.label}{node.available === false && <span className="ml-1 text-amber-600">Unavailable</span>}</button>)}
        </div>
      </aside>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Catalogue graph legend">
      {(['page', 'feature', 'tool'] as const).map((kind) => <span key={kind} className="inline-flex items-center gap-1.5 capitalize"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[kind] }} />{kind}</span>)}
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Unavailable tool</span>
      <span className="ml-auto">{tools?.length ?? 0} registered tools · Updates automatically</span>
    </div>
  </div>
}
