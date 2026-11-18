import type { UserMessageSegment } from '@/lib/user-message-segments'

/** What the chat composer holds for one chat view. */
export type ChatComposerDraft = {
  text: string
  segments: UserMessageSegment[] | undefined
}

/**
 * Key for a chat view's composer draft. Views without a chat yet (the new-chat
 * landing and every project's new-chat view) share one slot. The composer keys
 * its attachments the same way, so text and files stay in step.
 */
export function getChatComposerDraftKey(sessionId: string | null | undefined): string {
  return `developer:${sessionId ?? 'new-chat'}`
}

/**
 * Picks the composer contents for the view being entered. A view with its own
 * saved text gets that text back. A view with none keeps what was being typed,
 * the same way attachments carry over to a view with none saved.
 */
export function resolveChatComposerDraftOnEnter(
  saved: ChatComposerDraft | undefined,
  current: ChatComposerDraft,
): ChatComposerDraft {
  return saved && saved.text.length > 0 ? saved : current
}
