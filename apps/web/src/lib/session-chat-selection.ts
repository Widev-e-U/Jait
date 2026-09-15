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

export type SessionReasoningEffort = string

export function getSessionSelectionSyncKey(sessionId: string | null, value: unknown): string {
  return JSON.stringify({ sessionId, value })
}

export function normalizeSessionReasoningEffort(value: unknown): SessionReasoningEffort | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(normalized) ? normalized : undefined
}

function providerLabel(provider: string): string {
  if (provider === 'codex' || provider.startsWith('codex-')) return 'Codex'
  if (provider === 'claude-code' || provider.startsWith('claude-code-')) return 'Claude Code'
  const labels: Record<string, string> = {
    jait: 'Jait',
    cursor: 'Cursor',
    pi: 'Pi',
    'pi-gemini': 'Pi Gemini',
    deepagents: 'DeepAgents',
  }
  return labels[provider] ?? provider
}

function modelLabel(model: string): string {
  const withoutOrg = model.includes('/') ? model.split('/').pop()! : model
  const [baseName, version] = withoutOrg.split(':')
  const formatted = baseName
    .split(/[-_]/)
    .map((word) => word.toLowerCase() === 'gpt' ? 'GPT' : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return version && !['latest', 'stable'].includes(version.toLowerCase())
    ? `${formatted} ${version.toUpperCase()}`
    : formatted
}

export function formatSessionChatSelectionLabel(selection: SessionChatSelection): string {
  const effortLabel = selection.reasoningEffort
    ? `${selection.reasoningEffort.charAt(0).toUpperCase()}${selection.reasoningEffort.slice(1)} effort`
    : null
  return [
    providerLabel(selection.provider),
    selection.model ? modelLabel(selection.model) : null,
    effortLabel,
  ].filter(Boolean).join(' · ')
}

/**
 * The error state a chat was left in by its most recent turn. Written onto the
 * session row (`metadata.chat.lastError` / `lastErrorAt`) by the gateway when a
 * turn fails, cleared when a later turn succeeds.
 */
export interface SessionChatError {
  message: string
  at: string | null
}

/**
 * Read the last-turn error marker from a session's metadata, or `null` when the
 * session's last turn finished cleanly (or nothing recorded an error yet).
 */
export function parseSessionChatError(metadata: string | null | undefined): SessionChatError | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata) as { chat?: Record<string, unknown> }
    const chat = parsed.chat
    if (!chat || typeof chat !== 'object') return null
    const message = typeof chat.lastError === 'string' && chat.lastError.trim() ? chat.lastError : null
    if (!message) return null
    const at = typeof chat.lastErrorAt === 'string' && chat.lastErrorAt.trim() ? chat.lastErrorAt : null
    return { message, at }
  } catch {
    return null
  }
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
