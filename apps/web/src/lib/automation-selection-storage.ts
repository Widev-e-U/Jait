/**
 * automation-selection-storage — Manager page's "last selected repo" storage.
 *
 * Read/write mechanics live in `repo-selection-storage`; this module owns the
 * storage key and the resolution policy used by the automation view
 * (current selection wins over the persisted one; fall back to first repo).
 */

import {
  normalizePersistedRepoSelection,
  normalizeRepositoryPathForComparison,
  persistRepoSelection,
  readPersistedRepoSelection,
  type PersistedRepoSelection,
} from '@/lib/repo-selection-storage'

export const SELECTED_REPO_STORAGE_KEY = 'jait:selected-repo-id'

export type PersistedSelectedRepo = PersistedRepoSelection

export function normalizePersistedSelectedRepo(value: unknown): PersistedSelectedRepo {
  return normalizePersistedRepoSelection(value)
}

export function readPersistedSelectedRepo(): PersistedSelectedRepo {
  return readPersistedRepoSelection(SELECTED_REPO_STORAGE_KEY)
}

export function readPersistedSelectedRepoId(): string | null {
  return readPersistedSelectedRepo().repoId
}

export function persistSelectedRepoId(repoId: string | null, localPath?: string | null): void {
  persistRepoSelection(SELECTED_REPO_STORAGE_KEY, repoId, localPath)
}

export function resolvePersistedSelectedRepoId<T extends { id: string, localPath: string }>(
  repositories: T[],
  persisted = readPersistedSelectedRepo(),
): string | null {
  if (persisted.repoId && repositories.some((repo) => repo.id === persisted.repoId)) {
    return persisted.repoId
  }

  if (persisted.localPath) {
    const persistedPath = normalizeRepositoryPathForComparison(persisted.localPath)
    return repositories.find((repo) => normalizeRepositoryPathForComparison(repo.localPath) === persistedPath)?.id ?? null
  }

  return null
}

export function resolveSelectedRepoIdForRepositories<T extends { id: string, localPath: string }>(
  repositories: T[],
  currentSelectedRepoId: string | null,
  persisted = readPersistedSelectedRepo(),
): string | null {
  if (repositories.length === 0) {
    return currentSelectedRepoId
  }

  const persistedRepoId = resolvePersistedSelectedRepoId(repositories, persisted)
  if ((!currentSelectedRepoId || repositories.every((repo) => repo.id !== currentSelectedRepoId)) && persistedRepoId) {
    return persistedRepoId
  }

  if (!currentSelectedRepoId) {
    return repositories[0].id
  }

  if (repositories.every((repo) => repo.id !== currentSelectedRepoId)) {
    return repositories[0]?.id ?? null
  }

  return currentSelectedRepoId
}