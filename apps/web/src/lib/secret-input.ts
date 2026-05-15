import { getMcpToolLabel, normalizeToolArgs, normalizeToolName } from '@/lib/tool-call-body'

export interface SecretInputRequest {
  id: string
  sessionId: string
  title: string
  prompt: string
  requestedBy: string | null
  expiresAt: string
  status: 'pending' | 'submitted' | 'cancelled' | 'timeout'
}

interface ToolCallLike {
  tool: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error'
}

const INLINE_SECRET_REQUESTERS = new Set(['ssh.run', 'ssh.session.start', 'elevated.run', 'terminal.run', 'jait.terminal', 'execute'])

function normalizeMcpToolIdentity(value: string): string | null {
  const raw = value.replace(/^functions\./, '')
  const dotted = raw.match(/^mcp__[^.]+\.(.+)$/)
  if (dotted?.[1]) return normalizeToolName(dotted[1])
  const doubleUnderscore = raw.match(/^mcp__[^_]+__(.+)$/)
  if (doubleUnderscore?.[1]) return normalizeToolName(doubleUnderscore[1].replace(/^\./, ''))
  return null
}

export function shouldRenderSecretRequestInline(request: SecretInputRequest | null): boolean {
  if (!request) return false
  return INLINE_SECRET_REQUESTERS.has(request.requestedBy ?? '')
    || request.title === 'SSH password'
    || request.title === 'Administrator password'
    || request.title === 'Terminal input required'
}

export function secretRequestMatchesTool(request: SecretInputRequest | null, tool: string, args?: Record<string, unknown>): boolean {
  if (!shouldRenderSecretRequestInline(request)) return false
  const normalizedTool = normalizeToolName(tool)
  const mcpToolFromName = normalizeMcpToolIdentity(tool)
  if (request?.requestedBy && (request.requestedBy === tool || request.requestedBy === normalizedTool || request.requestedBy === mcpToolFromName)) return true
  if (tool === 'mcp-tool' && args) {
    const mcpLabel = getMcpToolLabel(normalizeToolArgs(tool, args))
    const mcpTool = mcpLabel.title ? normalizeMcpToolIdentity(mcpLabel.title) ?? normalizeToolName(mcpLabel.title) : ''
    if (request?.requestedBy && request.requestedBy === mcpTool) return true
    if (request?.title === 'SSH password') return mcpTool === 'ssh.run' || mcpTool === 'ssh.session.start'
    if (request?.title === 'Terminal input required') return mcpTool === 'terminal.run' || mcpTool === 'jait.terminal' || mcpTool === 'execute'
  }
  const effectiveTool = mcpToolFromName ?? normalizedTool
  if (request?.title === 'SSH password') return effectiveTool === 'ssh.run' || effectiveTool === 'ssh.session.start'
  if (request?.title === 'Administrator password') return effectiveTool === 'elevated.run'
  if (request?.title === 'Terminal input required') return effectiveTool === 'terminal.run' || effectiveTool === 'jait.terminal' || effectiveTool === 'execute'
  return false
}

export function toolCallMatchesSecretRequest(request: SecretInputRequest | null, call: ToolCallLike): boolean {
  if (call.status !== 'running' && call.status !== 'pending') return false
  return secretRequestMatchesTool(request, call.tool, call.args)
}

export function messageListHasMatchingSecretToolCall(
  request: SecretInputRequest | null,
  messages: Array<{ toolCalls?: ToolCallLike[] }>,
): boolean {
  if (!request) return false
  return messages.some((message) => message.toolCalls?.some((call) => toolCallMatchesSecretRequest(request, call)))
}
