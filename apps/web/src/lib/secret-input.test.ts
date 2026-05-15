import { describe, expect, it } from 'vitest'
import {
  messageListHasMatchingSecretToolCall,
  secretRequestMatchesTool,
  shouldRenderSecretRequestInline,
  type SecretInputRequest,
} from './secret-input'

function secret(overrides: Partial<SecretInputRequest> = {}): SecretInputRequest {
  return {
    id: 'secret-1',
    sessionId: 'session-1',
    title: 'SSH password',
    prompt: 'Password for jakob@192.168.178.53',
    requestedBy: 'ssh.run',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'pending',
    ...overrides,
  }
}

describe('secret input tool matching', () => {
  it('treats SSH password prompts as inline-capable', () => {
    expect(shouldRenderSecretRequestInline(secret())).toBe(true)
  })

  it('matches MCP SSH tool names normalized from mcp__jait__ssh_run', () => {
    expect(secretRequestMatchesTool(secret(), 'mcp-tool', {
      recipient_name: 'mcp__jait__ssh_run',
      host: '192.168.178.53',
      username: 'jakob',
    })).toBe(true)
  })

  it('detects when a visible running tool call can host the inline secret form', () => {
    expect(messageListHasMatchingSecretToolCall(secret(), [
      {
        toolCalls: [{
          tool: 'mcp-tool',
          status: 'running',
          args: { recipient_name: 'mcp__jait__ssh_run' },
        }],
      },
    ])).toBe(true)
  })

  it('does not count completed tool calls as visible hosts for pending secrets', () => {
    expect(messageListHasMatchingSecretToolCall(secret(), [
      {
        toolCalls: [{
          tool: 'mcp-tool',
          status: 'success',
          args: { recipient_name: 'mcp__jait__ssh_run' },
        }],
      },
    ])).toBe(false)
  })
})
