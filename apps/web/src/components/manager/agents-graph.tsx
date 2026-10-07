import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { PersonaAgentDraft } from '@/lib/persona-agents'
import type { AgentThread } from '@/lib/agents-api'
import { AgentRow } from './agent-row'
import { AgentWaveBackground, type AgentWavePoint } from './agent-wave-background'

interface GraphNode { id: string; x?: number; y?: number; fx?: number; fy?: number }
export function AgentsGraph({ agents, threads, selectedId, onSave, onOpen, onChooseTask, onRefresh, onResume, resumeBusy }: {
  agents: PersonaAgentDraft[]
  threads: AgentThread[]
  selectedId: string | null
  onSave: (id: string, provider: string, model: string | null) => Promise<void>
  onOpen: (id: string) => void
  onChooseTask: (id: string) => void
  onRefresh: () => void
  onResume: (threadId: string) => Promise<void>
  resumeBusy?: boolean
}) {
  const wavePoints = useRef<AgentWavePoint[]>([])
  const wakeWave = useRef<(() => void) | null>(null)
  const drag = useRef<{ node: GraphNode; startX: number; startY: number; moved: boolean; target: HTMLElement } | null>(null)
  const suppressClick = useRef(false)
  const container = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined)
  const elements = useRef(new Map<string, HTMLDivElement>())
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const topology = JSON.stringify(agents.map(agent => [agent.id, agent.reportsToId]))
  const graph = useMemo(() => {
    const members = JSON.parse(topology) as [string, string | null][]
    const ids = new Set(members.map(([id]) => id))
    return {
      nodes: members.map(([id], index) => ({ id, x: Math.cos(index * Math.PI * 2 / members.length) * 220, y: Math.sin(index * Math.PI * 2 / members.length) * 220 }) as GraphNode),
      links: members.flatMap(([id, manager]) => manager && ids.has(manager) && manager !== id ? [{ source: manager, target: id }] : []),
    }
  }, [topology])
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const instance = graphRef.current
    instance?.d3Force('charge')?.strength(-1800)
    instance?.d3Force('link')?.distance(240)
    instance?.d3ReheatSimulation()
  }, [graph, dimensions.width > 0])
  const positionNodes = () => {
    const instance = graphRef.current
    if (!instance) return
    const points: AgentWavePoint[] = []
    for (const node of graph.nodes) {
      const element = elements.current.get(node.id)
      if (!element) continue
      const { x, y } = instance.graph2ScreenCoords(node.x ?? 0, node.y ?? 0)
      points.push({ id: node.id, x, y })
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -28px)`
    }
    wavePoints.current = points
    wakeWave.current?.()
  }
  return <div ref={container} className="relative min-h-0 flex-1 overflow-hidden bg-background" aria-label="Agent reporting graph">
    <AgentWaveBackground width={dimensions.width} height={dimensions.height} points={wavePoints} wake={wakeWave} />
    {dimensions.width > 0 && dimensions.height > 0 && <ForceGraph2D<GraphNode>
      ref={graphRef} width={dimensions.width} height={dimensions.height} graphData={graph} nodeId="id"
      nodeCanvasObject={() => {}} linkColor={() => '#8090a066'} linkDirectionalArrowLength={5}
      onRenderFramePost={positionNodes} cooldownTicks={120} d3VelocityDecay={0.3}
      minZoom={0.3} maxZoom={2} backgroundColor="transparent" enableNodeDrag={false}
    />}
    <div className="pointer-events-none absolute inset-0">
      {agents.map(agent => <div key={agent.id} ref={element => { if (element) elements.current.set(agent.id, element); else elements.current.delete(agent.id) }} className="pointer-events-auto absolute left-0 top-0 touch-none"
        onPointerDown={event => {
          if (event.button !== 0) return
          const target = (event.target as HTMLElement).closest<HTMLElement>('button[aria-label^="Open "]')
          const node = graph.nodes.find(item => item.id === agent.id)
          if (!target || !node) return
          drag.current = { node, startX: event.clientX, startY: event.clientY, moved: false, target }
          suppressClick.current = false
          target.setPointerCapture(event.pointerId)
          event.stopPropagation()
        }}
        onPointerMove={event => {
          const moving = drag.current
          const instance = graphRef.current
          const bounds = container.current?.getBoundingClientRect()
          if (!moving || moving.node.id !== agent.id || !instance || !bounds) return
          if (!moving.moved && Math.hypot(event.clientX - moving.startX, event.clientY - moving.startY) < 6) return
          moving.moved = true
          suppressClick.current = true
          const point = instance.screen2GraphCoords(event.clientX - bounds.left, event.clientY - bounds.top)
          moving.node.x = moving.node.fx = point.x
          moving.node.y = moving.node.fy = point.y
          instance.d3ReheatSimulation()
          positionNodes()
          event.stopPropagation()
        }}
        onPointerUp={event => {
          const moving = drag.current
          if (!moving || moving.node.id !== agent.id) return
          if (moving.target.hasPointerCapture(event.pointerId)) moving.target.releasePointerCapture(event.pointerId)
          drag.current = null
        }}
        onPointerCancel={() => { drag.current = null; suppressClick.current = false }}
        onClickCapture={event => {
          if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
        }}>
        <AgentRow onResume={onResume} resumeBusy={resumeBusy} compact selected={selectedId === agent.id} agent={agent} depth={0} threads={threads}
          onSaveProvider={(provider, model) => onSave(agent.id, provider, model)} onOpen={() => onOpen(agent.id)}
          onChooseTask={() => onChooseTask(agent.id)} onRefresh={onRefresh} />
      </div>)}
    </div>
  </div>
}
