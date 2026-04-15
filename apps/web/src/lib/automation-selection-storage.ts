export const SELECTED_REPO_STORAGE_KEY = 'jait:selected-repo-id'

export function readPersistedSelectedRepoId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(SELECTED_REPO_STORAGE_KEY)?.trim()
    return value || null
  } catch {
    return null
  }
}

export function persistSelectedRepoId(repoId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (repoId) {
      window.localStorage.setItem(SELECTED_REPO_STORAGE_KEY, repoId)
    } else {
      window.localStorage.removeItem(SELECTED_REPO_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures and keep the in-memory selection working.
  }
}
