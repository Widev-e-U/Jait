/**
 * Pure helpers for the edit-and-resend (restart-from) optimistic UI.
 *
 * Editing a user message rewrites history: the gateway truncates the
 * transcript from the edited message onward and the edit becomes a brand-new
 * turn. Rendering that instantly (before the network round-trips finish) means
 * deriving the post-restart transcript locally with the same resolution rules
 * the gateway's `restart-from` endpoint uses.
 */

export interface EditRestartTarget {
  /** Durable message id of the message being edited (`${sessionId}-${index}`). */
  messageId?: string
  /** Absolute index of the message in the rendered transcript. */
  messageIndex?: number
  /** Index counted from the end of the rendered transcript. */
  messageFromEnd?: number
}

/** Message-shaped input; structural so it stays independent of the chat hook. */
export interface EditRestartRenderableMessage {
  id: string
  role: string
  content: string
  kind?: string
  optimistic?: boolean
}

/**
 * Resolve the transcript index of the user message being edited, mirroring the
 * gateway's `restart-from` resolution order: id first, then the from-end
 * fallback, then the absolute index. Local (optimistic) rows are invisible to
 * the gateway, so positional resolution walks back to the nearest user message
 * just like the server does when an index lands off-by-one.
 *
 * Returns -1 when no user message can be resolved.
 */
export function resolveEditRestartTargetIndex<T extends EditRestartRenderableMessage>(
  messages: readonly T[],
  target: EditRestartTarget,
): number {
  const isUserRow = (message: T | undefined) =>
    !!message && message.role === 'user' && message.kind !== 'system-notice'

  if (target.messageId) {
    const byId = messages.findIndex(
      (message) => message.id === target.messageId && message.kind !== 'system-notice',
    )
    if (byId !== -1) {
      if (isUserRow(messages[byId])) return byId
      // The id resolved onto a non-user row (drift between the rendered list
      // and the persisted rows) — fall through to the positional fallbacks.
    }
  }
  if (typeof target.messageFromEnd === 'number' && target.messageFromEnd >= 0) {
    const fromEnd = messages.length - 1 - Math.floor(target.messageFromEnd)
    if (fromEnd >= 0) {
      let index = fromEnd
      while (index >= 0 && !isUserRow(messages[index])) index -= 1
      if (index >= 0) return index
    }
  }
  if (typeof target.messageIndex === 'number' && target.messageIndex >= 0) {
    const absolute = Math.floor(target.messageIndex)
    if (absolute < messages.length) {
      let index = absolute
      while (index >= 0 && !isUserRow(messages[index])) index -= 1
      if (index >= 0) return index
    }
  }
  return -1
}

/**
 * The post-restart transcript as it will look the instant the edit is sent:
 * everything strictly before the edited message (the edit deletes the edited
 * message and everything after it). Appending the new prompt to this is the
 * view the gateway will confirm once `restart-from` returns.
 *
 * Falls back to the untruncated list when the target cannot be resolved — the
 * server stays authoritative and the optimistic pair is simply appended.
 */
export function transcriptBeforeEditTarget<T extends EditRestartRenderableMessage>(
  messages: readonly T[],
  target: EditRestartTarget,
): T[] {
  const index = resolveEditRestartTargetIndex(messages, target)
  return index === -1 ? [...messages] : messages.slice(0, index)
}
