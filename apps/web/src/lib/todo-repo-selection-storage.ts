/**
 * todo-repo-selection-storage — Todo page's "last selected repo" storage.
 *
 * Read/write mechanics live in `repo-selection-storage`; this module owns the
 * storage key and the Todo page's resolution policy (persisted selection wins
 * over the in-memory one, falling back to the first repository).
 */

import {
  normalizeRepositoryPathForComparison,
  persistRepoSelection,
  readPersistedRepoSelection,
  type PersistedRepoSelection,
} from '@/lib/repo-selection-storage'

export const TODO_SELECTED_REPO_STORAGE_KEY = 'jait.todo.selected-repo.v1'

export type PersistedTodoRepoSelection = PersistedRepoSelection

export function readPersistedTodoRepoSelection(): PersistedTodoRepoSelection {
  return readPersistedRepoSelection(TODO_SELECTED_REPO_STORAGE_KEY)
}

export function persistTodoRepoSelection(repoId: string | null, localPath?: string | null): void {
  persistRepoSelection(TODO_SELECTED_REPO_STORAGE_KEY, repoId, localPath)
}

export function resolveTodoRepoSelection<T extends { id: string, localPath: string }>(
  repositories: T[],
  currentRepoId: string | null,
  persisted = readPersistedTodoRepoSelection(),
): string | null {
  if (repositories.length === 0) return currentRepoId

  if (persisted.repoId && repositories.some((repo) => repo.id === persisted.repoId)) {
    return persisted.repoId
  }

  if (persisted.localPath) {
    const persistedPath = normalizeRepositoryPathForComparison(persisted.localPath)
    const matchingRepo = repositories.find((repo) => normalizeRepositoryPathForComparison(repo.localPath) === persistedPath)
    if (matchingRepo) return matchingRepo.id
  }

  if (currentRepoId && repositories.some((repo) => repo.id === currentRepoId)) {
    return currentRepoId
  }

  return repositories[0]?.id ?? null
}