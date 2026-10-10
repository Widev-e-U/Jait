import { describe, it, expect } from 'vitest'
import { buildCatalogueGraph, type CatalogueTool } from './catalogue-graph'

const tools: CatalogueTool[] = [
  { name: 'agent.profiles', description: 'Manage saved people and teams', page: 'agents' },
  { name: 'agent.profiles.inspect', description: 'Inspect saved profiles', page: 'agents' },
  { name: 'thread.control', description: 'Execute work', page: 'threads' },
  { name: 'custom.new.tool', description: 'A newly registered capability', page: 'agents' },
]
describe('live catalogue graph', () => {
  it('groups plugin and MCP tools by integration, searches their names, and removes disconnected tools', () => {
    const external: CatalogueTool[] = [
      { name: 'rea.inspect', description: 'Inspect binaries', category: 'external', source: 'plugin:rea', sourceMetadata: { kind: 'plugin', pluginId: 'rea', pluginDisplayName: 'Reverse Engineer Anything' } },
      { name: 'rea.strings', description: 'Read strings', category: 'external', source: 'plugin:rea', sourceMetadata: { kind: 'plugin', pluginId: 'rea', pluginDisplayName: 'Reverse Engineer Anything' } },
      { name: 'mcp.docs.read', description: 'Read documents', category: 'external', source: 'mcp', sourceMetadata: { kind: 'mcp', serverId: 'docs', serverName: 'Documentation Server' } },
    ]
    const graph = buildCatalogueGraph(external)
    expect(graph.nodes.find(node => node.id === 'integration:settings:plugin:rea')?.label).toBe('Reverse Engineer Anything')
    expect(graph.links).toContainEqual({ source: 'integration:settings:plugin:rea', target: 'tool:rea.inspect' })
    expect(graph.links).toContainEqual({ source: 'integration:settings:mcp:docs', target: 'tool:mcp.docs.read' })
    const search = buildCatalogueGraph(external, 'settings', 'Reverse Engineer Anything')
    expect(search.nodes.filter(node => node.kind === 'tool').map(node => node.label)).toEqual(['rea.inspect', 'rea.strings'])
    expect(buildCatalogueGraph(external, 'agents').nodes.some(node => node.id === 'tool:rea.inspect')).toBe(false)
    expect(buildCatalogueGraph([], 'settings').nodes.some(node => node.id.startsWith('integration:'))).toBe(false)
    expect(new Set(graph.nodes.map(node => node.id)).size).toBe(graph.nodes.length)
  })
  it('supports external tools without metadata and explicit page associations', () => {
    const graph = buildCatalogueGraph([
      { name: 'custom.inspect', description: 'Inspect', category: 'external' },
      { name: 'plugin.inspect', description: 'Inspect', page: 'network', category: 'external', source: 'plugin:scanner' },
    ])
    expect(graph.links).toContainEqual({ source: 'integration:settings:external', target: 'tool:custom.inspect' })
    expect(graph.links).toContainEqual({ source: 'integration:network:plugin:scanner', target: 'tool:plugin.inspect' })
    expect(graph.nodes.some(node => node.id === 'integration:settings:plugin:scanner')).toBe(false)
  })
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
