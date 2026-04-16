export const SELECTED_REPO_STORAGE_KEY = 'jait:selected-repo-id'

export interface PersistedSelectedRepo {
  repoId: string | null
  localPath: string | null
}

function parsePersistedSelectedRepo(raw: string): PersistedSelectedRepo {
  try {
    const parsed = JSON.parse(raw) as { repoId?: unknown, localPath?: unknown }
    if (parsed && typeof parsed === 'object') {
      return {
        repoId: typeof parsed.repoId === 'string' && parsed.repoId.trim() ? parsed.repoId.trim() : null,
        localPath: typeof parsed.localPath === 'string' && parsed.localPath.trim() ? parsed.localPath.trim() : null,
      }
    }
  } catch {
    // Support the legacy raw-string repo id format.
  }

  return {
    repoId: raw.trim() || null,
    localPath: null,
  }
}

export function readPersistedSelectedRepo(): PersistedSelectedRepo {
  if (typeof window === 'undefined') {
    return { repoId: null, localPath: null }
  }
  try {
    const value = window.localStorage.getItem(SELECTED_REPO_STORAGE_KEY)?.trim()
    if (!value) {
      return { repoId: null, localPath: null }
    }
    return parsePersistedSelectedRepo(value)
  } catch {
    return { repoId: null, localPath: null }
  }
}

export function readPersistedSelectedRepoId(): string | null {
  return readPersistedSelectedRepo().repoId
}

export function persistSelectedRepoId(repoId: string | null, localPath?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (repoId) {
      window.localStorage.setItem(SELECTED_REPO_STORAGE_KEY, JSON.stringify({
        repoId,
        localPath: localPath?.trim() || null,
      }))
    } else {
      window.localStorage.removeItem(SELECTED_REPO_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures and keep the in-memory selection working.
  }
}

export function resolvePersistedSelectedRepoId<T extends { id: string, localPath: string }>(
  repositories: T[],
  persisted = readPersistedSelectedRepo(),
): string | null {
  if (persisted.repoId && repositories.some((repo) => repo.id === persisted.repoId)) {
    return persisted.repoId
  }

  if (persisted.localPath) {
    return repositories.find((repo) => repo.localPath === persisted.localPath)?.id ?? null
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
