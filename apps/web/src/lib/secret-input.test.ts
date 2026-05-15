import { describe, expect, it } from 'vitest'
import {
  messageListHasMatchingSecretToolCall,
  shouldRenderSecretRequestDialog,
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

  it('does not render inline-capable SSH prompts in a detached dialog', () => {
    expect(shouldRenderSecretRequestDialog(secret())).toBe(false)
  })

  it('renders unknown secret prompts in a detached dialog', () => {
    expect(shouldRenderSecretRequestDialog(secret({
      title: 'API token',
      prompt: 'Enter token',
      requestedBy: 'custom.tool',
    }))).toBe(true)
  })

  it('matches MCP SSH tool names normalized from mcp__jait__ssh_run', () => {
    expect(secretRequestMatchesTool(secret(), 'mcp-tool', {
      recipient_name: 'mcp__jait__ssh_run',
      host: '192.168.178.53',
      username: 'jakob',
    })).toBe(true)
  })

  it('matches MCP SSH tool names with functions prefix', () => {
    expect(secretRequestMatchesTool(secret(), 'mcp-tool', {
      recipient_name: 'functions.mcp__jait__ssh_run',
      host: '192.168.178.53',
      username: 'jakob',
    })).toBe(true)
  })

  it('matches direct MCP SSH tool names', () => {
    expect(secretRequestMatchesTool(secret(), 'mcp__jait__ssh_run')).toBe(true)
    expect(secretRequestMatchesTool(secret(), 'mcp__jait__.ssh_run')).toBe(true)
  })

  it('matches run.ssh aliases used by some tool cards', () => {
    expect(secretRequestMatchesTool(secret({ requestedBy: 'run.ssh' }), 'run.ssh')).toBe(true)
    expect(secretRequestMatchesTool(secret(), 'mcp__jait__run_ssh')).toBe(true)
    expect(secretRequestMatchesTool(secret(), 'mcp.jait.run.ssh')).toBe(true)
  })

  it('attaches SSH password prompts raised by terminal tools', () => {
    expect(secretRequestMatchesTool(secret({ requestedBy: 'terminal.run' }), 'terminal.run')).toBe(true)
    expect(secretRequestMatchesTool(secret({ requestedBy: 'terminal.run' }), 'terminal_run')).toBe(true)
  })

  it('matches namespaced Jait tool call names', () => {
    expect(secretRequestMatchesTool(secret(), 'jait/ssh.run')).toBe(true)
    expect(secretRequestMatchesTool(secret(), 'jait/ssh_run')).toBe(true)
  })

  it('matches dotted MCP provider tool call names', () => {
    expect(secretRequestMatchesTool(secret(), 'mcp.jait.ssh.run')).toBe(true)
    expect(secretRequestMatchesTool(secret(), 'mcp.jait.ssh_run')).toBe(true)
  })

  it('matches MCP wrapper calls that carry the actual tool in args', () => {
    expect(secretRequestMatchesTool(secret(), 'mcp.jait.ssh.run', {
      server: 'jait',
      tool: 'ssh.run',
      arguments: {
        host: '192.168.178.53',
        username: 'jakob',
        authMethod: 'password',
      },
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

  it('detects visible direct MCP tool calls as inline hosts', () => {
    expect(messageListHasMatchingSecretToolCall(secret(), [
      {
        toolCalls: [{
          tool: 'mcp__jait__ssh_run',
          status: 'running',
          args: {},
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
