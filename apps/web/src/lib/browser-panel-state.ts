/** Remember the floating browser's collapsed state per conversation and tab. */
const collapsedByConversation = new Map<string, boolean>()
const storagePrefix = 'jait:browser-collapsed:'

/** The state the user left this chat in, or undefined when never touched. */
export function readBrowserCollapsed(conversationId?: string | null): boolean | undefined {
  if (!conversationId) return undefined
  const cached = collapsedByConversation.get(conversationId)
  if (cached !== undefined) return cached
  try {
    const value = window.sessionStorage.getItem(storagePrefix + conversationId)
    if (value === 'true' || value === 'false') return value === 'true'
  } catch { /* Storage may be unavailable, including during server rendering. */ }
  return undefined
}

/** Remember whether this chat's browser panel is collapsed. */
export function rememberBrowserCollapsed(conversationId: string | null | undefined, collapsed: boolean): void {
  if (!conversationId) return
  collapsedByConversation.set(conversationId, collapsed)
  try { window.sessionStorage.setItem(storagePrefix + conversationId, String(collapsed)) } catch { /* Keep the in-memory choice. */ }
}

/** Test hook: forget every remembered panel. */
export function forgetBrowserPanelState(): void {
  for (const id of collapsedByConversation.keys()) {
    try { window.sessionStorage.removeItem(storagePrefix + id) } catch { /* Storage is optional. */ }
  }
  collapsedByConversation.clear()
}
