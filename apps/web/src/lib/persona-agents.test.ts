import { afterEach, describe, expect, it, vi } from 'vitest'

import { newPersonaAgentDraft, normalizePersonaAvatar, PERSONA_AVATARS, readPersonaAgentDrafts, savePersonaAgentDrafts, PERSONA_AGENTS_STORAGE_KEY } from './persona-agents'

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
