import { beforeEach, describe, expect, it } from 'vitest'

import {
  readProjectModelSelections,
  readProjectProviderSelection,
  readProjectReasoningEffortSelection,
  saveProjectModelSelection,
  saveProjectProviderSelection,
  saveProjectReasoningEffortSelection,
} from '@/lib/project-model-cache'

const storage = new Map<string, string>()

const localStorageMock: Storage = {
  get length() { return storage.size },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => { storage.delete(key) },
  setItem: (key, value) => { storage.set(key, value) },
}

describe('project model cache', () => {
  beforeEach(() => storage.clear())

  it('keeps the last selected model isolated per project and provider', () => {
    saveProjectModelSelection('project-a', 'codex', 'gpt-5.4', localStorageMock)
    saveProjectModelSelection('project-b', 'codex', 'gpt-5.3-codex', localStorageMock)
    saveProjectModelSelection('project-a', 'claude-code', 'claude-opus-4-1', localStorageMock)

    expect(readProjectModelSelections('project-a', localStorageMock)).toEqual({
      codex: 'gpt-5.4',
      'claude-code': 'claude-opus-4-1',
    })
    expect(readProjectModelSelections('project-b', localStorageMock)).toEqual({
      codex: 'gpt-5.3-codex',
    })
  })

  it('keeps the last selected provider isolated per project', () => {
    saveProjectProviderSelection('project-a', 'codex', localStorageMock)
    saveProjectProviderSelection('project-b', 'jait', localStorageMock)

    expect(readProjectProviderSelection('project-a', localStorageMock)).toBe('codex')
    expect(readProjectProviderSelection('project-b', localStorageMock)).toBe('jait')

    saveProjectProviderSelection('project-a', 'claude-code', localStorageMock)
    expect(readProjectProviderSelection('project-a', localStorageMock)).toBe('claude-code')
  })

  it('restores reasoning effort with the project and provider selection', () => {
    saveProjectProviderSelection('project-a', 'codex', localStorageMock)
    saveProjectModelSelection('project-a', 'codex', 'gpt-5.6-sol', localStorageMock)
    saveProjectReasoningEffortSelection('project-a', 'codex', 'ultra', localStorageMock)

    saveProjectProviderSelection('project-b', 'jait', localStorageMock)
    saveProjectReasoningEffortSelection('project-b', 'jait', 'low', localStorageMock)

    expect(readProjectReasoningEffortSelection('project-b', 'jait', localStorageMock)).toBe('low')
    expect(readProjectReasoningEffortSelection('project-a', 'codex', localStorageMock)).toBe('ultra')
  })

  it('distinguishes an explicit default effort from no project preference', () => {
    saveProjectReasoningEffortSelection('project-a', 'codex', null, localStorageMock)

    expect(readProjectReasoningEffortSelection('project-a', 'codex', localStorageMock)).toBeNull()
    expect(readProjectReasoningEffortSelection('project-b', 'codex', localStorageMock)).toBeUndefined()
  })
})
