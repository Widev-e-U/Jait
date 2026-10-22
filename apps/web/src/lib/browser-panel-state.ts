/**
 * Collapsed state of the floating chat browser, remembered per conversation.
 *
 * The panel is mounted by the rendered conversation and remounted whenever the
 * user switches chats (the transcript is keyed by session id) or when the panel
 * unmounts after the user sends their next message. Keeping the flag outside
 * React state means coming back to a chat shows the same collapsed/expanded
 * panel the user left behind instead of snapping back to the default.
 *
 * The map lives for the lifetime of the tab's module graph: it survives
 * re-renders, chat switches and the panel's own unmount/remount cycle. A page
 * reload starts fresh rather than resurrecting a stale layout decision.
 */
const collapsedByConversation = new Map<string, boolean>()

/** The state the user left this chat in, or undefined when never touched. */
export function readBrowserCollapsed(conversationId?: string | null): boolean | undefined {
  if (!conversationId) return undefined
  return collapsedByConversation.get(conversationId)
}

/** Remember whether this chat's browser panel is collapsed. */
export function rememberBrowserCollapsed(conversationId: string | null | undefined, collapsed: boolean): void {
  if (!conversationId) return
  collapsedByConversation.set(conversationId, collapsed)
}

/** Test hook: forget every remembered panel. */
export function forgetBrowserPanelState(): void {
  collapsedByConversation.clear()
}
