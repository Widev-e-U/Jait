import { JAIT_PAGES, JAIT_PAGE_IDS, isJaitPageTool, type JaitPageId } from '@jait/shared'

export interface CatalogueTool {
  name: string
  description: string
  page?: JaitPageId
  category?: string
  risk?: string
  source?: string
}
export interface CatalogueNode {
  id: string
  label: string
  description: string
  kind: 'root' | 'page' | 'feature' | 'tool'
  pageId?: JaitPageId
  available?: boolean
  tool?: CatalogueTool
  x?: number
  y?: number
  fx?: number
  fy?: number
}
export interface CatalogueLink { source: string | CatalogueNode; target: string | CatalogueNode }
export interface CatalogueGraphData { nodes: CatalogueNode[]; links: CatalogueLink[] }

export function buildCatalogueGraph(tools: CatalogueTool[], pageFilter: JaitPageId | 'all' = 'all', search = ''): CatalogueGraphData {
  const query = search.trim().toLowerCase()
  const nodes = new Map<string, CatalogueNode>()
  const links = new Map<string, CatalogueLink>()
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]))
  const matches = (text: string) => !query || text.toLowerCase().includes(query)
  const addLink = (source: string, target: string) => links.set(source + ':' + target, { source, target })
  nodes.set('jait', { id: 'jait', label: 'Jait', description: 'Explore the pages, features, and tools available in this gateway.', kind: 'root', fx: 0, fy: 0 })
  for (const pageId of JAIT_PAGE_IDS) {
    if (pageFilter !== 'all' && pageFilter !== pageId) continue
    const page = JAIT_PAGES[pageId]
    const pageMatch = matches([page.title, page.description, ...page.examples].join(' '))
    const pageTools = tools.filter((tool) => isJaitPageTool(tool, pageId))
    const matchingFeatures = page.features.filter((feature) => matches(feature.id + ' ' + feature.description)
      || feature.toolRefs.some((name) => matches(name)))
    const matchingTools = pageTools.filter((tool) => matches(tool.name + ' ' + tool.description))
    if (!pageMatch && !matchingFeatures.length && !matchingTools.length) continue
    const pageNodeId = 'page:' + pageId
    nodes.set(pageNodeId, { id: pageNodeId, label: page.title, description: page.description, kind: 'page', pageId })
    addLink('jait', pageNodeId)
    const linkedTools = new Set<string>()
    const addTool = (name: string, parent: string) => {
      const tool = toolMap.get(name)
      const id = 'tool:' + name
      if (!nodes.has(id)) nodes.set(id, { id, label: name, description: tool?.description ?? 'This tool reference has no registered implementation in the current gateway.',
        kind: 'tool', available: Boolean(tool), tool, pageId: tool?.page ?? pageId })
      addLink(parent, id)
      linkedTools.add(name)
    }
    for (const feature of page.features) {
      const featureMatches = pageMatch || matchingFeatures.includes(feature)
        || feature.toolRefs.some((name) => matchingTools.some((tool) => tool.name === name))
      if (!featureMatches) continue
      const id = 'feature:' + pageId + ':' + feature.id
      nodes.set(id, { id, label: feature.id.replace(/[-_]/g, ' '), description: feature.description,
        kind: 'feature', pageId })
      addLink(pageNodeId, id)
      for (const name of feature.toolRefs) if (pageMatch || matches(name) || matchingFeatures.includes(feature)
        || matchingTools.some((tool) => tool.name === name)) addTool(name, id)
    }
    for (const tool of pageMatch ? pageTools : matchingTools) if (!linkedTools.has(tool.name)) addTool(tool.name, pageNodeId)
  }
  return { nodes: [...nodes.values()], links: [...links.values()] }
}
