import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { JAIT_PAGES, JAIT_PAGE_IDS, type JaitPageId } from '@jait/shared'
import { BookOpen, RefreshCw, Search, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getApiUrl } from '@/lib/gateway-url'
import { getAuthToken } from '@/lib/auth-token'
import { openNotification } from '@/lib/notification-navigation'
import { buildCatalogueGraph, catalogueEndpointId, getCataloguePath, type CatalogueTool, type CatalogueSkill, type CatalogueNode, type CatalogueLink } from '@/lib/catalogue-graph'
import { CatalogueDetails } from './catalogue-details'

const COLORS = { root: '#f472b6', page: '#38bdf8', feature: '#a78bfa', tool: '#34d399', skill: '#fb7185' }
const RADII = { root: 10, page: 8, feature: 5, tool: 3, skill: 4 }
const NODE_HIT_RADIUS = 11
const SKILLS_LINK = `${JAIT_PAGES.settings.path}?tab=skills&skillsTab=installed`

function escapeLabel(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
}

function cameraDuration(duration: number): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration
}

async function fetchCatalogue<T>(path: string, options: RequestInit, label: string, parse: (data: unknown) => T): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, options)
  if (!response.ok) throw new Error(`Could not load ${label} (${response.status})`)
  return parse(await response.json())
}

function readTools(data: unknown): CatalogueTool[] {
  const tools = (data as { tools?: CatalogueTool[] } | null)?.tools
  if (!Array.isArray(tools) || !tools.every((tool) => typeof tool?.name === 'string' && typeof tool.description === 'string')) {
    throw new Error('Invalid catalogue response')
  }
  return tools
}

function readSkills(data: unknown): CatalogueSkill[] {
  const skills = data as CatalogueSkill[]
  if (!Array.isArray(skills) || !skills.every((skill) => typeof skill?.id === 'string' && typeof skill.name === 'string'
    && typeof skill.description === 'string' && typeof skill.source === 'string' && typeof skill.enabled === 'boolean')) {
    throw new Error('Invalid skills response')
  }
  return skills.map(({ id, name, description, source, enabled, toolsSatisfied }) => ({ id, name, description, source, enabled, toolsSatisfied }))
}

export default function CatalogueGraph({ onNavigate }: { onNavigate: () => void }) {
  const [tools, setTools] = useState<CatalogueTool[]>([])
  const [skills, setSkills] = useState<CatalogueSkill[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [refresh, setRefresh] = useState(0)
  const [pageFilter, setPageFilter] = useState<JaitPageId | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<{ id: string; parent?: string }>({ id: 'jait' })
  const [collapsed, setCollapsed] = useState(false)
  const textColorRef = useRef('#94a3b8')
  const primaryColorRef = useRef('#3b82f6')
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<CatalogueNode, CatalogueLink> | undefined>(undefined)
  const hasFitRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const focusedPage = pageFilter !== 'all'
  const searching = Boolean(query.trim())
  const graph = useMemo(() => {
    const data = buildCatalogueGraph(tools, pageFilter, query, skills ?? [])
    if (!focusedPage) return data
    const leaves = data.nodes.filter((node) => node.kind === 'tool' || node.kind === 'skill')
    const positions = new Map(leaves.map((node, index) => [node.id, (index - (leaves.length - 1) / 2) * 54]))
    for (const node of data.nodes) {
      const leafY = positions.get(node.id)
      const children = data.links.filter((link) => link.source === node.id)
        .map((link) => positions.get(catalogueEndpointId(link.target))).filter((y): y is number => y !== undefined)
      node.x = node.fx = node.kind === 'root' ? -180 : node.kind === 'page' ? -85 : node.kind === 'feature' ? 10 : 160
      node.y = node.fy = leafY ?? (node.kind === 'feature' && children.length
        ? children.reduce((sum, value) => sum + value, 0) / children.length : 0)
    }
    return data
  }, [tools, skills, focusedPage, pageFilter, query])
  const path = useMemo(() => getCataloguePath(graph, selection.id, selection.parent), [graph, selection])
  const selected = path[path.length - 1] ?? graph.nodes[0]
  const pathEdges = useMemo(() => new Map(path.slice(1).map((node, index) => [node.id, path[index].id])), [path])
  const onPath = useCallback(({ source, target }: CatalogueLink) => pathEdges.get(catalogueEndpointId(target)) === catalogueEndpointId(source), [pathEdges])
  const skillDestination = selected.skill || selected.id === 'feature:settings:installed-skills'
  const page = selected.pageId ? JAIT_PAGES[selected.pageId] : undefined
  const destination = selected.skill ? `${SKILLS_LINK}&${new URLSearchParams({ skillsQ: selected.skill.id })}`
    : skillDestination ? SKILLS_LINK : page?.path

  const fitGraph = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    graph.zoomToFit(hasFitRef.current ? cameraDuration(280) : 0, focusedPage ? 28 : 45)
    hasFitRef.current = true
  }, [focusedPage])

  const focusPage = useCallback((id: JaitPageId | 'all') => {
    if (pageFilter === id) fitGraph()
    setPageFilter(id)
    setSelection({ id: id === 'all' ? 'jait' : `page:${id}` })
  }, [fitGraph, pageFilter])

  const choose = useCallback((node: CatalogueNode) => {
    const connected = graph.links.some(({ source, target }) => catalogueEndpointId(source) === selected.id && catalogueEndpointId(target) === node.id)
    setSelection({ id: node.id, parent: connected ? selected.id : node.id === selection.id ? selection.parent : undefined })
  }, [graph.links, selected.id, selection])

  const chooseFromGraph = (node: CatalogueNode, event: MouseEvent) => {
    const start = pointerStartRef.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return
    choose(node)
  }

  const chooseFromDetails = (node: CatalogueNode) => {
    choose(node)
    if (node.x !== undefined && node.y !== undefined) {
      graphRef.current?.centerAt(node.x, node.y, cameraDuration(280))
    }
  }

  const canPan = (event: MouseEvent | TouchEvent) => {
    const camera = graphRef.current
    if (!camera || !(event.currentTarget instanceof HTMLCanvasElement)) return true
    if ('touches' in event && event.touches.length !== 1) return true
    const pointer = 'touches' in event ? event.touches[0] : event
    const bounds = event.currentTarget.getBoundingClientRect()
    const { x, y } = camera.screen2GraphCoords(pointer.clientX - bounds.left, pointer.clientY - bounds.top)
    return !graph.nodes.some((node) => node.x !== undefined && node.y !== undefined
      && Math.hypot(node.x - x, node.y - y) <= NODE_HIT_RADIUS)
  }

  useEffect(() => {
    let active: AbortController | undefined
    const load = async () => {
      active?.abort()
      const controller = new AbortController()
      active = controller
      const token = getAuthToken()
      const options = { signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      setLoading(true)
      const [toolResult, skillResult] = await Promise.allSettled([
        fetchCatalogue('/api/tools', options, 'catalogue tools', readTools),
        fetchCatalogue('/api/skills', options, 'installed skills', readSkills),
      ])
      if (controller.signal.aborted) return
      if (toolResult.status === 'fulfilled') setTools((previous) => JSON.stringify(previous) === JSON.stringify(toolResult.value) ? previous : toolResult.value)
      if (skillResult.status === 'fulfilled') setSkills((previous) => JSON.stringify(previous) === JSON.stringify(skillResult.value) ? previous : skillResult.value)
      setErrors([toolResult, skillResult].flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []))
      setLoading(false)
    }
    void load()
    const reload = () => { void load() }
    const interval = setInterval(reload, 30_000)
    window.addEventListener('focus', reload)
    return () => { active?.abort(); clearInterval(interval); window.removeEventListener('focus', reload) }
  }, [refresh])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const readColors = () => {
      const style = getComputedStyle(element)
      textColorRef.current = style.color
      const primary = style.getPropertyValue('--primary').trim()
      if (primary) primaryColorRef.current = `hsl(${primary})`
    }
    readColors()
    const themeObserver = new MutationObserver(readColors)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height })
    })
    observer.observe(element)
    return () => { observer.disconnect(); themeObserver.disconnect() }
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(fitGraph)
    return () => cancelAnimationFrame(frame)
  }, [size, fitGraph])

  const drawNode = useCallback((node: CatalogueNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const radius = RADII[node.kind]
    const color = node.available === false ? '#f59e0b' : COLORS[node.kind]
    const x = node.x ?? 0
    const y = node.y ?? 0
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    const isSelected = selected.id === node.id
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(x, y, radius + 4 / scale, 0, Math.PI * 2)
      ctx.strokeStyle = primaryColorRef.current
      ctx.lineWidth = 1.5 / scale
      ctx.stroke()
    }
    const isLeaf = node.kind === 'tool' || node.kind === 'skill'
    const isDetail = node.kind === 'feature' || isLeaf
    if (!focusedPage && isDetail && !pathEdges.has(node.id) && scale < 1 && node.id !== 'feature:settings:installed-skills') return
    ctx.font = `${isSelected ? '600 ' : ''}${12 / scale}px sans-serif`
    ctx.fillStyle = textColorRef.current
    ctx.textAlign = isLeaf && focusedPage ? 'right' : 'center'
    ctx.textBaseline = 'top'
    const label = node.label.length > 42 ? node.label.slice(0, 40) + '…' : node.label
    ctx.fillText(label, isLeaf && focusedPage ? x - 8 : x, y + radius + 3)
  }, [selected.id, focusedPage, pathEdges])

  const update = () => setRefresh((value) => value + 1)
  const zoomBy = (factor: number) => {
    const camera = graphRef.current
    if (camera) camera.zoom(camera.zoom() * factor, cameraDuration(200))
  }
  const skillsMessage = !searching && (pageFilter === 'all' || pageFilter === 'settings')
    ? skills ? 'No installed skills.' : loading ? 'Loading installed skills…' : 'Installed skills unavailable.'
    : undefined
  const controls = [
    { label: 'Fit catalogue graph', Icon: Scan, onClick: fitGraph },
    { label: 'Zoom in catalogue graph', Icon: ZoomIn, onClick: () => zoomBy(1.5) },
    { label: 'Zoom out catalogue graph', Icon: ZoomOut, onClick: () => zoomBy(1 / 1.5) },
  ]

  return <div className="flex min-h-0 flex-1 flex-col gap-2.5" data-testid="catalogue-explorer">
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" className="h-10 pl-9" placeholder="Search…" aria-label="Search catalogue"
          value={query} onChange={(event) => { setQuery(event.target.value); setCollapsed(false) }} />
      </div>
      <Select value={pageFilter} onValueChange={(value) => focusPage(value as JaitPageId | 'all')}>
        <SelectTrigger aria-label="Catalogue page" className="h-10 w-32 shrink-0 sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All pages</SelectItem>
          {JAIT_PAGE_IDS.map((id) => <SelectItem key={id} value={id}>{JAIT_PAGES[id].title}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" className="h-10" onClick={() => {
        setQuery('')
        focusPage('settings')
        setSelection({ id: 'feature:settings:installed-skills' })
        setCollapsed(false)
      }}>
        <BookOpen aria-hidden="true" /> Skills
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="size-10" aria-label="Refresh catalogue" disabled={loading} onClick={update}>
            <RefreshCw aria-hidden="true" className={loading ? 'motion-safe:animate-spin' : undefined} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh catalogue</TooltipContent>
      </Tooltip>
    </div>
    {errors.length > 0 && <div role="alert" className="shrink-0 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
      {errors.join(' · ')} <button type="button" className="ml-2 rounded underline focus-visible:ring-2 focus-visible:ring-ring" onClick={update}>Retry</button>
    </div>}
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto md:flex-row md:overflow-hidden">
      <div ref={containerRef} onPointerDownCapture={(event) => {
        pointerStartRef.current = { x: event.clientX, y: event.clientY }
      }} className="relative min-h-[7rem] min-w-0 flex-1 overflow-hidden rounded-lg border bg-muted/20 md:min-h-0" data-testid="catalogue-graph" aria-label="Interactive catalogue graph" role="region">
        {size.width > 0 && size.height > 0 && <ForceGraph2D
          ref={graphRef} width={size.width} height={size.height} graphData={graph} nodeId="id"
          dagMode={focusedPage ? undefined : 'radialout'} dagLevelDistance={90}
          nodeCanvasObject={drawNode} nodeLabel={(node: CatalogueNode) => escapeLabel(node.label)}
          nodePointerAreaPaint={(node: CatalogueNode, color, ctx) => {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(node.x ?? 0, node.y ?? 0, NODE_HIT_RADIUS, 0, Math.PI * 2)
            ctx.fill()
          }}
          linkColor={(link: CatalogueLink) => onPath(link) ? primaryColorRef.current : '#94a3b866'}
          linkWidth={(link: CatalogueLink) => onPath(link) ? 2.5 : 1}
          linkDirectionalArrowLength={(link: CatalogueLink) => onPath(link) ? 5 : 0}
          enableNodeDrag={false} enablePanInteraction={canPan}
          onNodeClick={chooseFromGraph} onEngineStop={fitGraph} warmupTicks={50} cooldownTicks={1}
          d3VelocityDecay={0.4} minZoom={0.2} maxZoom={8} backgroundColor="transparent"
        />}
        {searching && graph.nodes.length === 1 && <p role="status" className="pointer-events-none absolute inset-x-3 top-3 rounded bg-background/95 px-3 py-2 text-sm text-muted-foreground">No matching catalogue entries.</p>}
        <div className="absolute bottom-2 left-2 flex gap-1">
          {controls.map(({ label, Icon, onClick }) => <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="size-9 bg-background" aria-label={label} onClick={onClick}><Icon aria-hidden="true" /></Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>)}
        </div>
      </div>
      <CatalogueDetails nodes={graph.nodes} path={path} selected={selected} collapsed={collapsed} focusedPage={focusedPage}
        searching={searching} showInstalledSkills={pageFilter === 'settings'} skillsMessage={skillsMessage} destinationLabel={skillDestination ? 'Open Skills settings' : page && `Open ${page.title}`}
        onToggle={() => setCollapsed((value) => !value)} onChoose={chooseFromDetails} onNavigate={() => {
          if (destination) {
            onNavigate()
            openNotification({ id: 'catalogue:' + selected.id, link: destination })
          }
        }} />
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Catalogue graph legend">
      {(['page', 'feature', 'tool', 'skill'] as const).map((kind) => <span key={kind} className="inline-flex items-center gap-1.5 capitalize">
        <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: COLORS[kind] }} />{kind}
      </span>)}
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />Unavailable tool</span>
    </div>
  </div>
}
