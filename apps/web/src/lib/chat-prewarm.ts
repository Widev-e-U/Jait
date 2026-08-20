import { buildReasoningEffortRequestField } from '@/hooks/useChat'

export interface ChatPrewarmParams {
  apiUrl: string
  token?: string | null
  sessionId: string
  /** CLI provider for the new chat ('jait' means nothing to pre-warm). */
  provider?: string | null
  runtimeMode?: string | null
  model?: string | null
  reasoningEffort?: string | null | undefined
}

/**
 * Build the pre-warm request, or null when there is nothing to warm up.
 *
 * The payload must match what `sendMessage` will post to /api/chat: the
 * gateway keys its provider-session cache on provider + runtimeMode + model +
 * reasoningEffort, so any divergence here means the first message throws the
 * pre-warmed process away and pays the full spawn cost anyway.
 */
export function buildChatPrewarmRequest(
  params: ChatPrewarmParams,
): { url: string; init: RequestInit } | null {
  const { apiUrl, token, sessionId, provider } = params
  if (!token || !sessionId) return null
  if (!provider || provider === 'jait') return null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  return {
    url: `${apiUrl}/api/chat/prewarm`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId,
        provider,
        ...(params.runtimeMode ? { runtimeMode: params.runtimeMode } : {}),
        ...(params.model ? { model: params.model } : {}),
        ...buildReasoningEffortRequestField(params.reasoningEffort),
      }),
    },
  }
}

/**
 * Start the CLI provider subprocess ahead of the turn so its ~3s bootstrap
 * overlaps with the user finishing their message instead of delaying the
 * first streamed token.
 *
 * Fire-and-forget by design: the gateway skips anything it must not disturb,
 * and every failure just falls back to the turn starting its own session.
 */
export function prewarmChatSession(params: ChatPrewarmParams): void {
  const request = buildChatPrewarmRequest(params)
  if (!request) return
  void fetch(request.url, request.init).catch(() => { /* best-effort */ })
}

/**
 * Fires the pre-warm the first time a chat's draft becomes non-empty.
 *
 * The trigger is deliberately *not* chat creation: opening a new chat is
 * exactly when the provider selector still gets changed, so warming there
 * spawns a subprocess for a provider that is about to be swapped out. The
 * first keystroke is the earliest point where the selection is settled and
 * the user has actually committed to sending something.
 *
 * Fires at most once per chat, using the provider selected at that moment. A
 * provider switched *after* typing is not re-warmed — that would spawn a
 * second process to chase a selection that is evidently still moving; the
 * turn swaps the session itself, exactly as it does today.
 */
export function createDraftPrewarmTrigger(
  send: (params: ChatPrewarmParams) => void = prewarmChatSession,
): (params: ChatPrewarmParams & { draft: string }) => void {
  const warmed = new Set<string>()
  return ({ draft, ...params }) => {
    if (!draft.trim()) return
    if (!params.sessionId || !params.provider || params.provider === 'jait') return
    if (warmed.has(params.sessionId)) return
    warmed.add(params.sessionId)
    send(params)
  }
}
