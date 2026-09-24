/**
 * Persisted split between the "Projects & Chats" pane and the "Personal chats"
 * pane in the session sidebar.
 *
 * The ratio (0–1) is how much of the available height the projects pane takes.
 * Like the developer sidebar width it is a local view preference, so it lives
 * in localStorage rather than on the server.
 */

export const SESSION_SIDEBAR_SPLIT_STORAGE_KEY = 'jait.sidebar.splitRatio'

/** Projects pane default: slightly over half so personal chats stay reachable. */
export const DEFAULT_SESSION_SIDEBAR_SPLIT = 0.6

/** Never let a pane fully collapse — a sliver must stay draggable. */
export const MIN_SESSION_SIDEBAR_SPLIT = 0.15
export const MAX_SESSION_SIDEBAR_SPLIT = 0.85

export function clampSessionSidebarSplit(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SESSION_SIDEBAR_SPLIT
  return Math.min(MAX_SESSION_SIDEBAR_SPLIT, Math.max(MIN_SESSION_SIDEBAR_SPLIT, ratio))
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Reads the persisted ratio, falling back to the default for missing/corrupt data. */
export function readSessionSidebarSplit(storage?: Pick<Storage, 'getItem'> | null): number {
  const store = storage ?? localStorageOrNull()
  if (!store) return DEFAULT_SESSION_SIDEBAR_SPLIT
  try {
    const raw = store.getItem(SESSION_SIDEBAR_SPLIT_STORAGE_KEY)
    if (!raw) return DEFAULT_SESSION_SIDEBAR_SPLIT
    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) ? clampSessionSidebarSplit(parsed) : DEFAULT_SESSION_SIDEBAR_SPLIT
  } catch {
    return DEFAULT_SESSION_SIDEBAR_SPLIT
  }
}

export function writeSessionSidebarSplit(
  ratio: number,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  const store = storage ?? localStorageOrNull()
  if (!store) return
  try {
    store.setItem(SESSION_SIDEBAR_SPLIT_STORAGE_KEY, String(clampSessionSidebarSplit(ratio)))
  } catch {
    /* private mode / quota — dragging still works, it just won't persist */
  }
}

/** Converts a pointer position into the ratio it implies inside the pane container. */
export function sessionSidebarSplitFromPointer(
  pointerY: number,
  containerTop: number,
  containerHeight: number,
): number {
  if (containerHeight <= 0) return DEFAULT_SESSION_SIDEBAR_SPLIT
  return clampSessionSidebarSplit((pointerY - containerTop) / containerHeight)
}
