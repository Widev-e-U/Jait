import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SELECTED_REPO_STORAGE_KEY,
  persistSelectedRepoId,
  readPersistedSelectedRepoId,
} from './automation-selection-storage'

const localStorageMap = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageMap.set(key, value) }),
  removeItem: vi.fn((key: string) => { localStorageMap.delete(key) }),
}

describe('automation selection storage', () => {
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

  it('reads a stored repo id', () => {
    localStorageMap.set(SELECTED_REPO_STORAGE_KEY, 'repo-123')

    expect(readPersistedSelectedRepoId()).toBe('repo-123')
    expect(localStorageMock.getItem).toHaveBeenCalledWith(SELECTED_REPO_STORAGE_KEY)
  })

  it('treats blank storage values as missing', () => {
    localStorageMap.set(SELECTED_REPO_STORAGE_KEY, '   ')

    expect(readPersistedSelectedRepoId()).toBeNull()
  })

  it('persists the selected repo id', () => {
    persistSelectedRepoId('repo-456')

    expect(localStorageMap.get(SELECTED_REPO_STORAGE_KEY)).toBe('repo-456')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(SELECTED_REPO_STORAGE_KEY, 'repo-456')
  })

  it('clears persisted selection when repo id is null', () => {
    localStorageMap.set(SELECTED_REPO_STORAGE_KEY, 'repo-789')

    persistSelectedRepoId(null)

    expect(localStorageMap.has(SELECTED_REPO_STORAGE_KEY)).toBe(false)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(SELECTED_REPO_STORAGE_KEY)
  })
})
