import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

let formatStructuredValue: typeof import('./tool-call-card')['formatStructuredValue']
let shouldInitiallyCollapseToolCallGroup: typeof import('./tool-call-card')['shouldInitiallyCollapseToolCallGroup']
let shouldInitiallyCollapseAgentToolCallWrapper: typeof import('./tool-call-card')['shouldInitiallyCollapseAgentToolCallWrapper']
let isInlineToolCall: typeof import('./tool-call-card')['isInlineToolCall']
let summarizeCollapsedToolCalls: typeof import('./tool-call-card')['summarizeCollapsedToolCalls']
let computeAgentNesting: typeof import('./tool-call-card')['computeAgentNesting']
let formatOutput: typeof import('./tool-call-card')['formatOutput']
let getThreadControlListItems: typeof import('./tool-call-card')['getThreadControlListItems']
let getTodoToolListItems: typeof import('./tool-call-card')['getTodoToolListItems']
let formatElapsedDuration: typeof import('./tool-call-card')['formatElapsedDuration']
let hasInlineSecretPromptForCalls: typeof import('./tool-call-card')['hasInlineSecretPromptForCalls']
let getRunningHint: typeof import('./tool-call-card')['getRunningHint']
let getCallSummary: typeof import('./tool-call-card')['getCallSummary']
let getEditDiffCounts: typeof import('./tool-call-card')['getEditDiffCounts']
let formatMcpHeaderText: typeof import('./tool-call-card')['formatMcpHeaderText']
let getJaitMcpToolName: typeof import('./tool-call-card')['getJaitMcpToolName']
let getJaitMcpToolArgs: typeof import('./tool-call-card')['getJaitMcpToolArgs']
let getLatestSubAgentActivity: typeof import('./tool-call-card')['getLatestSubAgentActivity']
let getToolInvocationLabels: typeof import('./tool-call-card')['getToolInvocationLabels']
let shouldRenderToolCall: typeof import('./tool-call-card')['shouldRenderToolCall']
let getToolSearchResultItems: typeof import('./tool-call-card')['getToolSearchResultItems']
let humanizeStructuredKey: typeof import('./tool-call-card')['humanizeStructuredKey']
let StructuredDataView: typeof import('./tool-call-card')['StructuredDataView']
let ToolSearchResultsView: typeof import('./tool-call-card')['ToolSearchResultsView']

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
    getTodoToolListItems,
    formatElapsedDuration,
    hasInlineSecretPromptForCalls,
    getRunningHint,
    getCallSummary,
    getEditDiffCounts,
    formatMcpHeaderText,
    getJaitMcpToolName,
    getJaitMcpToolArgs,
    getLatestSubAgentActivity,
    getToolInvocationLabels,
    shouldRenderToolCall,
    getToolSearchResultItems,
    humanizeStructuredKey,
    StructuredDataView,
    ToolSearchResultsView,
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

describe('Jait MCP display metadata', () => {
  it('maps external-provider Jait MCP names back to native tools', () => {
    expect(getJaitMcpToolName('mcp.jait.jait_terminal')).toBe('jait.terminal')
    expect(getJaitMcpToolName('functions.mcp__jait__file_read')).toBe('file.read')
    expect(getJaitMcpToolName('functions.mcp__jait_core__tools_search')).toBe('tools.search')
    expect(getJaitMcpToolName('mcp.__jait_core__todo')).toBe('todo')
    const wrappedTodo = {
      server: 'jait_core',
      tool: 'todo',
      title: 'mcp',
      arguments: { todoList: [{ id: 1, title: 'Trace metadata', status: 'in-progress' }] },
    }
    expect(getJaitMcpToolName('core.todo', null, wrappedTodo)).toBe('todo')
    expect(getJaitMcpToolArgs(wrappedTodo)).toEqual(wrappedTodo.arguments)
  })

  it('summarizes Jait MCP terminal calls as terminal activity', () => {
    const call = {
      callId: 'terminal-1',
      tool: 'mcp.jait.jait_terminal',
      args: { command: 'bun run test' },
      status: 'running' as const,
      startedAt: 1,
    }
    expect(summarizeCollapsedToolCalls([call])).toBe('1 terminal tool call')
  })

  it('extracts terminal commands from wrapped MCP arguments', () => {
    expect(getCallSummary('jait.terminal', {
      arguments: JSON.stringify({ command: 'bun run test' }),
    })).toBe('bun run test')
  })

  it('gives tools.search a friendly label and query summary', () => {
    expect(getToolInvocationLabels('tools.search', { query: 'preview browser' })).toEqual({
      running: 'Searching tools',
      done: 'Searched tools',
    })
    expect(getCallSummary('tools.search', {
      recipient_name: 'functions.mcp__jait__tools_search',
      arguments: JSON.stringify({ query: 'preview browser' }),
    })).toBe('preview browser')
  })
})

describe('synthetic context tool visibility', () => {
  it('hides empty memory searches and keeps searches that found memories', () => {
    expect(shouldRenderToolCall({
      callId: 'memory-empty',
      tool: 'memory.search',
      args: { query: 'anything' },
      status: 'success',
      result: { ok: true, message: 'No relevant memories found', data: { retrieved: [] } },
      startedAt: 1,
      completedAt: 2,
    })).toBe(false)

    expect(shouldRenderToolCall({
      callId: 'memory-found',
      tool: 'memory.search',
      args: { query: 'anything' },
      status: 'success',
      result: { ok: true, message: 'Loaded 1 relevant memories', data: { retrieved: [{ id: 'memory-1' }] } },
      startedAt: 1,
      completedAt: 2,
    })).toBe(true)
  })

  it('only shows skill activity when a skill is present', () => {
    expect(shouldRenderToolCall({
      callId: 'skill-empty',
      tool: 'skill',
      args: {},
      status: 'success',
      startedAt: 1,
      completedAt: 2,
    })).toBe(false)
    expect(shouldRenderToolCall({
      callId: 'skill-sag',
      tool: 'skill',
      args: { skills: 'sag' },
      status: 'success',
      startedAt: 1,
      completedAt: 2,
    })).toBe(true)
  })
})

describe('sub-agent activity', () => {
  it('turns streamed sub-agent events into a concise current action', () => {
    expect(getLatestSubAgentActivity('[sub-agent] Starting file.read...\n')).toBe('Using file.read')
    expect(getLatestSubAgentActivity('[sub-agent] Starting file.read...\n[sub-agent] ✓ Read src/app.ts\n')).toBe('Read src/app.ts')
  })
})

describe('formatMcpHeaderText', () => {
  it('does not duplicate the MCP title when the invocation label already includes it', () => {
    expect(formatMcpHeaderText('Ran mcp.jait.terminal.run', {
      title: 'mcp.jait.terminal.run',
      details: null,
    })).toBe('mcp.jait.terminal.run')
  })

  it('keeps details behind the MCP title without wrapper metadata', () => {
    expect(formatMcpHeaderText('Ran mcp.jait.thread.control', {
      title: 'mcp.jait.thread.control',
      details: 'action: create',
    })).toBe('mcp.jait.thread.control • action: create')
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

  it('formats tools.search MCP output as a concise tool list', () => {
    const output = formatOutput({
      ok: true,
      message: 'Tool completed',
      data: {
        result: {
          content: [{
            type: 'text',
            text: 'Found 2 tool(s) matching the request.\n' + JSON.stringify({
              matches: [
                {
                  name: 'file.read',
                  description: 'Prefer Jait tools whenever possible.\n\nRead the contents of a project file.',
                  parameters: { type: 'object' },
                },
                {
                  name: 'preview.open',
                  description: 'Open the live web preview.',
                  parameters: { type: 'object' },
                },
              ],
            }),
          }],
        },
      },
    }, 'tools.search')

    expect(output).toBe('• file.read — Read the contents of a project file.\n• preview.open — Open the live web preview.')
    expect(output).not.toContain('parameters')
  })

  it('displays the retrieved memories themselves for memory.search', () => {
    const output = formatOutput({
      ok: true,
      message: 'Found 2 memories and 0 reminders',
      data: {
        memories: [
          {
            id: 'm1',
            scope: 'project',
            source: { type: 'chat', id: 'chat:watch-base-deploy', surface: 'chat' },
            createdAt: '2026-06-30T20:10:23.647Z',
            updatedAt: '2026-06-30T20:10:23.647Z',
            content: 'WATCH BASE APP — deployed live on watch.basenetwork.net, root cause: three local code fixes.',
          },
          {
            id: 'm2',
            scope: 'project',
            source: { type: 'agent', id: 'abc', surface: 'chat' },
            createdAt: '2026-07-18T22:51:55.506Z',
            updatedAt: '2026-07-18T22:51:55.506Z',
            content: 'BASE DOCKER STORAGE MIGRATION COMPLETED on base.',
          },
        ],
        reminders: [],
      },
    }, 'memory.search')

    expect(output).toContain('1. WATCH BASE APP')
    expect(output).toContain('(project • chat:chat:watch-base-deploy@chat)')
    expect(output).toContain('2. BASE DOCKER STORAGE MIGRATION COMPLETED')
    expect(output).not.toContain('Found 2 memories and 0 reminders')
  })

  it('falls back to the message when memory.search has no memories', () => {
    expect(formatOutput({
      ok: true,
      message: 'Found 0 memories and 0 reminders',
      data: { memories: [], reminders: [] },
    }, 'memory.search')).toBe('Found 0 memories and 0 reminders')
  })
})

describe('structured tool result views', () => {
  const toolSearchPayload = {
    result: {
      content: [{
        type: 'text',
        text: 'Found 2 tool(s) matching the request.\n' + JSON.stringify({
          matches: [
            {
              name: 'file.read',
              description: 'Prefer Jait tools whenever possible.\n\nRead the contents of a project file.',
              category: 'filesystem',
              tier: 'standard',
              parameters: { type: 'object', properties: { path: { type: 'string' } } },
            },
            {
              name: 'preview.open',
              description: 'Open the live web preview.',
              category: 'surfaces',
              tier: 'standard',
              parameters: { type: 'object' },
            },
          ],
        }),
      }],
    },
  }

  it('extracts concise search rows from nested MCP envelopes', () => {
    expect(getToolSearchResultItems(toolSearchPayload)).toEqual([
      {
        name: 'file.read',
        description: 'Read the contents of a project file.',
        category: 'filesystem',
        tier: 'standard',
      },
      {
        name: 'preview.open',
        description: 'Open the live web preview.',
        category: 'surfaces',
        tier: 'standard',
      },
    ])
  })

  it('renders tool search results as readable rows without schema JSON', () => {
    const markup = renderToStaticMarkup(
      createElement(ToolSearchResultsView, { items: getToolSearchResultItems(toolSearchPayload) }),
    )

    expect(markup).toContain('Available tools')
    expect(markup).toContain('2 found')
    expect(markup).toContain('file.read')
    expect(markup).toContain('Filesystem')
    expect(markup).not.toContain('parameters')
    expect(markup).not.toContain('&quot;')
  })

  it('renders generic structured data with human labels and values', () => {
    expect(humanizeStructuredKey('exit_code')).toBe('Exit Code')
    expect(humanizeStructuredKey('terminalId')).toBe('Terminal Id')

    const markup = renderToStaticMarkup(
      createElement(StructuredDataView, {
        value: {
          exit_code: 0,
          timedOut: false,
          targets: [{ display_name: 'Gateway', connected: true }],
        },
      }),
    )

    expect(markup).toContain('Exit Code')
    expect(markup).toContain('Timed Out')
    expect(markup).toContain('Display Name')
    expect(markup).toContain('Gateway')
    expect(markup).toContain('Yes')
    expect(markup).toContain('No')
    expect(markup).not.toContain('&quot;Gateway&quot;')
    expect(markup).not.toContain('[0]')
  })
})

describe('getCallSummary', () => {
  it('shows only the file and method for wrapped Jait file tools', () => {
    const wrappedFileTool = {
      server: 'jait',
      tool: 'file_write',
      title: 'mcp.jait.file_write',
      arguments: {
        path: 'apps/web/src/components/chat/tool-call-card.tsx',
        method: 'getCallSummary',
      },
    }

    expect(getCallSummary('core.file_write', wrappedFileTool)).toBe('tool-call-card.tsx · getCallSummary')
    expect(getToolInvocationLabels('core.file_write', wrappedFileTool)).toEqual({
      running: 'Writing tool-call-card.tsx',
      done: 'Created tool-call-card.tsx',
    })
  })

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
    )).toBe('App.tsx')
  })

  it('uses ACP edit aliases as an edit filename with diff counts', () => {
    expect(getCallSummary('replace_string_in_file', {
      targetFile: 'packages/gateway/src/providers/acp-provider.ts',
      old_str: 'before',
      new_str: 'after\nagain',
    })).toBe('acp-provider.ts (+2 -1)')
  })

  it('counts only changed edit lines instead of whole blocks', () => {
    const oldBlock = ['same 1', 'same 2', 'old value', 'same 3'].join('\n')
    const newBlock = ['same 1', 'same 2', 'new value', 'same 3'].join('\n')
    expect(getEditDiffCounts('replace_string_in_file', {
      targetFile: 'src/app.ts',
      old_str: oldBlock,
      new_str: newBlock,
    })).toEqual({ insertions: 1, deletions: 1 })
    expect(getCallSummary('replace_string_in_file', {
      targetFile: 'src/app.ts',
      old_str: oldBlock,
      new_str: newBlock,
    })).toBe('app.ts (+1 -1)')
  })
})

describe('getTodoToolListItems', () => {
  it('normalizes task arguments for the native todo card', () => {
    expect(getTodoToolListItems({
      todoList: [
        { id: 1, title: 'Trace rendering', status: 'completed' },
        { id: 2, title: 'Build task card', status: 'in_progress' },
        { id: 3, title: 'Run verification', status: 'pending' },
      ],
    })).toEqual([
      { id: 1, title: 'Trace rendering', status: 'completed' },
      { id: 2, title: 'Build task card', status: 'in-progress' },
      { id: 3, title: 'Run verification', status: 'not-started' },
    ])
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
        mission: null,
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
      { callId: '1', tool: 'run.ssh', args: { host: '192.0.2.10' }, status: 'running', startedAt: 1 },
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

  it('treats image.view results with a data URI as inline-rendered tool calls', () => {
    expect(isInlineToolCall({
      callId: '1',
      tool: 'image.view',
      args: { path: 'logo.png' },
      status: 'success',
      startedAt: 1,
      completedAt: 2,
      result: { ok: true, message: 'Displaying image logo.png', data: { path: 'logo.png', base64: 'ABC123', dataUri: 'data:image/png;base64,ABC123', mimeType: 'image/png', size: 4 } },
    })).toBe(true)
  })

  it('keeps image.view tool groups expanded so the image stays visible', () => {
    expect(shouldInitiallyCollapseToolCallGroup(
      [
        {
          callId: '1',
          tool: 'image.view',
          args: { path: 'logo.png' },
          status: 'success',
          startedAt: 1,
          completedAt: 2,
          result: { ok: true, message: 'Displaying image logo.png', data: { path: 'logo.png', base64: 'ABC123', dataUri: 'data:image/png;base64,ABC123', mimeType: 'image/png', size: 4 } },
        },
        { callId: '2', tool: 'read', args: { path: 'b.ts' }, status: 'success', startedAt: 3, completedAt: 4 },
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
