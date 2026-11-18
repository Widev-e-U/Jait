/**
 * Pure state helpers for the embedded Todos tab in the project/chat editor.
 *
 * The Todos tab reuses the editor tab bar (like the architecture preview) so the
 * desktop layout can keep the todo list visible next to project files and chats.
 * Keeping the tab math here (append/refresh/close/neighbor selection) makes the
 * behaviour testable without rendering the whole project panel.
 */

/** Stable tab id so the toggle button can focus an already-open Todos tab. */
export const TODOS_TAB_ID = 'todos'

/** Sentinel path used by the panel to route the editor pane to the todos view. */
export const TODOS_TAB_PATH = '__todos__'

export interface EditorTabLike {
  id: string
  type: string
}

/** True when a Todos tab is currently open. */
export function hasTodosTab(tabs: ReadonlyArray<EditorTabLike>): boolean {
  return tabs.some((tab) => tab.type === 'todos')
}

/**
 * Append the Todos tab, or refresh it in place when it already exists so it can
 * never be duplicated by repeated toggles.
 */
export function upsertTodosTab<T extends EditorTabLike>(tabs: ReadonlyArray<T>, tab: T): T[] {
  const existing = tabs.find((entry) => entry.id === tab.id)
  if (existing) {
    return tabs.map((entry) => (entry.id === tab.id ? { ...entry, ...tab } : entry))
  }
  return [...tabs, tab]
}

export interface CloseTodosTabResult<T> {
  /** Remaining tabs with the Todos tab removed. */
  tabs: T[]
  /** Whether the Todos tab was the active one, so the caller must re-activate. */
  wasActive: boolean
  /** Neighbor tab that should take focus when the Todos tab was active. */
  neighbor: T | null
  /** Active tab id after closing; null when the tab list is now empty. */
  activeTabId: string | null
}

/**
 * Close the Todos tab. When it was active, focus falls back to the neighbor at
 * the same index (or the new last tab), matching normal editor tab closing.
 */
export function closeTodosTab<T extends EditorTabLike>(
  tabs: ReadonlyArray<T>,
  activeTabId: string | null,
): CloseTodosTabResult<T> {
  const index = tabs.findIndex((tab) => tab.type === 'todos')
  if (index < 0) return { tabs: [...tabs], wasActive: false, neighbor: null, activeTabId }

  const todosTab = tabs[index]
  const next = tabs.filter((tab) => tab.id !== todosTab.id)
  const wasActive = todosTab.id === activeTabId
  const neighbor = next[Math.min(index, next.length - 1)] ?? null

  return {
    tabs: next,
    wasActive,
    neighbor: wasActive ? neighbor : null,
    activeTabId: wasActive ? (neighbor?.id ?? null) : activeTabId,
  }
}

/**
 * Tab types that are allowed to be dragged out into their own window.
 *
 * Preview tabs carry live DOM/iframe state and the Todos tab is panel-wide
 * chrome, so neither can be detached. Declaring the predicate as a type guard
 * lets callers reuse it for both the tab strip and the detach handler while
 * still narrowing the tab union to a detachable type.
 */
export type DetachableTabType = 'file' | 'diff' | 'architecture'

/** Whether a tab type can be dragged out into its own window. */
export function canDetachTab(type: string): type is DetachableTabType {
  return type === 'file' || type === 'diff' || type === 'architecture'
}
