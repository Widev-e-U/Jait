export type PersonaSchedule = { kind: 'adaptive'; rules: string } | { kind: 'cron'; cron: string }

export interface PersonaAgentDraft {
  id: string
  name: string
  persona: string
  avatar: string
  providerId: 'jait' | 'codex' | 'claude-code'
  skillIds: string[]
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
export const PERSONA_AVATARS = ['Nova', 'Atlas', 'Pixel', 'Orbit', 'Echo', 'Sage', 'Bolt', 'Muse', 'Scout', 'Cosmo'] as const
const LEGACY_PERSONA_AVATARS = ['🦊', '🦉', '🐼', '🦁', '🐻', '🦋', '🌿', '⭐', '🎨', '🧭'] as const

export function normalizePersonaAvatar(avatar: unknown): typeof PERSONA_AVATARS[number] {
  if (typeof avatar !== 'string') return PERSONA_AVATARS[0]
  const legacyIndex = LEGACY_PERSONA_AVATARS.findIndex((legacy) => legacy === avatar)
  if (legacyIndex !== -1) return PERSONA_AVATARS[legacyIndex]
  return PERSONA_AVATARS.find((choice) => choice === avatar) ?? PERSONA_AVATARS[0]
}

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
    ).map((agent) => ({
      ...agent,
      avatar: normalizePersonaAvatar(agent.avatar),
      providerId: agent.providerId === 'codex' || agent.providerId === 'claude-code' ? agent.providerId : 'jait',
      skillIds: Array.isArray(agent.skillIds) ? agent.skillIds.filter((id): id is string => typeof id === 'string') : [],
    }))
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
    avatar: PERSONA_AVATARS[0],
    providerId: 'jait',
    skillIds: [],
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
