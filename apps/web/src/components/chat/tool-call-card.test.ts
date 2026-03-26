import { beforeAll, describe, expect, it } from 'vitest'

let formatStructuredValue: typeof import('./tool-call-card')['formatStructuredValue']
let shouldInitiallyCollapseToolCallGroup: typeof import('./tool-call-card')['shouldInitiallyCollapseToolCallGroup']
let shouldInitiallyCollapseAgentToolCallWrapper: typeof import('./tool-call-card')['shouldInitiallyCollapseAgentToolCallWrapper']

beforeAll(async () => {
  ;(globalThis as typeof globalThis & { window?: unknown }).window = {
    location: {
      origin: 'http://localhost:8000',
      port: '8000',
      protocol: 'http:',
      hostname: 'localhost',
    },
  }
  ;({ formatStructuredValue, shouldInitiallyCollapseToolCallGroup, shouldInitiallyCollapseAgentToolCallWrapper } = await import('./tool-call-card'))
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
