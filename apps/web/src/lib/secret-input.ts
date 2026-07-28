import { getMcpToolLabel, normalizeToolArgs, normalizeToolName } from '@/lib/tool-call-body'

export interface SecretInputRequest {
  id: string
  sessionId: string
  title: string
  prompt: string
  requestedBy: string | null
  command?: string
  rememberable?: boolean
  rememberLabel?: string
  secretType?: string
  secretKey?: string
  expiresAt: string
  status: 'pending' | 'submitted' | 'cancelled' | 'timeout'
}

interface ToolCallLike {
  tool: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error'
}

export function getSessionSecretRequest(
  requests: SecretInputRequest[],
  sessionId: string | null,
): SecretInputRequest | null {
  if (!sessionId) return null
  return requests.find((request) => request.sessionId === sessionId) ?? null
}

export function getBackgroundSecretRequest(
  requests: SecretInputRequest[],
  sessionId: string | null,
): SecretInputRequest | null {
  return requests.find((request) => request.sessionId !== sessionId) ?? null
}

export function getSecretRequestCommand(request: SecretInputRequest): string {
  return request.command?.trim() || request.requestedBy?.trim() || 'Unknown command'
}

const SSH_SECRET_REQUESTERS = new Set(['ssh.run', 'run.ssh', 'ssh.session.start'])
const INLINE_SECRET_REQUESTERS = new Set([...SSH_SECRET_REQUESTERS, 'elevated.run', 'terminal.run', 'jait.terminal', 'execute'])

function isSshSecretTool(tool: string): boolean {
  return SSH_SECRET_REQUESTERS.has(tool)
}

function normalizeMcpToolIdentity(value: string): string | null {
  const raw = value.replace(/^functions\./, '')
  const namespaced = raw.match(/^[^/]+\/(.+)$/)
  if (namespaced?.[1]) return normalizeToolName(namespaced[1])
  const dottedMcp = raw.match(/^mcp\.[^.]+\.(.+)$/)
  if (dottedMcp?.[1]) return normalizeToolName(dottedMcp[1])
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

export function shouldRenderSecretRequestDialog(request: SecretInputRequest | null): boolean {
  return Boolean(request && !shouldRenderSecretRequestInline(request))
}

export function secretRequestMatchesTool(request: SecretInputRequest | null, tool: string, args?: Record<string, unknown>): boolean {
  if (!shouldRenderSecretRequestInline(request)) return false
  const normalizedTool = normalizeToolName(tool)
  const mcpToolFromName = normalizeMcpToolIdentity(tool)
  if (request?.requestedBy && (request.requestedBy === tool || request.requestedBy === normalizedTool || request.requestedBy === mcpToolFromName)) return true
  if ((tool === 'mcp-tool' || normalizedTool.startsWith('mcp.')) && args) {
    const mcpLabel = getMcpToolLabel(normalizeToolArgs(tool, args))
    const mcpTool = mcpLabel.title ? normalizeMcpToolIdentity(mcpLabel.title) ?? normalizeToolName(mcpLabel.title) : ''
    if (request?.requestedBy && request.requestedBy === mcpTool) return true
    if (request?.title === 'SSH password') return isSshSecretTool(mcpTool)
    if (request?.title === 'Terminal input required') return mcpTool === 'terminal.run' || mcpTool === 'jait.terminal' || mcpTool === 'execute'
  }
  const effectiveTool = mcpToolFromName ?? normalizedTool
  if (request?.title === 'SSH password') return isSshSecretTool(effectiveTool)
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
