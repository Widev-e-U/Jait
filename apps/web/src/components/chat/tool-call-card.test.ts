import { beforeAll, describe, expect, it } from 'vitest'

let formatStructuredValue: typeof import('./tool-call-card')['formatStructuredValue']
let shouldInitiallyCollapseToolCallGroup: typeof import('./tool-call-card')['shouldInitiallyCollapseToolCallGroup']
let shouldInitiallyCollapseAgentToolCallWrapper: typeof import('./tool-call-card')['shouldInitiallyCollapseAgentToolCallWrapper']
let isInlineToolCall: typeof import('./tool-call-card')['isInlineToolCall']
let summarizeCollapsedToolCalls: typeof import('./tool-call-card')['summarizeCollapsedToolCalls']

beforeAll(async () => {
  ;(globalThis as typeof globalThis & { window?: unknown }).window = {
    location: {
      origin: 'http://localhost:8000',
      port: '8000',
      protocol: 'http:',
      hostname: 'localhost',
    },
  }
  ;({
    formatStructuredValue,
    shouldInitiallyCollapseToolCallGroup,
    shouldInitiallyCollapseAgentToolCallWrapper,
    isInlineToolCall,
    summarizeCollapsedToolCalls,
  } = await import('./tool-call-card'))
}, 30_000)

describe('formatStructuredValue', () => {
  it('renders MCP text content blocks as readable text', () => {
    expect(formatStructuredValue([
      { type: 'text', text: '2 active surface(s)' },
      { type: 'text', text: '{"surfaces":[]}' },
    ])).toBe('2 active surface(s)\n\n{"surfaces":[]}')
  })

  it('falls back to JSON for structured objects', () => {
    expect(formatStructuredValue({ surfaces: [{ id: 'browser-1' }] })).toBe(
      JSON.stringify({ surfaces: [{ id: 'browser-1' }] }, null, 2),
    )
  })
})

describe('ToolCallGroup', () => {
  it('starts collapsed when a completed collapsible group is followed by text', () => {
    expect(shouldInitiallyCollapseToolCallGroup(
      [
          { callId: '1', tool: 'read', args: { path: 'a.ts' }, status: 'success', startedAt: 1, completedAt: 2 },
          { callId: '2', tool: 'read', args: { path: 'b.ts' }, status: 'success', startedAt: 3, completedAt: 4 },
          { callId: '3', tool: 'read', args: { path: 'c.ts' }, status: 'success', startedAt: 5, completedAt: 6 },
      ],
      true,
    )).toBe(true)
  })

  it('stays open when any call is still active', () => {
    expect(shouldInitiallyCollapseToolCallGroup(
      [
        { callId: '1', tool: 'read', args: { path: 'a.ts' }, status: 'success', startedAt: 1, completedAt: 2 },
        { callId: '2', tool: 'read', args: { path: 'b.ts' }, status: 'running', startedAt: 3 },
        { callId: '3', tool: 'read', args: { path: 'c.ts' }, status: 'success', startedAt: 5, completedAt: 6 },
      ],
      true,
    )).toBe(false)
  })

  it('keeps screenshot tool groups expanded so the image stays visible', () => {
    expect(shouldInitiallyCollapseToolCallGroup(
      [
        {
          callId: '1',
          tool: 'browser.screenshot',
          args: { path: '/tmp/capture.png' },
          status: 'success',
          startedAt: 1,
          completedAt: 2,
          result: { ok: true, message: 'Saved screenshot to /tmp/capture.png' },
        },
        { callId: '2', tool: 'read', args: { path: 'b.ts' }, status: 'success', startedAt: 3, completedAt: 4 },
        { callId: '3', tool: 'read', args: { path: 'c.ts' }, status: 'success', startedAt: 5, completedAt: 6 },
      ],
      true,
    )).toBe(false)
  })
})

describe('isInlineToolCall', () => {
  it('treats screenshot results as inline-rendered tool calls', () => {
    expect(isInlineToolCall({
      callId: '1',
      tool: 'browser.screenshot',
      args: { path: '/tmp/capture.png' },
      status: 'success',
      startedAt: 1,
      completedAt: 2,
      result: { ok: true, message: 'Saved screenshot to /tmp/capture.png' },
    })).toBe(true)
  })
})

describe('AgentToolCallWrapper', () => {
  it('starts collapsed when the first render already contains only completed calls', () => {
    expect(shouldInitiallyCollapseAgentToolCallWrapper(
      [
        { callId: '1', tool: 'read', args: { path: 'a.ts' }, status: 'success', startedAt: 1, completedAt: 2 },
        { callId: '2', tool: 'read', args: { path: 'b.ts' }, status: 'success', startedAt: 3, completedAt: 4 },
      ],
      false,
    )).toBe(true)
  })

  it('stays open while the wrapper is still streaming', () => {
    expect(shouldInitiallyCollapseAgentToolCallWrapper(
      [
        { callId: '1', tool: 'read', args: { path: 'a.ts' }, status: 'success', startedAt: 1, completedAt: 2 },
      ],
      true,
    )).toBe(false)
  })
})

describe('summarizeCollapsedToolCalls', () => {
  it('groups tool calls by category for collapsed summaries', () => {
    expect(summarizeCollapsedToolCalls([
      { callId: '1', tool: 'terminal.run', args: { command: 'bun test' }, status: 'success', startedAt: 1, completedAt: 2 },
      { callId: '2', tool: 'execute', args: { command: 'bun lint' }, status: 'success', startedAt: 3, completedAt: 4 },
      { callId: '3', tool: 'edit', args: { path: 'src/app.ts', content: 'x' }, status: 'success', startedAt: 5, completedAt: 6 },
      { callId: '4', tool: 'file.write', args: { path: 'src/app.ts', content: 'y' }, status: 'success', startedAt: 7, completedAt: 8 },
      { callId: '5', tool: 'read', args: { path: 'src/app.ts' }, status: 'success', startedAt: 9, completedAt: 10 },
    ])).toBe('5 tool calls: 2 terminal, 2 edit, 1 read')
  })

  it('uses a singular category summary when all calls are the same kind', () => {
    expect(summarizeCollapsedToolCalls([
      { callId: '1', tool: 'browser.click', args: { selector: 'button' }, status: 'success', startedAt: 1, completedAt: 2 },
      { callId: '2', tool: 'browser.type', args: { selector: 'input', text: 'hello' }, status: 'success', startedAt: 3, completedAt: 4 },
    ])).toBe('2 browser tool calls')
  })
})
