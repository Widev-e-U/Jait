import { JAIT_PAGES, JAIT_PAGE_IDS, isJaitPageTool, type JaitPageId, type SkillInfo } from '@jait/shared'

export interface CatalogueTool {
  name: string
  description: string
  page?: JaitPageId
  category?: string
  risk?: string
  source?: string
  sourceMetadata?: { kind: string; pluginId?: string; pluginDisplayName?: string; serverId?: string; serverName?: string }
}
export type CatalogueSkill = Pick<SkillInfo, 'id' | 'name' | 'description' | 'source' | 'enabled' | 'toolsSatisfied'>

export interface CatalogueNode {
  id: string
  label: string
  description: string
  kind: 'root' | 'page' | 'feature' | 'tool' | 'skill'
  pageId?: JaitPageId
  available?: boolean
  tool?: CatalogueTool
  skill?: CatalogueSkill
  x?: number
  y?: number
  fx?: number
  fy?: number
}
export interface CatalogueLink { source: string | CatalogueNode; target: string | CatalogueNode }
export interface CatalogueGraphData { nodes: CatalogueNode[]; links: CatalogueLink[] }

function integrationFor(tool: CatalogueTool): { id: string; label: string } | undefined {
  const metadata = tool.sourceMetadata
  if (metadata?.kind === 'plugin' || tool.source?.startsWith('plugin:')) {
    const id = metadata?.pluginId ?? tool.source?.slice(7) ?? 'plugin'
    return { id: 'plugin:' + id, label: metadata?.pluginDisplayName ?? id }
  }
  if (metadata?.kind === 'mcp' || tool.source === 'mcp') {
    const id = metadata?.serverId ?? tool.name.split('.')[1] ?? 'mcp'
    return { id: 'mcp:' + id, label: metadata?.serverName ?? id }
  }
  if (tool.category === 'external') return { id: 'external', label: 'External tools' }
}

export function buildCatalogueGraph(
  tools: CatalogueTool[], pageFilter: JaitPageId | 'all' = 'all', search = '', skills: CatalogueSkill[] = [],
): CatalogueGraphData {
  const query = search.trim().toLowerCase()
  const nodes = new Map<string, CatalogueNode>()
  const links = new Map<string, CatalogueLink>()
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]))
  const matches = (text: string) => !query || text.toLowerCase().includes(query)
  const addLink = (source: string, target: string) => links.set(source + ':' + target, { source, target })
  nodes.set('jait', { id: 'jait', label: 'Jait', description: 'Explore the pages, features, tools, and skills available in this gateway.', kind: 'root', fx: 0, fy: 0 })
  for (const pageId of JAIT_PAGE_IDS) {
    if (pageFilter !== 'all' && pageFilter !== pageId) continue
    const page = JAIT_PAGES[pageId]
    const pageMatch = matches([page.title, page.description, ...page.examples].join(' '))
    const pageTools = tools.filter((tool) => isJaitPageTool(tool, pageId))
    const matchingFeatures = page.features.filter((feature) => matches(feature.id + ' ' + feature.description)
      || feature.toolRefs.some((name) => matches(name)))
    const matchingTools = pageTools.filter((tool) => matches([tool.name, tool.description, integrationFor(tool)?.label, integrationFor(tool)?.id].join(' ')))
    const matchingSkills = pageId === 'settings'
      ? skills.filter((skill) => pageMatch || matches('installed skills') || matches([skill.id, skill.name, skill.description, skill.source].join(' ')))
      : []
    if (!pageMatch && !matchingFeatures.length && !matchingTools.length && !matchingSkills.length) continue
    const pageNodeId = 'page:' + pageId
    nodes.set(pageNodeId, { id: pageNodeId, label: page.title, description: page.description, kind: 'page', pageId })
    addLink('jait', pageNodeId)
    if (pageId === 'settings' && (!query.trim() || matchingSkills.length)) {
      const branchId = 'feature:settings:installed-skills'
      nodes.set(branchId, { id: branchId, label: 'Installed skills', description: 'Browse the skills installed on this gateway.', kind: 'feature', pageId })
      addLink(pageNodeId, branchId)
      for (const skill of matchingSkills) {
        const id = 'skill:' + skill.id
        nodes.set(id, { id, label: skill.name, description: skill.description, kind: 'skill', pageId, skill })
        addLink(branchId, id)
      }
    }
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
    for (const tool of pageMatch ? pageTools : matchingTools) {
      const integration = integrationFor(tool)
      if (integration) {
        const id = 'integration:' + pageId + ':' + integration.id
        if (!nodes.has(id)) {
          nodes.set(id, { id, label: integration.label, description: 'Registered external tools from ' + integration.label + '.', kind: 'feature', pageId })
          addLink(pageNodeId, id)
        }
        addTool(tool.name, id)
      } else if (!linkedTools.has(tool.name)) addTool(tool.name, pageNodeId)
    }
  }
  return { nodes: [...nodes.values()], links: [...links.values()] }
}

export function catalogueEndpointId(endpoint: CatalogueLink['source']): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

/** The canvas resolves link endpoint IDs to node objects in place. */
export function getCataloguePath(graph: CatalogueGraphData, selectedId: string, preferredParent?: string): CatalogueNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const path: CatalogueNode[] = []
  let node = byId.get(selectedId) ?? byId.get('jait')
  const seen = new Set<string>()
  while (node && !seen.has(node.id)) {
    seen.add(node.id)
    path.unshift(node)
    const parents = graph.links.filter((link) => catalogueEndpointId(link.target) === node?.id)
    const parent = parents.find((link) => catalogueEndpointId(link.source) === preferredParent)
      ?? parents.find((link) => byId.get(catalogueEndpointId(link.source))?.pageId === node?.pageId)
      ?? parents[0]
    node = parent ? byId.get(catalogueEndpointId(parent.source)) : undefined
  }
  return path
}

/** Keep the branch's descendants and its breadcrumb path back to Jait. */
export function getCatalogueBranch(graph: CatalogueGraphData, branchId: string): CatalogueGraphData {
  if (branchId === 'jait') return graph

  const path = getCataloguePath(graph, branchId)
  const nodeIds = new Set(path.map((node) => node.id))
  const childLinks = new Map<string, CatalogueLink[]>()
  for (const link of graph.links) {
    const source = catalogueEndpointId(link.source)
    const outgoing = childLinks.get(source) ?? []
    outgoing.push(link)
    childLinks.set(source, outgoing)
  }

  const links: CatalogueLink[] = []
  for (let index = 1; index < path.length; index++) {
    const parent = path[index - 1].id
    const child = path[index].id
    const link = childLinks.get(parent)?.find(({ target }) => catalogueEndpointId(target) === child)
    if (link) links.push(link)
  }

  const pending = [branchId]
  while (pending.length) {
    for (const link of childLinks.get(pending.pop()!) ?? []) {
      links.push(link)
      const target = catalogueEndpointId(link.target)
      if (nodeIds.has(target)) continue
      nodeIds.add(target)
      pending.push(target)
    }
  }
  return { nodes: graph.nodes.filter(({ id }) => nodeIds.has(id)), links }
}
