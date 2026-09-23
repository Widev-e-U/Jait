export type PersonaSchedule = { kind: 'adaptive'; rules: string } | { kind: 'cron'; cron: string }

export interface PersonaAgentDraft {
  id: string
  name: string
  persona: string
  repositoryIds: string[]
  schedule: PersonaSchedule
  allowedTools: string[]
  requiresApproval: boolean
  notificationChannels: string[]
  notificationEvents: Array<'task_done' | 'blocked' | 'question'>
  paused: boolean
  updatedAt: string
}

export const PERSONA_AGENTS_STORAGE_KEY = 'jait.personaAgentDrafts'

export function readPersonaAgentDrafts(): PersonaAgentDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PERSONA_AGENTS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((agent): agent is PersonaAgentDraft =>
      typeof agent === 'object' && agent !== null
      && typeof agent.id === 'string'
      && typeof agent.name === 'string'
      && typeof agent.persona === 'string'
      && Array.isArray(agent.repositoryIds)
      && agent.repositoryIds.every((id: unknown) => typeof id === 'string')
      && (agent.schedule?.kind === 'cron' && typeof agent.schedule.cron === 'string' || agent.schedule?.kind === 'adaptive' && typeof agent.schedule.rules === 'string')
      && Array.isArray(agent.allowedTools)
      && agent.allowedTools.every((tool: unknown) => typeof tool === 'string')
      && typeof agent.requiresApproval === 'boolean'
      && Array.isArray(agent.notificationChannels)
      && agent.notificationChannels.every((channel: unknown) => typeof channel === 'string')
      && Array.isArray(agent.notificationEvents)
      && agent.notificationEvents.every((event: unknown) => event === 'task_done' || event === 'blocked' || event === 'question')
    )
  } catch {
    return []
  }
}

export function savePersonaAgentDrafts(drafts: PersonaAgentDraft[]): void {
  window.localStorage.setItem(PERSONA_AGENTS_STORAGE_KEY, JSON.stringify(drafts))
}

export function newPersonaAgentDraft(): PersonaAgentDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '',
    persona: '',
    repositoryIds: [],
    schedule: { kind: 'adaptive', rules: '' },
    allowedTools: [],
    requiresApproval: true,
    notificationChannels: [],
    notificationEvents: ['task_done', 'blocked', 'question'],
    paused: true,
    updatedAt: new Date().toISOString(),
  }
}
