import type { PersonaAgentDraft } from './persona-agents'

export interface OrganizationEntry {
  agent: PersonaAgentDraft
  depth: number
}

/** Keep older, unlinked agents visible as roots and guard against malformed legacy data. */
export function organizationEntries(agents: PersonaAgentDraft[]): OrganizationEntry[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name))
  const visited = new Set<string>()
  const entries: OrganizationEntry[] = []
  const visit = (agent: PersonaAgentDraft, depth: number) => {
    if (visited.has(agent.id)) return
    visited.add(agent.id)
    entries.push({ agent, depth })
    for (const report of sorted) if (report.reportsToId === agent.id) visit(report, depth + 1)
  }
  for (const agent of sorted) if (!agent.reportsToId || !byId.has(agent.reportsToId)) visit(agent, 0)
  for (const agent of sorted) visit(agent, 0)
  return entries
}

/** A manager cannot be the agent itself or one of its descendants. */
export function availableManagers(agentId: string, agents: PersonaAgentDraft[]): PersonaAgentDraft[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  return agents.filter((candidate) => {
    const seen = new Set<string>()
    let current: PersonaAgentDraft | undefined = candidate
    while (current && !seen.has(current.id)) {
      if (current.id === agentId) return false
      seen.add(current.id)
      current = current.reportsToId ? byId.get(current.reportsToId) : undefined
    }
    return true
  }).sort((a, b) => a.name.localeCompare(b.name))
}
