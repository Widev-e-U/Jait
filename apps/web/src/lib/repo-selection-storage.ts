/**
 * repo-selection-storage — shared primitives for persisting "last selected
 * repository" choices in localStorage.
 *
 * Both the Manager (automation) page and the Todo page persist a
 * `{ repoId, localPath }` blob under their own storage key. The read/write
 * mechanics (SSR guard, JSON parsing with a legacy raw-id fallback, path
 * normalization for Windows/POSIX comparison) are shared here; each page's
 * storage module keeps only its own key plus its resolution policy.
 */

export interface PersistedRepoSelection {
  repoId: string | null
  localPath: string | null
}

export function normalizeRepositoryPathForComparison(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized
}

export function normalizePersistedRepoSelection(value: unknown): PersistedRepoSelection {
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

export function parsePersistedRepoSelection(raw: string): PersistedRepoSelection {
  try {
    return normalizePersistedRepoSelection(JSON.parse(raw))
  } catch {
    // Support the legacy raw-string repo id format.
  }

  return normalizePersistedRepoSelection(raw)
}

export function readPersistedRepoSelection(key: string): PersistedRepoSelection {
  if (typeof window === 'undefined') {
    return { repoId: null, localPath: null }
  }
  try {
    const value = window.localStorage.getItem(key)?.trim()
    if (!value) {
      return { repoId: null, localPath: null }
    }
    return parsePersistedRepoSelection(value)
  } catch {
    return { repoId: null, localPath: null }
  }
}

export function persistRepoSelection(
  key: string,
  repoId: string | null,
  localPath?: string | null,
): void {
  if (typeof window === 'undefined') return
  try {
    const normalizedRepoId = repoId?.trim() || null

    if (normalizedRepoId) {
      window.localStorage.setItem(key, JSON.stringify({
        repoId: normalizedRepoId,
        localPath: localPath?.trim() || null,
      }))
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage failures and keep the in-memory selection working.
  }
}