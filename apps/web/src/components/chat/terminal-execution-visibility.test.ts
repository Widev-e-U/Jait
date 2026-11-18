import { describe, expect, it } from 'vitest'
import { shouldRenderToolCall, type ToolCallInfo } from './tool-call-card'

const call = (tool: string, args: Record<string, unknown>): ToolCallInfo => ({
  callId: 'execution', tool, args, status: 'success', result: { ok: true, message: 'Command running' },
})

describe('terminal execution visibility', () => {
  it.each(['terminal.execution', 'terminal_execution', 'mcp__jait__terminal_execution', 'functions.mcp__jait_core__terminal_execution'])(
    'hides inspection calls for %s', (tool) => {
      expect(shouldRenderToolCall(call(tool, { action: 'inspect' }))).toBe(false)
      expect(shouldRenderToolCall(call(tool, { action: 'cancel' }))).toBe(true)
    },
  )

  it('handles wrapped Jait calls without hiding other servers', () => {
    expect(shouldRenderToolCall(call('mcp', { server: 'jait', tool: 'terminal_execution', arguments: { action: 'inspect' } }))).toBe(false)
    expect(shouldRenderToolCall(call('mcp', { server: 'jait', tool: 'terminal_execution', arguments: { action: 'cancel' } }))).toBe(true)
    expect(shouldRenderToolCall(call('mcp__other__terminal_execution', { action: 'inspect' }))).toBe(true)
  })
})
