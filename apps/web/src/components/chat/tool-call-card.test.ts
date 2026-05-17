import { beforeAll, describe, expect, it } from 'vitest'

let formatStructuredValue: typeof import('./tool-call-card')['formatStructuredValue']
let shouldInitiallyCollapseToolCallGroup: typeof import('./tool-call-card')['shouldInitiallyCollapseToolCallGroup']
let shouldInitiallyCollapseAgentToolCallWrapper: typeof import('./tool-call-card')['shouldInitiallyCollapseAgentToolCallWrapper']
let isInlineToolCall: typeof import('./tool-call-card')['isInlineToolCall']
let summarizeCollapsedToolCalls: typeof import('./tool-call-card')['summarizeCollapsedToolCalls']
let computeAgentNesting: typeof import('./tool-call-card')['computeAgentNesting']
let formatOutput: typeof import('./tool-call-card')['formatOutput']
let getThreadControlListItems: typeof import('./tool-call-card')['getThreadControlListItems']
let formatElapsedDuration: typeof import('./tool-call-card')['formatElapsedDuration']
let hasInlineSecretPromptForCalls: typeof import('./tool-call-card')['hasInlineSecretPromptForCalls']
let getRunningHint: typeof import('./tool-call-card')['getRunningHint']
let getCallSummary: typeof import('./tool-call-card')['getCallSummary']

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
    computeAgentNesting,
    formatOutput,
    getThreadControlListItems,
    formatElapsedDuration,
    hasInlineSecretPromptForCalls,
    getRunningHint,
    getCallSummary,
  } = await import('./tool-call-card'))
}, 30_000)

describe('formatElapsedDuration', () => {
  it('formats positive durations', () => {
    expect(formatElapsedDuration(1_000, 1_750)).toBe('750ms')
    expect(formatElapsedDuration(1_000, 2_250)).toBe('1.3s')
  })

  it('clamps missing or out-of-order timestamps', () => {
    expect(formatElapsedDuration(1_000, 0)).toBe('0ms')
    expect(formatElapsedDuration(2_000, 1_000)).toBe('0ms')
    expect(formatElapsedDuration(0, 2_000)).toBe('0ms')
  })
})

describe('getRunningHint', () => {
  it('shows the command for Jait terminal MCP calls', () => {
    expect(getRunningHint('mcp.jait.jait.terminal', {
      command: 'git status -sb',
    })).toBe('Executing git status -sb...')
  })

  it('shows the command from wrapped MCP arguments', () => {
    expect(getRunningHint('mcp-tool', {
      recipient_name: 'functions.mcp__jait__jait_terminal',
      arguments: JSON.stringify({ command: 'bun run test' }),
    })).toBe('Executing bun run test...')
  })
})

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

  it('unwraps MCP result envelopes instead of showing wrapper fields', () => {
    expect(formatStructuredValue({
      content: [
        {
          type: 'text',
          text: 'Command completed (exit code 0) {"output":"error: No packages matched the filter","exitCode":0,"timedOut":false}',
        },
      ],
      structuredContent: null,
      _meta: null,
      error: null,
    })).toBe('error: No packages matched the filter')
  })

  it('renders ACP content wrappers as readable text', () => {
    expect(formatStructuredValue([
      {
        type: 'content',
        content: {
          type: 'text',
          text: 'Read apps/web/src/App.tsx',
        },
      },
    ])).toBe('Read apps/web/src/App.tsx')
  })
})

describe('formatOutput', () => {
  it('renders structured terminal results as terminal output text', () => {
    expect(formatOutput({
      ok: true,
      message: JSON.stringify({
        formatted_output: 'bun test\n\n1 pass',
        exit_code: 0,
      }),
    }, 'terminal.run')).toBe('bun test\n\n1 pass')
  })

  it('unwraps command payload envelopes for non-terminal wrapper tools', () => {
    expect(formatOutput({
      ok: true,
      message: JSON.stringify({
        formattedOutput: 'Changed 2 files',
        exitCode: 0,
        timedOut: false,
      }),
    }, 'functions.exec_command')).toBe('Changed 2 files')
  })

  it('unwraps embedded command payload envelopes for non-terminal wrapper tools', () => {
    expect(formatOutput({
      ok: true,
      message: 'Command completed (exit code 0) {"formattedOutput":"Changed 2 files","exitCode":0,"timedOut":false}',
    }, 'functions.exec_command')).toBe('Changed 2 files')
  })

  it('renders nested MCP terminal results as command output text', () => {
    expect(formatOutput({
      ok: true,
      message: 'Tool completed',
      data: {
        result: {
          content: [
            {
              type: 'text',
              text: 'Command completed (exit code 0) {"output":"error: No packages matched the filter","exitCode":0,"timedOut":false,"terminalId":"term-1"}',
            },
          ],
          structuredContent: null,
          _meta: null,
          error: null,
        },
      },
    }, 'mcp-tool')).toBe('error: No packages matched the filter')
  })

  it('renders ACP raw output arrays as readable text', () => {
    expect(formatOutput({
      ok: true,
      message: JSON.stringify([
        {
          type: 'content',
          content: {
            type: 'text',
            text: 'Updated packages/gateway/src/providers/acp-provider.ts',
          },
        },
      ]),
      data: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: 'Updated packages/gateway/src/providers/acp-provider.ts',
          },
        },
      ],
    }, 'read_file')).toBe('Updated packages/gateway/src/providers/acp-provider.ts')
  })
})

describe('getCallSummary', () => {
  it('uses ACP read result text as a file summary when args are empty', () => {
    expect(getCallSummary(
      'read_file',
      {},
      [
        {
          type: 'content',
          content: {
            type: 'text',
            text: 'Read apps/web/src/App.tsx',
          },
        },
      ],
      'Read apps/web/src/App.tsx',
    )).toBe('apps/web/src/App.tsx')
  })

  it('uses ACP edit aliases as an edit filename with diff counts', () => {
    expect(getCallSummary('replace_string_in_file', {
      targetFile: 'packages/gateway/src/providers/acp-provider.ts',
      old_str: 'before',
      new_str: 'after\nagain',
    })).toBe('acp-provider.ts (+2 -1)')
  })
})

describe('getThreadControlListItems', () => {
  it('uses result threads when available', () => {
    expect(getThreadControlListItems(
      {
        action: 'create_many',
        threads: [{ title: 'Draft' }],
      },
      {
        threads: [
          {
            id: 'thread-12345678',
            title: 'Implemented API',
            status: 'completed',
            providerId: 'codex',
            kind: 'delegation',
          },
        ],
      },
      'success',
    )).toEqual([
      {
        id: 'thread-12345678',
        title: 'Implemented API',
        status: 'completed',
        providerId: 'codex',
        kind: 'delegation',
        branch: null,
        workingDirectory: null,
        error: null,
      },
    ])
  })

  it('falls back to requested thread specs while running', () => {
    expect(getThreadControlListItems(
      {
        action: 'create_many',
        threads: [
          { title: 'Backend' },
          { title: 'Frontend', providerId: 'claude-code' },
        ],
      },
      undefined,
      'running',
    ).map((item) => ({ title: item.title, status: item.status, providerId: item.providerId }))).toEqual([
      { title: 'Backend', status: 'starting', providerId: null },
      { title: 'Frontend', status: 'starting', providerId: 'claude-code' },
    ])
  })

  it('merges live thread status into running create_many cards', () => {
    expect(getThreadControlListItems(
      {
        action: 'create_many',
        threads: [
          { title: 'Backend' },
          { title: 'Frontend' },
        ],
      },
      undefined,
      'running',
      [
        { id: 'thread-backend', title: 'Backend', status: 'completed', providerId: 'codex' },
        { id: 'thread-frontend', title: 'Frontend', status: 'running', providerId: 'codex' },
      ],
    ).map((item) => ({ id: item.id, title: item.title, status: item.status, providerId: item.providerId }))).toEqual([
      { id: 'thread-backend', title: 'Backend', status: 'completed', providerId: 'codex' },
      { id: 'thread-frontend', title: 'Frontend', status: 'running', providerId: 'codex' },
    ])
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

  it('detects active inline secret prompts in tool calls', () => {
    expect(hasInlineSecretPromptForCalls(
      [
        { callId: '1', tool: 'mcp__jait__ssh_run', args: {}, status: 'running', startedAt: 1 },
        { callId: '2', tool: 'read', args: { path: 'b.ts' }, status: 'success', startedAt: 3, completedAt: 4 },
      ],
      (call) => call.tool === 'mcp__jait__ssh_run' ? 'secret-form' : null,
    )).toBe(true)
  })

  it('treats run.ssh as an SSH terminal tool', () => {
    expect(summarizeCollapsedToolCalls([
      { callId: '1', tool: 'run.ssh', args: { host: '192.168.178.53' }, status: 'running', startedAt: 1 },
    ])).toBe('1 ssh tool call')
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

  it('prefers explicit parent call ancestry when present', () => {
    const nested = computeAgentNesting([
      { callId: 'agent-1', tool: 'agent', args: { description: 'delegate task' }, status: 'success', startedAt: 1, completedAt: 10 },
      { callId: 'read-1', parentCallId: 'agent-1', tool: 'read', args: { path: 'a.ts' }, status: 'success', startedAt: 2, completedAt: 3 },
      { callId: 'search-1', parentCallId: 'agent-1', tool: 'search', args: { query: 'needle' }, status: 'success', startedAt: 4, completedAt: 5 },
    ])

    expect(nested.parentSet.has('read-1')).toBe(true)
    expect(nested.parentSet.has('search-1')).toBe(true)
    expect(nested.childMap.get('agent-1')?.map(call => call.callId)).toEqual(['read-1', 'search-1'])
  })

  it('nests child calls under provider-native spawn_agent calls', () => {
    const nested = computeAgentNesting([
      { callId: 'agent-1', tool: 'spawn_agent', args: { message: 'inspect' }, status: 'success', startedAt: 1, completedAt: 10 },
      { callId: 'read-1', parentCallId: 'agent-1', tool: 'read', args: { path: 'a.ts' }, status: 'success', startedAt: 2, completedAt: 3 },
    ])

    expect(nested.parentSet.has('read-1')).toBe(true)
    expect(nested.childMap.get('agent-1')?.map(call => call.callId)).toEqual(['read-1'])
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
