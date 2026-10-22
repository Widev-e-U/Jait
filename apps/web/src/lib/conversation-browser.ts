import { normalizeToolName } from './tool-call-body'

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** A real user send. System notices also carry role 'user' but are not turns. */
function isUserSend(message: { role?: unknown; kind?: unknown }): boolean {
  return message.role === 'user' && message.kind !== 'system-notice'
}

/**
 * First message index of the current turn: everything after the newest user
 * message. The floating browser is an accessory of the turn that opened it, so
 * it stays on screen until the user sends their next message and comes back as
 * soon as the agent touches a browser again after that.
 */
function currentTurnStart(messages: readonly { role?: unknown; kind?: unknown }[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isUserSend(messages[index])) return index + 1
  }
  return 0
}

/** Find one browser for the current user turn, including virtualized/collapsed rows. */
export function findConversationBrowser(
  messages: readonly { toolCalls?: unknown; role?: unknown; kind?: unknown }[],
  sessionId?: string | null,
): { data?: Record<string, unknown> } | null {
  let used = false
  let latestData: Record<string, unknown> | undefined
  for (const message of messages.slice(currentTurnStart(messages))) {
    if (!Array.isArray(message.toolCalls)) continue
    for (const value of message.toolCalls) {
      const call = record(value)
      if (!call || typeof call.tool !== 'string') continue
      const data = record(record(call.result)?.data)
      const browserSession = record(data?.browserSession)
      // Tool results from another chat must never select that chat's browser.
      if (sessionId && typeof browserSession?.sessionId === 'string' && browserSession.sessionId !== sessionId) continue
      const tool = normalizeToolName(call.tool.replace(/^(?:functions[._])?mcp[._]+jait(?:_core)?[._]+/, '').replace(/_/g, '.'))
      if (!browserSession && !tool.startsWith('browser.') && !['preview.open', 'preview.status', 'preview.restart', 'preview.inspect'].includes(tool)
        && !(tool === 'surfaces.start' && record(call.args)?.type === 'browser')) continue
      // Later actions often have no session metadata. Keep the last useful hint;
      // the authenticated session endpoint is the source of current state.
      used = true
      if (browserSession || data?.sessionId) latestData = data
    }
  }
  return used ? { data: latestData } : null
}
