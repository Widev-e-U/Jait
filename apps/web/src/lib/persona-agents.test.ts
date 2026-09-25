import { afterEach, describe, expect, it, vi } from 'vitest'

import { agentTaskPrompt, newPersonaAgentDraft, normalizePersonaAvatar, PERSONA_AVATARS, readPersonaAgentDrafts, savePersonaAgentDrafts, PERSONA_AGENTS_STORAGE_KEY } from './persona-agents'
import { availableManagers, organizationEntries } from './agent-organization'

function mockStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    },
  })
  return values
}

afterEach(() => vi.unstubAllGlobals())

describe('persona agent drafts', () => {
  it('includes assigned tasks as skills when starting work or asking the agent', () => {
    const agent = { ...newPersonaAgentDraft(), name: 'Researcher', persona: 'Create sourced reports', tasks: [
      { id: 'weekly', name: 'Weekly brief', prompt: 'Summarize the important updates', cron: '0 9 * * 1' },
    ] }
    expect(agentTaskPrompt(agent, 'What did you find?')).toContain('Weekly brief: Summarize the important updates')
    expect(agentTaskPrompt(agent, 'What did you find?')).toContain('Current request:\nWhat did you find?')
  })

  it('includes role and reporting context in work prompts', () => {
    const lead = { ...newPersonaAgentDraft(), id: 'lead', name: 'Ari', role: 'Research lead' }
    const worker = { ...newPersonaAgentDraft(), id: 'worker', name: 'Bo', role: 'Researcher', reportsToId: lead.id }
    const prompt = agentTaskPrompt(lead, 'Plan the work', [lead, worker])
    expect(prompt).toContain('You are Ari, Research lead.')
    expect(prompt).toContain('Your direct reports: Bo (Researcher).')
    expect(agentTaskPrompt(worker, 'Send an update', [lead, worker])).toContain('You report to Ari (Research lead).')
  })

  it('shows a hierarchy and excludes descendants from manager choices', () => {
    const lead = { ...newPersonaAgentDraft(), id: 'lead', name: 'Ari' }
    const worker = { ...newPersonaAgentDraft(), id: 'worker', name: 'Bo', reportsToId: lead.id }
    const intern = { ...newPersonaAgentDraft(), id: 'intern', name: 'Cy', reportsToId: worker.id }
    expect(organizationEntries([intern, worker, lead]).map(({ agent, depth }) => [agent.id, depth])).toEqual([
      ['lead', 0], ['worker', 1], ['intern', 2],
    ])
    expect(availableManagers(lead.id, [lead, worker, intern])).toEqual([])
    expect(availableManagers(intern.id, [lead, worker, intern]).map((agent) => agent.id)).toEqual(['lead', 'worker'])
  })

  it('maps existing emoji choices to illustrated avatars', () => {
    expect(normalizePersonaAvatar('🦊')).toBe(PERSONA_AVATARS[0])
    expect(normalizePersonaAvatar('🎨')).toBe(PERSONA_AVATARS[8])
    expect(normalizePersonaAvatar(PERSONA_AVATARS[3])).toBe(PERSONA_AVATARS[3])
    expect(normalizePersonaAvatar('unknown')).toBe(PERSONA_AVATARS[0])
  })

  it('round trips a draft while rejecting malformed stored data', () => {
    const values = mockStorage()
    const draft = { ...newPersonaAgentDraft(), name: 'Researcher', repositoryIds: ['repo-1'] }
    savePersonaAgentDrafts([draft])
    expect(readPersonaAgentDrafts()).toEqual([draft])

    values.set(PERSONA_AGENTS_STORAGE_KEY, JSON.stringify([{ ...draft, avatar: '🦉' }]))
    expect(readPersonaAgentDrafts()[0]?.avatar).toBe(PERSONA_AVATARS[1])

    values.set(PERSONA_AGENTS_STORAGE_KEY, JSON.stringify([{ id: 'broken', name: 'Bad', persona: '', repositoryIds: [], schedule: { kind: 'cron', cron: '0 9 * * *' } }]))
    expect(readPersonaAgentDrafts()).toEqual([])
    values.set(PERSONA_AGENTS_STORAGE_KEY, '{bad-json')
    expect(readPersonaAgentDrafts()).toEqual([])
  })
})
