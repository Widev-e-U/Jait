import { afterEach, describe, expect, it, vi } from 'vitest'

import { newPersonaAgentDraft, readPersonaAgentDrafts, savePersonaAgentDrafts, PERSONA_AGENTS_STORAGE_KEY } from './persona-agents'
import { MANAGER_PAGE_STORAGE_KEY, readStoredManagerPage, storeManagerPage } from './view-mode-storage'

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

describe('manager page persistence', () => {
  it('restores the last manager page and ignores invalid stored values', () => {
    const values = mockStorage()
    expect(readStoredManagerPage()).toBe('threads')
    storeManagerPage('agents')
    expect(values.get(MANAGER_PAGE_STORAGE_KEY)).toBe('agents')
    expect(readStoredManagerPage()).toBe('agents')
    values.set(MANAGER_PAGE_STORAGE_KEY, 'settings')
    expect(readStoredManagerPage()).toBe('threads')
  })
})

describe('persona agent drafts', () => {
  it('round trips a draft while rejecting malformed stored data', () => {
    const values = mockStorage()
    const draft = { ...newPersonaAgentDraft(), name: 'Researcher', repositoryIds: ['repo-1'] }
    savePersonaAgentDrafts([draft])
    expect(readPersonaAgentDrafts()).toEqual([draft])

    values.set(PERSONA_AGENTS_STORAGE_KEY, JSON.stringify([{ id: 'broken', name: 'Bad', persona: '', repositoryIds: [], schedule: { kind: 'cron', cron: '0 9 * * *' } }]))
    expect(readPersonaAgentDrafts()).toEqual([])
    values.set(PERSONA_AGENTS_STORAGE_KEY, '{bad-json')
    expect(readPersonaAgentDrafts()).toEqual([])
  })
})
