import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SELECTED_REPO_STORAGE_KEY,
  persistSelectedRepoId,
  readPersistedSelectedRepo,
  readPersistedSelectedRepoId,
  resolvePersistedSelectedRepoId,
  resolveSelectedRepoIdForRepositories,
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

  it('reads a stored repo selection object', () => {
    localStorageMap.set(SELECTED_REPO_STORAGE_KEY, JSON.stringify({
      repoId: 'repo-123',
      localPath: '/work/repo',
    }))

    expect(readPersistedSelectedRepo()).toEqual({
      repoId: 'repo-123',
      localPath: '/work/repo',
    })
  })

  it('treats blank storage values as missing', () => {
    localStorageMap.set(SELECTED_REPO_STORAGE_KEY, '   ')

    expect(readPersistedSelectedRepoId()).toBeNull()
  })

  it('persists the selected repo id', () => {
    persistSelectedRepoId('repo-456', '/work/repo-456')

    expect(localStorageMap.get(SELECTED_REPO_STORAGE_KEY)).toBe(JSON.stringify({
      repoId: 'repo-456',
      localPath: '/work/repo-456',
    }))
    expect(localStorageMock.setItem).toHaveBeenCalledWith(SELECTED_REPO_STORAGE_KEY, JSON.stringify({
      repoId: 'repo-456',
      localPath: '/work/repo-456',
    }))
  })

  it('clears persisted selection when repo id is null', () => {
    localStorageMap.set(SELECTED_REPO_STORAGE_KEY, 'repo-789')

    persistSelectedRepoId(null)

    expect(localStorageMap.has(SELECTED_REPO_STORAGE_KEY)).toBe(false)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(SELECTED_REPO_STORAGE_KEY)
  })

  it('resolves a selection by repo id when present', () => {
    expect(resolvePersistedSelectedRepoId([
      { id: 'repo-1', localPath: '/work/one' },
      { id: 'repo-2', localPath: '/work/two' },
    ], {
      repoId: 'repo-2',
      localPath: '/work/two',
    })).toBe('repo-2')
  })

  it('falls back to local path when the repo id changed', () => {
    expect(resolvePersistedSelectedRepoId([
      { id: 'repo-1', localPath: '/work/one' },
      { id: 'repo-9', localPath: '/work/two' },
    ], {
      repoId: 'repo-2',
      localPath: '/work/two',
    })).toBe('repo-9')
  })

  it('keeps the current selection while repositories are still loading', () => {
    expect(resolveSelectedRepoIdForRepositories(
      [],
      'repo-2',
      { repoId: 'repo-2', localPath: '/work/two' },
    )).toBe('repo-2')
  })

  it('restores the persisted selection once repositories are available', () => {
    expect(resolveSelectedRepoIdForRepositories(
      [
        { id: 'repo-1', localPath: '/work/one' },
        { id: 'repo-9', localPath: '/work/two' },
      ],
      'repo-2',
      { repoId: 'repo-2', localPath: '/work/two' },
    )).toBe('repo-9')
  })
})
