import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TODO_SELECTED_REPO_STORAGE_KEY,
  persistTodoRepoSelection,
  readPersistedTodoRepoSelection,
  resolveTodoRepoSelection,
} from './todo-repo-selection-storage'

const localStorageMap = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageMap.set(key, value) }),
  removeItem: vi.fn((key: string) => { localStorageMap.delete(key) }),
}

describe('todo repo selection storage', () => {
  beforeEach(() => {
    localStorageMap.clear()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: localStorageMock },
      configurable: true,
      writable: true,
    })
  })

  it('reads and writes the selected todo repo', () => {
    persistTodoRepoSelection(' repo-2 ', ' /work/two ')

    expect(localStorageMap.get(TODO_SELECTED_REPO_STORAGE_KEY)).toBe(JSON.stringify({
      repoId: 'repo-2',
      localPath: '/work/two',
    }))
    expect(readPersistedTodoRepoSelection()).toEqual({
      repoId: 'repo-2',
      localPath: '/work/two',
    })
  })

  it('clears the persisted selection when the repo id is blank', () => {
    localStorageMap.set(TODO_SELECTED_REPO_STORAGE_KEY, 'repo-2')

    persistTodoRepoSelection('   ')

    expect(localStorageMap.has(TODO_SELECTED_REPO_STORAGE_KEY)).toBe(false)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(TODO_SELECTED_REPO_STORAGE_KEY)
  })

  it('restores the persisted repo id when repositories load', () => {
    expect(resolveTodoRepoSelection([
      { id: 'repo-1', localPath: '/work/one' },
      { id: 'repo-2', localPath: '/work/two' },
    ], null, {
      repoId: 'repo-2',
      localPath: '/work/two',
    })).toBe('repo-2')
  })

  it('falls back to the persisted local path when the repo id changed', () => {
    expect(resolveTodoRepoSelection([
      { id: 'repo-1', localPath: '/work/one' },
      { id: 'repo-9', localPath: '/work/two/' },
    ], null, {
      repoId: 'repo-2',
      localPath: '\\work\\two',
    })).toBe('repo-9')
  })

  it('keeps a valid current selection when there is no persisted match', () => {
    expect(resolveTodoRepoSelection([
      { id: 'repo-1', localPath: '/work/one' },
      { id: 'repo-2', localPath: '/work/two' },
    ], 'repo-2', {
      repoId: 'missing',
      localPath: '/work/missing',
    })).toBe('repo-2')
  })
})
