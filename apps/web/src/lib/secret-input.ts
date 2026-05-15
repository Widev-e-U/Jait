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

export function shouldRenderSecretRequestInline(request: SecretInputRequest | null): boolean {
  if (!request) return false
  return INLINE_SECRET_REQUESTERS.has(request.requestedBy ?? '')
    || request.title === 'SSH password'
    || request.title === 'Administrator password'
    || request.title === 'Terminal input required'
}

export function secretRequestMatchesTool(request: SecretInputRequest | null, tool: string, args?: Record<string, unknown>): boolean {
  if (!shouldRenderSecretRequestInline(request)) return false
  if (request?.requestedBy && request.requestedBy === tool) return true
  if (tool === 'mcp-tool' && args) {
    const mcpLabel = getMcpToolLabel(normalizeToolArgs(tool, args))
    const mcpTool = mcpLabel.title ? normalizeToolName(mcpLabel.title.replace(/^mcp__[^_]+__/, '')) : ''
    if (request?.requestedBy && request.requestedBy === mcpTool) return true
    if (request?.title === 'SSH password') return mcpTool === 'ssh.run' || mcpTool === 'ssh.session.start'
    if (request?.title === 'Terminal input required') return mcpTool === 'terminal.run' || mcpTool === 'jait.terminal' || mcpTool === 'execute'
  }
  if (request?.title === 'SSH password') return tool === 'ssh.run' || tool === 'ssh.session.start'
  if (request?.title === 'Administrator password') return tool === 'elevated.run'
  if (request?.title === 'Terminal input required') return tool === 'terminal.run' || tool === 'jait.terminal' || tool === 'execute'
  return false
}

export function toolCallMatchesSecretRequest(request: SecretInputRequest | null, call: ToolCallLike): boolean {
  if (call.status !== 'running' && call.status !== 'pending') return false
  const normalizedTool = normalizeToolName(call.tool)
  return secretRequestMatchesTool(request, normalizedTool, call.args)
}

export function messageListHasMatchingSecretToolCall(
  request: SecretInputRequest | null,
  messages: Array<{ toolCalls?: ToolCallLike[] }>,
): boolean {
  if (!request) return false
  return messages.some((message) => message.toolCalls?.some((call) => toolCallMatchesSecretRequest(request, call)))
}
