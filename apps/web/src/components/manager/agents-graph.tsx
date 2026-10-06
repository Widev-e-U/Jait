import { useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ForceGraph2D from 'react-force-graph-2d'
import { providerIcon } from '@/components/icons/provider-icons'
import type { PersonaAgentDraft } from '@/lib/persona-agents'
import { AgentAvatar } from './agent-avatar'
import { AgentProviderEditor } from './agent-provider-editor'
import { Button } from '@/components/ui/button'

interface GraphNode { id: string; x?: number; y?: number }
export function AgentsGraph({ agents, onSave, onOpen }: {
  agents: PersonaAgentDraft[]
  onSave: (id: string, provider: string, model: string | null) => Promise<void>
  onOpen: (id: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const topology = JSON.stringify(agents.map(agent => [agent.id, agent.reportsToId]))
  const graph = useMemo(() => {
    const members = JSON.parse(topology) as [string, string | null][]
    const ids = new Set(members.map(([id]) => id))
    return { nodes: members.map(([id]) => ({ id }) as GraphNode), links: members.flatMap(([id, manager]) => manager && ids.has(manager) && manager !== id ? [{ source: manager, target: id }] : []) }
  }, [topology])
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(entries => { if (entries[0]) setWidth(Math.max(260, entries[0].contentRect.width)) })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const imageKey = JSON.stringify(agents.map(agent => [agent.id, agent.avatar, agent.providerId]))
  useEffect(() => {
    let cancelled = false
    const members = JSON.parse(imageKey) as [string, string, string][]
    void Promise.all(members.flatMap(([id, avatar, provider]) => {
      const Icon = providerIcon(provider)
      return [[id, renderToStaticMarkup(<AgentAvatar avatar={avatar} className="h-12 w-12" />)], [id + ':provider', renderToStaticMarkup(<Icon />)]].map(([key, svg]) => new Promise<[string, HTMLImageElement]>((resolve) => {
        const img = new Image()
        img.onload = () => resolve([key, img])
        img.onerror = () => resolve([key, img])
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/<svg\b[^>]*>/, tag => tag.replace(/\s(width|height|xmlns)="[^"]*"/g, '').replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"')).replaceAll('currentColor', '#7c8fa8'))
      }))
    })).then(items => { if (!cancelled) setImages(new Map(items)) })
    return () => { cancelled = true }
  }, [imageKey])
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  const selected = selectedId ? byId.get(selectedId) : undefined
  const hover = hoverId ? byId.get(hoverId) : undefined
  const summary = (agent: PersonaAgentDraft) => `${agent.model || 'Default model'} · ${agent.activeTasks == null ? 'Activity unavailable' : `${agent.activeTasks} active tasks · ${agent.liveState || 'Unknown'}`}`
  return <div className="space-y-3">
    <div ref={container} className="relative overflow-hidden rounded-xl border bg-muted/10" aria-label="Agent reporting graph">
      <ForceGraph2D<GraphNode> width={width} height={380} graphData={graph} nodeId="id" linkColor={() => '#8090a0'} cooldownTicks={100} d3VelocityDecay={0.3} minZoom={0.5} maxZoom={2}
        nodeCanvasObject={(node, ctx, scale) => {
          const agent = byId.get(node.id)
          if (!agent) return
          const x = node.x ?? 0, y = node.y ?? 0
          ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2)
          ctx.fillStyle = agent.liveState === 'running' ? '#14b8a633' : '#8090a022'; ctx.fill()
          const head = images.get(node.id)
          if (head?.complete && head.naturalWidth) ctx.drawImage(head, x - 22, y - 22, 44, 44)
          else { ctx.fillStyle = '#8090a0'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(agent.name.slice(0, 1), x, y + 5) }
          const icon = images.get(node.id + ':provider')
          if (icon?.complete && icon.naturalWidth) ctx.drawImage(icon, x - 7, y + 26, 14, 14)
          ctx.font = `${Math.max(10, 12 / scale)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#8090a0'
          ctx.fillText(agent.name, x, y + 53)
          if (agent.activeTasks != null) ctx.fillText(`${agent.activeTasks} active`, x, y + 68)
        }}
        nodePointerAreaPaint={(node, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x ?? 0, node.y ?? 0, 26, 0, Math.PI * 2); ctx.fill() }}
        onNodeClick={node => setSelectedId(node.id)} onNodeHover={node => setHoverId(node?.id ?? null)} nodeLabel={node => { const agent = byId.get(node.id); return (agent ? summary(agent) : '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!) }} />
      {hover && <p className="pointer-events-none absolute bottom-2 left-3 right-3 rounded bg-background/90 px-2 py-1 text-xs">{hover.name} · {summary(hover)}</p>}
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Choose an agent in the graph">
      {agents.map(agent => <button key={agent.id} type="button" aria-pressed={selectedId === agent.id} onClick={() => setSelectedId(agent.id)} onFocus={() => setHoverId(agent.id)} onBlur={() => setHoverId(null)} title={summary(agent)} className="rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-primary">{agent.name}</button>)}
    </div>
    {selected && <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><AgentAvatar avatar={selected.avatar} className="h-10 w-10" /><div><strong className="text-sm">{selected.name}</strong><p className="text-xs text-muted-foreground">{summary(selected)}</p></div><AgentProviderEditor key={selected.id} agent={selected} onSave={(provider, model) => onSave(selected.id, provider, model)} /><Button size="sm" variant="outline" onClick={() => onOpen(selected.id)}>Open agent</Button></div>}
  </div>
}
