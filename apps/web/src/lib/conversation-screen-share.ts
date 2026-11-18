import { normalizeToolName } from './tool-call-body'

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function isUserSend(message: { role?: unknown; kind?: unknown }): boolean {
  return message.role === 'user' && message.kind !== 'system-notice'
}

/** First message index of the current turn (mirrors findConversationBrowser). */
function currentTurnStart(messages: readonly { role?: unknown; kind?: unknown }[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isUserSend(messages[index])) return index + 1
  }
  return 0
}

/**
 * Find the node screen share opened during the current user turn.
 *
 * Only a share that belongs to *this* chat is returned: a share owned by
 * another conversation (or a gateway-wide share) must never be surfaced here,
 * because surfacing it would hand this chat a view and a control toggle it
 * does not own.
 */
export function findConversationScreenShare(
  messages: readonly { toolCalls?: unknown; role?: unknown; kind?: unknown }[],
  sessionId?: string | null,
): { sessionId: string } | null {
  for (const message of messages.slice(currentTurnStart(messages))) {
    if (!Array.isArray(message.toolCalls)) continue
    for (const value of message.toolCalls) {
      const call = record(value)
      if (!call || typeof call.tool !== 'string') continue
      const tool = normalizeToolName(
        call.tool.replace(/^(?:functions[._])?mcp[._]+jait(?:_core)?[._]+/, '').replace(/_/g, '.'),
      )
      if (tool !== 'screen.share') continue

      const data = record(record(call.result)?.data)
      if (!data) continue
      // Disconnect results or device listings carry no session identity.
      const id = typeof data.id === 'string' ? data.id : typeof data.sessionId === 'string' ? data.sessionId : null
      if (!id) continue
      // Require the share to be chat-scoped to this conversation.
      if (!sessionId || data.chatId !== sessionId) continue
      if (data.status !== 'sharing' && data.status !== 'paused') continue

      return { sessionId: id }
    }
  }
  return null
}
