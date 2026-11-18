import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { PersonaAgentDraft } from '@/lib/persona-agents'
import type { AgentThread } from '@/lib/agents-api'
import { layoutAgentGraph } from '@/lib/agent-graph-layout'
import { AgentRow } from './agent-row'
import { AgentWaveBackground, type AgentWavePoint } from './agent-wave-background'

interface GraphNode { id: string; x: number; y: number; fx: number; fy: number }
const INITIAL_ZOOM = 0.9
const CARD_ANCHOR_Y = 28

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
  const [area, setArea] = useState({ width: 0, height: 0, cardWidth: 128, cardHeight: 132 })
  const [readyNodes, setReadyNodes] = useState<GraphNode[] | null>(null)
  // Activity polling and API ordering must not regenerate positions or reset a user's pan/drag.
  const topology = JSON.stringify(agents.map(agent => [agent.id, agent.reportsToId ?? null]).sort(([a], [b]) => a!.localeCompare(b!)))
  const graph = useMemo(() => {
    const members = (JSON.parse(topology) as [string, string | null][]).map(([id, reportsToId]) => ({ id, reportsToId }))
    const ids = new Set(members.map(member => member.id))
    return {
      nodes: layoutAgentGraph(members, { ...area, anchorY: CARD_ANCHOR_Y }).map(point => {
        const x = (point.x - area.width / 2) / INITIAL_ZOOM
        const y = (point.y - area.height / 2) / INITIAL_ZOOM
        return { id: point.id, x, y, fx: x, fy: y }
      }),
      links: members.flatMap(({ id, reportsToId }) => reportsToId && ids.has(reportsToId) && reportsToId !== id ? [{ source: reportsToId, target: id }] : []),
    }
  }, [topology, area])
  const ready = readyNodes === graph.nodes

  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      const cards = [...elements.current.values()]
      const next = { width, height,
        cardWidth: Math.max(128, ...cards.map(card => card.offsetWidth)),
        cardHeight: Math.max(132, ...cards.map(card => card.offsetHeight)) }
      setArea(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const card of elements.current.values()) observer.observe(card)
    return () => observer.disconnect()
  }, [topology])

  const positionNodes = useCallback(() => {
    const instance = graphRef.current
    if (!instance) return
    const points: AgentWavePoint[] = []
    for (const node of graph.nodes) {
      const element = elements.current.get(node.id)
      if (!element) continue
      const { x, y } = instance.graph2ScreenCoords(node.x, node.y)
      points.push({ id: node.id, x, y })
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -${CARD_ANCHOR_Y}px)`
    }
    wavePoints.current = points
    wakeWave.current?.()
  }, [graph])

  useLayoutEffect(() => {
    const instance = graphRef.current
    if (!instance || !area.width || !area.height) return
    // All nodes are pinned before reaching the engine. Set the viewport before
    // revealing the cards, so entering the page never exposes intermediate positions.
    instance.zoom(INITIAL_ZOOM, 0)
    instance.centerAt(0, 0, 0)
    positionNodes()
    setReadyNodes(graph.nodes)
  }, [graph, area.width, area.height, positionNodes])

  return <div ref={container} className="relative min-h-0 flex-1 overflow-hidden bg-background" aria-label="Agent reporting graph"
    data-graph-layout={ready ? 'solved' : 'measuring'}>
    <AgentWaveBackground width={area.width} height={area.height} points={wavePoints} wake={wakeWave} />
    {area.width > 0 && area.height > 0 && <ForceGraph2D<GraphNode>
      ref={graphRef} width={area.width} height={area.height} graphData={graph} nodeId="id"
      nodeCanvasObject={() => {}} linkColor={() => '#8090a066'} linkDirectionalArrowLength={5}
      onRenderFramePost={positionNodes} cooldownTicks={0}
      minZoom={0.05} maxZoom={2} backgroundColor="transparent" enableNodeDrag={false}
    />}
    <div className="pointer-events-none absolute inset-0" style={{ visibility: ready ? 'visible' : 'hidden' }}>
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
