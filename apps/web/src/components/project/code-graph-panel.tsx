import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type {
  CodeGraphEdge,
  CodeGraphIndex,
  CodeGraphNode,
  CodeGraphQueryResult,
  CodeGraphSnapshot,
} from '@jait/shared'
import {
  AlertCircle,
  Braces,
  DatabaseZap,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'
import { TooltipHint } from '@/components/ui/tooltip'

interface GraphNode extends CodeGraphNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface GraphLink {
  id: string
  source: string | GraphNode
  target: string | GraphNode
  data: CodeGraphEdge
}

interface CodeGraphPanelProps {
  projectRoot?: string | null
  mode: 'graph' | 'query'
  theme?: 'dark' | 'light'
}

const NODE_COLORS: Record<string, string> = {
  class: '#8b5cf6',
  function: '#3b82f6',
  method: '#06b6d4',
  module: '#f59e0b',
  file: '#64748b',
  interface: '#ec4899',
  variable: '#22c55e',
  unknown: '#94a3b8',
}

function nodeColor(node: CodeGraphNode): string {
  return NODE_COLORS[node.type.toLowerCase()] ?? '#64748b'
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

function IndexSummary({ index }: { index: CodeGraphIndex }) {
  const stats = index.stats
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className={`h-1.5 w-1.5 rounded-full ${index.status === 'ready' ? 'bg-emerald-500' : index.status === 'error' ? 'bg-destructive' : 'bg-amber-500'}`} />
        Graphify {index.status}
      </span>
      {stats ? <span>{stats.nodeCount.toLocaleString()} nodes</span> : null}
      {stats ? <span>{stats.edgeCount.toLocaleString()} edges</span> : null}
      <span>GraphRAG {index.graphRagStatus}</span>
      {index.sourceRevision ? <TooltipHint content={index.sourceRevision}><span>revision {index.sourceRevision.slice(0, 8)}</span></TooltipHint> : null}
    </div>
  )
}

function EmptyGraph({
  index,
  busy,
  error,
  onIndex,
}: {
  index: CodeGraphIndex | null
  busy: boolean
  error: string | null
  onIndex: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/30">
        <GitBranch className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-sm font-medium">Build the repository knowledge graph</h3>
        <p className="text-xs text-muted-foreground">
          Graphify extracts symbols and typed relationships locally. Jait then exposes that graph to the UI and agent tools.
        </p>
      </div>
      {error ? (
        <div className="max-w-lg rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <Button size="sm" onClick={onIndex} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
        {index?.status === 'error' ? 'Retry index' : 'Index with Graphify'}
      </Button>
      <p className="text-2xs text-muted-foreground">Graphify is installed and versioned automatically by Jait.</p>
    </div>
  )
}

export function CodeGraphPanel({ projectRoot, mode, theme = 'dark' }: CodeGraphPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [index, setIndex] = useState<CodeGraphIndex | null>(null)
  const [snapshot, setSnapshot] = useState<CodeGraphSnapshot | null>(null)
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null)
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [queryMode, setQueryMode] = useState<CodeGraphQueryResult['mode']>('hybrid')
  const [queryResult, setQueryResult] = useState<CodeGraphQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [mode, snapshot])

  const loadStatus = useCallback(async () => {
    if (!projectRoot) return
    const params = new URLSearchParams({ projectRoot })
    const response = await apiFetch(`${getApiUrl()}/api/code-graph?${params}`)
    const data = await readJson<{ index: CodeGraphIndex }>(response)
    setIndex(data.index)
    return data.index
  }, [projectRoot])

  const loadSnapshot = useCallback(async () => {
    if (!projectRoot) return
    const params = new URLSearchParams({ projectRoot, maxNodes: '2500' })
    const response = await apiFetch(`${getApiUrl()}/api/code-graph/snapshot?${params}`)
    const data = await readJson<{ snapshot: CodeGraphSnapshot }>(response)
    setSnapshot(data.snapshot)
    setIndex(data.snapshot.index)
    window.setTimeout(() => graphRef.current?.zoomToFit(500, 40), 80)
  }, [projectRoot])

  useEffect(() => {
    setIndex(null)
    setSnapshot(null)
    setQueryResult(null)
    setSelectedNode(null)
    setError(null)
    if (!projectRoot) return
    void loadStatus()
      .then((nextIndex) => nextIndex?.status === 'ready' ? loadSnapshot() : undefined)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load code graph'))
  }, [loadSnapshot, loadStatus, projectRoot])

  const handleIndex = useCallback(async () => {
    if (!projectRoot) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch(`${getApiUrl()}/api/code-graph/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot }),
      })
      const data = await readJson<{ index: CodeGraphIndex }>(response)
      setIndex(data.index)
      await loadSnapshot()
    } catch (indexError) {
      setError(indexError instanceof Error ? indexError.message : 'Failed to index project')
      await loadStatus().catch(() => undefined)
    } finally {
      setLoading(false)
    }
  }, [loadSnapshot, loadStatus, projectRoot])

  const handlePrepareGraphRag = useCallback(async () => {
    if (!projectRoot) return
    setPreparing(true)
    setError(null)
    try {
      const response = await apiFetch(`${getApiUrl()}/api/code-graph/graphrag/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot }),
      })
      const data = await readJson<{ index: CodeGraphIndex }>(response)
      setIndex(data.index)
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : 'Failed to prepare GraphRAG data')
      await loadStatus().catch(() => undefined)
    } finally {
      setPreparing(false)
    }
  }, [loadStatus, projectRoot])

  const handleQuery = useCallback(async () => {
    if (!projectRoot || !query.trim()) return
    setQuerying(true)
    setError(null)
    try {
      const response = await apiFetch(`${getApiUrl()}/api/code-graph/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot, query: query.trim(), mode: queryMode, maxNodes: 160, maxDepth: 3 }),
      })
      const data = await readJson<{ result: CodeGraphQueryResult }>(response)
      setQueryResult(data.result)
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Graph query failed')
    } finally {
      setQuerying(false)
    }
  }, [projectRoot, query, queryMode])

  const graphData = useMemo(() => {
    const source = queryResult ?? snapshot
    if (!source) return { nodes: [] as GraphNode[], links: [] as GraphLink[] }
    const normalized = filter.trim().toLowerCase()
    const nodes = source.nodes
      .filter((node) => !normalized || [node.label, node.type, node.sourceFile].some((value) => value?.toLowerCase().includes(normalized)))
      .map((node) => ({ ...node }))
    const ids = new Set(nodes.map((node) => node.id))
    const links = source.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, data: edge }))
    return { nodes, links }
  }, [filter, queryResult, snapshot])

  const drawNode = useCallback((node: GraphNode, context: CanvasRenderingContext2D, globalScale: number) => {
    const radius = Math.max(3.5, Math.min(10, 3.5 + Math.log2(node.degree + 1)))
    context.beginPath()
    context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2)
    context.fillStyle = nodeColor(node)
    context.fill()
    if (selectedNode?.id === node.id) {
      context.strokeStyle = theme === 'dark' ? '#f8fafc' : '#0f172a'
      context.lineWidth = 1.5 / globalScale
      context.stroke()
    }
    if (globalScale > 1.7 || selectedNode?.id === node.id) {
      const fontSize = 11 / globalScale
      context.font = `${fontSize}px ui-sans-serif, system-ui`
      context.fillStyle = theme === 'dark' ? '#e2e8f0' : '#1e293b'
      context.textAlign = 'center'
      context.textBaseline = 'top'
      context.fillText(node.label, node.x ?? 0, (node.y ?? 0) + radius + 2 / globalScale)
    }
  }, [selectedNode, theme])

  if (!projectRoot) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Open a project to build its code graph.</div>
  }

  if (mode === 'query') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b bg-muted/10 p-3">
          <div className="mx-auto flex max-w-4xl flex-col gap-2">
            <div className="flex items-center gap-2">
              <Textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void handleQuery()
                }}
                placeholder="Trace a request from the API route to storage…"
                className="min-h-[64px] resize-none text-sm"
              />
              <Button className="h-[64px] px-4" onClick={() => void handleQuery()} disabled={querying || !query.trim() || index?.status !== 'ready'}>
                {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Braces className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['structural', 'hybrid', 'global'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQueryMode(value)}
                  className={`rounded-md border px-2 py-1 text-2xs transition-colors ${queryMode === value ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {value}
                </button>
              ))}
              <span className="text-2xs text-muted-foreground">Ctrl/⌘ + Enter to query</span>
              <div className="ml-auto">
                {index ? <IndexSummary index={index} /> : null}
              </div>
            </div>
          </div>
        </div>
        {error ? <div className="border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {!queryResult ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <DatabaseZap className="h-8 w-8" />
              <p className="text-sm">Retrieve a traceable multi-hop context from the repository graph.</p>
              <p className="text-xs">Structural mode works from Graphify alone. Prepare GraphRAG below to stage global reasoning datasets.</p>
              {index?.status === 'ready' && index.graphRagStatus !== 'prepared' ? (
                <Button variant="outline" size="sm" onClick={() => void handlePrepareGraphRag()} disabled={preparing}>
                  {preparing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="mr-1.5 h-3.5 w-3.5" />}
                  Prepare GraphRAG stage
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                  <Braces className="h-3.5 w-3.5" />
                  Retrieved graph context
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">{queryResult.context}</pre>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg border p-3 text-xs">
                  <div className="mb-2 font-medium">Result</div>
                  <div className="space-y-1 text-muted-foreground">
                    <div>{queryResult.nodes.length} nodes</div>
                    <div>{queryResult.edges.length} relationships</div>
                    <div>{queryResult.mode} retrieval</div>
                    <div>GraphRAG {queryResult.graphRagStatus}</div>
                  </div>
                </div>
                <div className="rounded-lg border p-3 text-xs">
                  <div className="mb-2 font-medium">Top symbols</div>
                  <div className="space-y-1 text-muted-foreground">
                    {queryResult.nodes.slice(0, 12).map((node) => (
                      <TooltipHint key={node.id} content={node.sourceFile}><div className="truncate">{node.label} <span className="opacity-60">· {node.type}</span></div></TooltipHint>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-9 flex-wrap items-center gap-2 border-b bg-muted/10 px-2 py-1.5">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter symbols, files, types…" className="h-7 pl-7 text-xs" />
        </div>
        {index ? <IndexSummary index={index} /> : null}
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void handleIndex()} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Refresh
        </Button>
        {index?.status === 'ready' ? (
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void handlePrepareGraphRag()} disabled={preparing}>
            {preparing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <DatabaseZap className="mr-1 h-3 w-3" />}
            {index.graphRagStatus === 'prepared' ? 'Rebuild GraphRAG' : 'Prepare GraphRAG'}
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-background">
        {snapshot && graphData.nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node: GraphNode, color, context) => {
              context.beginPath()
              context.arc(node.x ?? 0, node.y ?? 0, 9, 0, Math.PI * 2)
              context.fillStyle = color
              context.fill()
            }}
            linkColor={(link: GraphLink) => link.data.confidence === 'EXTRACTED' ? '#64748b' : '#475569'}
            linkWidth={(link: GraphLink) => link.data.confidence === 'EXTRACTED' ? 1.2 : 0.65}
            linkDirectionalArrowLength={2.5}
            linkDirectionalArrowRelPos={1}
            onNodeClick={(node: GraphNode) => setSelectedNode(node)}
            cooldownTicks={100}
            d3VelocityDecay={0.3}
            minZoom={0.3}
            maxZoom={12}
            enableNodeDrag
            enableZoomInteraction
            enablePanInteraction
            backgroundColor="transparent"
          />
        ) : index?.status === 'building' || loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Graphify is indexing the repository…
          </div>
        ) : (
          <EmptyGraph index={index} busy={loading} error={error} onIndex={() => void handleIndex()} />
        )}
        {snapshot?.truncated ? (
          <div className="absolute bottom-2 left-2 rounded border bg-background/90 px-2 py-1 text-2xs text-muted-foreground shadow-sm">
            Showing the 2,500 highest-degree nodes.
          </div>
        ) : null}
        {selectedNode ? (
          <div className="absolute inset-y-2 right-2 w-[290px] overflow-auto rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(selectedNode) }} />
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-medium">{selectedNode.label}</div>
                <div className="text-2xs text-muted-foreground">{selectedNode.type} · degree {selectedNode.degree}</div>
              </div>
              <button type="button" onClick={() => setSelectedNode(null)} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            </div>
            {selectedNode.sourceFile ? (
              <div className="mt-3 rounded-md bg-muted/40 p-2 font-mono text-xs">
                {selectedNode.sourceFile}{selectedNode.line ? `:${selectedNode.line}` : ''}
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border p-2"><div className="text-2xs text-muted-foreground">Community</div>{selectedNode.community ?? '—'}</div>
              <div className="rounded border p-2"><div className="text-2xs text-muted-foreground">File type</div>{selectedNode.fileType ?? '—'}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
