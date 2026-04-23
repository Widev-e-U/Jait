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
})
