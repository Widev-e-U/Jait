/**
 * The provider/model/reasoning-effort a chat was last used with, denormalized
 * onto the session row (`metadata.chat`) by the gateway so the chat/project
 * list can render a provider icon per session without subscribing to each
 * session's live (WS-only) state.
 */
export interface SessionChatSelection {
  provider: string
  model: string | null
  reasoningEffort: string | null
}

export function parseSessionChatSelection(metadata: string | null | undefined): SessionChatSelection | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata) as { chat?: Record<string, unknown> }
    const chat = parsed.chat
    if (!chat || typeof chat !== 'object') return null
    const provider = typeof chat.provider === 'string' && chat.provider.trim() ? chat.provider : null
    if (!provider) return null
    const model = typeof chat.model === 'string' && chat.model.trim() ? chat.model : null
    const reasoningEffort = typeof chat.reasoningEffort === 'string' && chat.reasoningEffort.trim()
      ? chat.reasoningEffort
      : null
    return { provider, model, reasoningEffort }
  } catch {
    return null
  }
}
