export const PULL_REQUEST_SELECTION_STORAGE_KEY = 'jait.pullRequests.selection.v1'

export interface PullRequestSelection {
  order: string[]
  lastSelected: string | null
}

function getStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    return storage ?? null
  } catch {
    return null
  }
}

export function readPullRequestSelection(): PullRequestSelection {
  const storage = getStorage()
  if (!storage) return { order: [], lastSelected: null }

  try {
    const raw = storage.getItem(PULL_REQUEST_SELECTION_STORAGE_KEY)
    if (!raw) return { order: [], lastSelected: null }

    const parsed = JSON.parse(raw) as { order?: unknown, lastSelected?: unknown }
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []
    const lastSelected =
      typeof parsed.lastSelected === 'string' && parsed.lastSelected.trim()
        ? parsed.lastSelected
        : null
    return { order, lastSelected }
  } catch {
    return { order: [], lastSelected: null }
  }
}

function writePullRequestSelection(selection: PullRequestSelection): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(PULL_REQUEST_SELECTION_STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Ignore storage failures and keep the in-memory selection working.
  }
}

export function rememberPullRequestRepository(repoId: string): void {
  const id = repoId?.trim()
  if (!id) return

  const current = readPullRequestSelection()
  const order = [id, ...current.order.filter((existing) => existing !== id)]

  writePullRequestSelection({ order, lastSelected: id })
}

export function orderPullRequestRepositories<T extends { id: string, name: string }>(
  repositories: T[],
): T[] {
  if (repositories.length === 0) return repositories

  const { order } = readPullRequestSelection()
  if (order.length === 0) return repositories

  const selected: T[] = []
  for (const id of order) {
    const repository = repositories.find((candidate) => candidate.id === id)
    if (repository) selected.push(repository)
  }

  const unselected = repositories
    .filter((repository) => !order.includes(repository.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...selected, ...unselected]
}
