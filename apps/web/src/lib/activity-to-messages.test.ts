import { describe, expect, it } from 'vitest'
import { activitiesToMessages } from './activity-to-messages'
import type { ThreadActivity } from './agents-api'

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
        summary: 'Using web',
        payload: {
          callId: 'c1',
          tool: 'web',
          args: {},
        },
        createdAt: '2026-03-16T00:00:00.000Z',
      },
      {
        id: 'a2',
        threadId: 't1',
        kind: 'tool.result',
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
})
