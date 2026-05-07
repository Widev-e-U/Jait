export const TODO_SELECTED_REPO_STORAGE_KEY = 'jait.todo.selected-repo.v1'

export interface PersistedTodoRepoSelection {
  repoId: string | null
  localPath: string | null
}

function normalizeRepositoryPathForComparison(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized
}

function normalizePersistedTodoRepoSelection(value: unknown): PersistedTodoRepoSelection {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const parsed = value as { repoId?: unknown, localPath?: unknown }
    return {
      repoId: typeof parsed.repoId === 'string' && parsed.repoId.trim() ? parsed.repoId.trim() : null,
      localPath: typeof parsed.localPath === 'string' && parsed.localPath.trim() ? parsed.localPath.trim() : null,
    }
  }

  if (typeof value === 'string') {
    return {
      repoId: value.trim() || null,
      localPath: null,
    }
  }

  return { repoId: null, localPath: null }
}

function parsePersistedTodoRepoSelection(raw: string): PersistedTodoRepoSelection {
  try {
    return normalizePersistedTodoRepoSelection(JSON.parse(raw))
  } catch {
    return normalizePersistedTodoRepoSelection(raw)
  }
}

export function readPersistedTodoRepoSelection(): PersistedTodoRepoSelection {
  if (typeof window === 'undefined') return { repoId: null, localPath: null }

  try {
    const value = window.localStorage.getItem(TODO_SELECTED_REPO_STORAGE_KEY)?.trim()
    if (!value) return { repoId: null, localPath: null }
    return parsePersistedTodoRepoSelection(value)
  } catch {
    return { repoId: null, localPath: null }
  }
}

export function persistTodoRepoSelection(repoId: string | null, localPath?: string | null): void {
  if (typeof window === 'undefined') return

  try {
    const normalizedRepoId = repoId?.trim() || null
    if (!normalizedRepoId) {
      window.localStorage.removeItem(TODO_SELECTED_REPO_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(TODO_SELECTED_REPO_STORAGE_KEY, JSON.stringify({
      repoId: normalizedRepoId,
      localPath: localPath?.trim() || null,
    }))
  } catch {
    // Ignore storage failures; the current page selection still works in memory.
  }
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
