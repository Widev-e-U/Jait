import { describe, it, expect } from 'vitest'
import { buildCatalogueGraph, type CatalogueTool } from './catalogue-graph'

const tools: CatalogueTool[] = [
  { name: 'agent.profiles', description: 'Manage saved people and teams', page: 'agents' },
  { name: 'agent.profiles.inspect', description: 'Inspect saved profiles', page: 'agents' },
  { name: 'thread.control', description: 'Execute work', page: 'threads' },
  { name: 'custom.new.tool', description: 'A newly registered capability', page: 'agents' },
]
describe('live catalogue graph', () => {
  it('uses shared page membership, feature refs, and preserves shared tool nodes without duplicates', () => {
    const graph = buildCatalogueGraph(tools)
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length)
    expect(graph.nodes.filter((node) => node.id === 'tool:thread.control')).toHaveLength(1)
    expect(graph.links).toContainEqual({ source: 'feature:agents:work', target: 'tool:thread.control' })
    expect(graph.links).toContainEqual({ source: 'feature:threads:execution', target: 'tool:thread.control' })
    expect(graph.links).toContainEqual({ source: 'page:agents', target: 'tool:custom.new.tool' })
    for (const link of graph.links) {
      expect(graph.nodes.some((node) => node.id === link.source)).toBe(true)
      expect(graph.nodes.some((node) => node.id === link.target)).toBe(true)
    }
  })
  it('focuses a page and exposes unavailable references without inventing availability', () => {
    const graph = buildCatalogueGraph(tools, 'agents')
    expect(graph.nodes.filter((node) => node.kind === 'page').map((node) => node.pageId)).toEqual(['agents'])
    expect(graph.nodes.find((node) => node.id === 'tool:cron.add')?.available).toBe(false)
    expect(graph.nodes.find((node) => node.id === 'tool:agent.profiles')?.available).toBe(true)
    const removed = buildCatalogueGraph([], 'agents')
    expect(removed.nodes.find((node) => node.id === 'tool:agent.profiles')?.available).toBe(false)
  })
  it('searches new tool names and descriptions and returns a clean empty match', () => {
    const graph = buildCatalogueGraph(tools, 'all', 'newly registered')
    expect(graph.nodes.filter((node) => node.kind === 'page').map((node) => node.pageId)).toEqual(['agents'])
    expect(graph.nodes.find((node) => node.id === 'tool:custom.new.tool')).toBeDefined()
    expect(buildCatalogueGraph(tools, 'all', 'unmatched-query').nodes).toHaveLength(1)
  })
});
