import { describe, expect, it } from 'vitest'
import { activitiesToMessages } from './activity-to-messages'
import type { ThreadActivity } from '@/lib/agents-api'

describe('activitiesToMessages', () => {
  it('normalizes edit tool aliases from thread activities', () => {
    const messages = activitiesToMessages([
      {
        id: 'a1',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using edit',
        payload: {
          callId: 'c1',
          tool: 'edit',
          args: {
            file_path: 'apps/web/src/App.tsx',
            old_string: 'before',
            new_string: 'after',
          },
        },
        createdAt: '2026-03-16T00:00:00.000Z',
      },
    ] as ThreadActivity[])

    expect(messages[0]?.toolCalls?.[0]?.args).toMatchObject({
      path: 'apps/web/src/App.tsx',
      search: 'before',
      replace: 'after',
    })
  })

  it('backfills normalized fields from tool results', () => {
    const messages = activitiesToMessages([
      {
        id: 'a1',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'web: done',
        payload: {
          callId: 'c1',
          tool: 'web',
          ok: true,
          message: 'done',
          data: {
            searchQuery: 'openai codex cli mcp',
          },
        },
        createdAt: '2026-03-16T00:00:01.000Z',
      },
    ] as ThreadActivity[])

    expect(messages[0]?.toolCalls?.[0]?.args).toMatchObject({
      query: 'openai codex cli mcp',
    })
  })

  it('synthesizes tool calls from result-only edit activities', () => {
    const activities: ThreadActivity[] = [
      {
        id: 'a1',
        threadId: 't1',
        kind: 'tool.result',
        summary: 'edit completed',
        createdAt: '2026-03-16T00:00:00.000Z',
        payload: {
          tool: 'edit',
          message: '',
          data: {
            path: 'apps/web/src/App.tsx',
            content: 'updated file content',
          },
        },
      },
    ]

    const messages = activitiesToMessages(activities)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.toolCalls).toHaveLength(1)
    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      tool: 'edit',
      status: 'success',
      args: {
        path: 'apps/web/src/App.tsx',
        content: 'updated file content',
      },
      result: {
        ok: true,
        message: 'updated file content',
      },
    })
  })

  it('preserves web result content when provider only stores result payload', () => {
    const activities: ThreadActivity[] = [
      {
        id: 'a1',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using web.search',
        createdAt: '2026-03-16T00:00:00.000Z',
        payload: {
          tool: 'web.search',
          callId: 'call-1',
          args: {},
        },
      },
      {
        id: 'a2',
        threadId: 't1',
        kind: 'tool.result',
        summary: 'web.search completed',
        createdAt: '2026-03-16T00:00:01.000Z',
        payload: {
          tool: 'web.search',
          callId: 'call-1',
          message: '',
          data: {
            query: 'long overlap bug',
            results: [
              { title: 'Result 1', url: 'https://example.com/1', snippet: 'one' },
            ],
          },
        },
      },
    ]

    const messages = activitiesToMessages(activities)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      tool: 'web.search',
      args: {
        query: 'long overlap bug',
      },
      result: {
        ok: true,
        data: {
          query: 'long overlap bug',
        },
      },
    })
    expect(messages[0]?.toolCalls?.[0]?.result?.message).toBe('web.search completed')
  })

  it('preserves explicit parent call ancestry from activities', () => {
    const messages = activitiesToMessages([
      {
        id: 'a1',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using agent',
        payload: {
          callId: 'parent-1',
          tool: 'agent',
          args: {
            description: 'delegate search',
          },
        },
        createdAt: '2026-03-16T00:00:00.000Z',
      },
      {
        id: 'a2',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using search',
        payload: {
          callId: 'child-1',
          parentCallId: 'parent-1',
          tool: 'search',
          args: {
            query: 'auth middleware',
          },
        },
        createdAt: '2026-03-16T00:00:01.000Z',
      },
    ] as ThreadActivity[])

    expect(messages[0]?.toolCalls?.[1]).toMatchObject({
      callId: 'child-1',
      parentCallId: 'parent-1',
      tool: 'search',
    })
  })

  it('keeps thinking activities in assistant segment order', () => {
    const messages = activitiesToMessages([
      {
        id: 'a1',
        threadId: 't1',
        kind: 'thinking',
        summary: 'considering tools',
        payload: {},
        createdAt: '2026-03-16T00:00:00.000Z',
      },
      {
        id: 'a2',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using read',
        payload: { callId: 'c1', tool: 'read', args: { path: 'README.md' } },
        createdAt: '2026-03-16T00:00:01.000Z',
      },
      {
        id: 'a3',
        threadId: 't1',
        kind: 'message',
        summary: 'Done',
        payload: { role: 'assistant', content: 'Done' },
        createdAt: '2026-03-16T00:00:02.000Z',
      },
    ] as ThreadActivity[])

    expect(messages[0]?.segments).toEqual([
      { type: 'thinking', content: 'considering tools' },
      { type: 'toolGroup', callIds: ['c1'] },
      { type: 'text', content: 'Done' },
    ])
  })

  it('produces interleaved text and tool segments from ACP-style activities', () => {
    // Simulates: user msg → assistant text → tool.start → tool.result → assistant text → done
    // This is the exact activity sequence that buildThreadEventHandler produces
    // when an ACP provider emits tokens between tool calls.
    const activities: ThreadActivity[] = [
      {
        id: 'u1',
        threadId: 't1',
        kind: 'message',
        summary: 'do something',
        payload: { role: 'user', content: 'do something' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'a1',
        threadId: 't1',
        kind: 'message',
        summary: 'Let me check that file.',
        payload: { role: 'assistant', content: 'Let me check that file.' },
        createdAt: '2026-01-01T00:00:01.000Z',
      },
      {
        id: 'ts1',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using read_file',
        payload: { callId: 'c1', tool: 'read_file', args: { path: '/tmp/test.txt' } },
        createdAt: '2026-01-01T00:00:02.000Z',
      },
      {
        id: 'tr1',
        threadId: 't1',
        kind: 'tool.result',
        summary: 'read_file: file contents',
        payload: { callId: 'c1', tool: 'read_file', ok: true, message: 'file contents' },
        createdAt: '2026-01-01T00:00:03.000Z',
      },
      {
        id: 'a2',
        threadId: 't1',
        kind: 'message',
        summary: 'The file contains the expected data.',
        payload: { role: 'assistant', content: 'The file contains the expected data.' },
        createdAt: '2026-01-01T00:00:04.000Z',
      },
    ]

    const messages = activitiesToMessages(activities)

    // Should produce: user message, then one assistant message with segments
    const userMsgs = messages.filter((m) => m.role === 'user')
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')

    expect(userMsgs).toHaveLength(1)
    expect(userMsgs[0]!.content).toBe('do something')

    // The assistant message should contain both text and tool call
    expect(assistantMsgs).toHaveLength(1)
    const assistant = assistantMsgs[0]!
    expect(assistant.content).toContain('Let me check that file.')
    expect(assistant.content).toContain('The file contains the expected data.')
    expect(assistant.toolCalls).toHaveLength(1)
    expect(assistant.toolCalls![0]!.tool).toBe('read_file')

    // Segments should interleave text ↔ toolGroup ↔ text
    expect(assistant.segments).toBeDefined()
    const segTypes = assistant.segments!.map((s) => s.type)
    expect(segTypes).toEqual(['text', 'toolGroup', 'text'])
  })

  it('handles multiple tool calls with interleaved assistant text from ACP', () => {
    const activities: ThreadActivity[] = [
      {
        id: 'a1',
        threadId: 't1',
        kind: 'message',
        summary: "First I'll read the file.",
        payload: { role: 'assistant', content: "First I'll read the file." },
        createdAt: '2026-01-01T00:00:01.000Z',
      },
      {
        id: 'ts1',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using read_file',
        payload: { callId: 'c1', tool: 'read_file', args: { path: '/a.txt' } },
        createdAt: '2026-01-01T00:00:02.000Z',
      },
      {
        id: 'tr1',
        threadId: 't1',
        kind: 'tool.result',
        summary: 'read_file: ok',
        payload: { callId: 'c1', tool: 'read_file', ok: true, message: 'ok' },
        createdAt: '2026-01-01T00:00:03.000Z',
      },
      {
        id: 'a2',
        threadId: 't1',
        kind: 'message',
        summary: 'Now let me write the output.',
        payload: { role: 'assistant', content: 'Now let me write the output.' },
        createdAt: '2026-01-01T00:00:04.000Z',
      },
      {
        id: 'ts2',
        threadId: 't1',
        kind: 'tool.start',
        summary: 'Using write_file',
        payload: { callId: 'c2', tool: 'write_file', args: { path: '/b.txt' } },
        createdAt: '2026-01-01T00:00:05.000Z',
      },
      {
        id: 'tr2',
        threadId: 't1',
        kind: 'tool.result',
        summary: 'write_file: ok',
        payload: { callId: 'c2', tool: 'write_file', ok: true, message: 'ok' },
        createdAt: '2026-01-01T00:00:06.000Z',
      },
      {
        id: 'a3',
        threadId: 't1',
        kind: 'message',
        summary: 'All done!',
        payload: { role: 'assistant', content: 'All done!' },
        createdAt: '2026-01-01T00:00:07.000Z',
      },
    ]

    const messages = activitiesToMessages(activities)
    const assistant = messages.find((m) => m.role === 'assistant')!

    // All three text segments should be in content
    expect(assistant.content).toContain("First I'll read the file.")
    expect(assistant.content).toContain('Now let me write the output.')
    expect(assistant.content).toContain('All done!')

    // Two tool calls
    expect(assistant.toolCalls).toHaveLength(2)

    // Segments: text → toolGroup → text → toolGroup → text
    const segTypes = assistant.segments!.map((s) => s.type)
    expect(segTypes).toEqual(['text', 'toolGroup', 'text', 'toolGroup', 'text'])
  })
})
