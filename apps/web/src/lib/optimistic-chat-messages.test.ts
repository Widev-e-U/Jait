import { describe, expect, it } from 'vitest'
import {
  createOptimisticAssistantPlaceholder,
  mergeSnapshotMessagesWithOptimisticUsers,
  type OptimisticUserMessageLike,
} from './optimistic-chat-messages'

function user(
  id: string,
  content: string,
  extras: Partial<OptimisticUserMessageLike> = {},
): OptimisticUserMessageLike {
  return {
    id,
    role: 'user',
    content,
    ...extras,
  }
}

describe('mergeSnapshotMessagesWithOptimisticUsers', () => {
  it('keeps the initial SSE reply target when session creation races an empty snapshot', () => {
    const current = [
      user('local-user-1', 'first message', { optimistic: true }),
      createOptimisticAssistantPlaceholder('local-assistant-1'),
    ]

    expect(mergeSnapshotMessagesWithOptimisticUsers([], current).map((message) => message.id)).toEqual([
      'local-user-1',
      'local-assistant-1',
    ])
  })

  it('preserves optimistic user messages missing from the latest snapshot', () => {
    const snapshot = [
      user('server-1', 'older message'),
    ]
    const current = [
      ...snapshot,
      user('local-1', 'new message', { optimistic: true }),
    ]

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current).map((message) => message.id)).toEqual([
      'server-1',
      'local-1',
    ])
  })

  it('drops optimistic messages once the server snapshot contains them', () => {
    const snapshot = [
      user('server-1', 'same message'),
    ]
    const current = [
      user('local-1', 'same message', { optimistic: true }),
    ]

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current)).toEqual(snapshot.map(message => message.role === 'user' ? { ...message, renderId: current[0].id } : message))
  })

  it('matches plain optimistic users whose display content only mirrors content', () => {
    const snapshot = [
      user('server-user-1', 'same plain message'),
      { id: 'server-assistant-1', role: 'assistant' as const, content: 'streamed reply' },
    ]
    const current = [
      user('local-user-1', 'same plain message', {
        optimistic: true,
        displayContent: 'same plain message',
      }),
      { id: 'local-assistant-1', role: 'assistant' as const, content: '' },
    ]

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current)).toEqual(snapshot.map((message, index) => ({ ...message, renderId: current[index].id })))
  })

  it('preserves an optimistic assistant placeholder for an unmatched optimistic user', () => {
    // A follow-up/queued send inserts an optimistic user + an optimistic
    // assistant the reply streams into. When a resume snapshot (taken before
    // the exchange was persisted) replaces messages, only the optimistic USER
    // survives — the assistant placeholder is dropped, so the streaming reply
    // is orphaned and not visible until a reload reads it from the DB.
    const snapshot = [user('server-1', 'older message')]
    const current = [
      ...snapshot,
      user('local-user-1', 'follow up', { optimistic: true }),
      { id: 'local-assistant-1', role: 'assistant' as const, content: '', optimistic: true },
    ]

    const merged = mergeSnapshotMessagesWithOptimisticUsers(snapshot, current)
    expect(merged.map((m) => m.id)).toEqual(['server-1', 'local-user-1', 'local-assistant-1'])
  })

  it('drops an optimistic assistant placeholder once its optimistic user is matched', () => {
    const snapshot = [user('server-1', 'follow up')]
    const current = [
      user('local-user-1', 'follow up', { optimistic: true }),
      { id: 'local-assistant-1', role: 'assistant' as const, content: '', optimistic: true },
    ]

    const merged = mergeSnapshotMessagesWithOptimisticUsers(snapshot, current)
    expect(merged.map((m) => m.id)).toEqual(['server-1'])
  })

  it('matches a prompt with uploads although the gateway rewrote its persisted content', () => {
    const image = { type: 'image' as const, name: 'shot.png', mimeType: 'image/png', data: 'AAAA' }
    const snapshot = [
      user('server-1', 'look at this [attached: shot.png]', {
        displayContent: 'look at this',
        displaySegments: [{ type: 'text', text: 'look at this' }, image],
      }),
      { id: 'server-assistant-1', role: 'assistant' as const, content: 'done' },
    ]
    const current = [
      user('local-1', 'look at this', {
        optimistic: true,
        displaySegments: [{ type: 'text', text: 'look at this' }, { ...image, data: 'data:image/png;base64,AAAA' }],
      }),
      { id: 'local-assistant-1', role: 'assistant' as const, content: 'done', optimistic: true },
    ]

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current).map((message) => message.id))
      .toEqual(['server-1', 'server-assistant-1'])
  })

  it('matches a prompt whose content carries inlined file references but whose segments do not', () => {
    const segments = [{ type: 'text' as const, text: 'fix ' }, { type: 'file' as const, path: 'src/a.ts', name: 'a.ts' }]
    const snapshot = [user('server-1', 'fix <file src/a.ts>…</file>', { displaySegments: segments, displayContent: 'fix ' })]
    const current = [user('local-1', 'fix <file src/a.ts>…</file>\n', { optimistic: true, displayContent: 'fix', displaySegments: segments })]

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current).map((message) => message.id)).toEqual(['server-1'])
  })

  it('does not let an older identical persisted prompt swallow a pending one', () => {
    const older = user('server-old', 'go on')
    const current = [
      older,
      { id: 'server-old-reply', role: 'assistant' as const, content: 'ok' },
      user('local-1', 'go on', { optimistic: true }),
    ]
    // Snapshot taken before the new prompt was persisted.
    const snapshot = current.slice(0, 2)

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current).map((message) => message.id))
      .toEqual(['server-old', 'server-old-reply', 'local-1'])
  })

  it('matches repeated identical messages by count instead of removing them all', () => {
    const snapshot = [
      user('server-1', 'repeat'),
    ]
    const current = [
      user('local-1', 'repeat', { optimistic: true }),
      user('local-2', 'repeat', { optimistic: true }),
    ]

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current).map((message) => message.id)).toEqual([
      'server-1',
      'local-2',
    ])
  })
})


describe('message render identity', () => {
  it('keeps prompt and response identities through completion and subsequent snapshots', () => {
    const current: OptimisticUserMessageLike[] = [
      user('local-user', 'hello', { optimistic: true }),
      { id: 'local-assistant', role: 'assistant', content: 'partial answer' },
    ]
    const snapshot: OptimisticUserMessageLike[] = [
      user('saved-user', 'hello'),
      { id: 'saved-assistant', role: 'assistant', content: 'final answer' },
    ]
    const merged = mergeSnapshotMessagesWithOptimisticUsers(snapshot, current)
    expect(merged.map(message => message.id)).toEqual(['saved-user', 'saved-assistant'])
    expect(merged.map(message => message.renderId)).toEqual(['local-user', 'local-assistant'])
    expect(merged[1].content).toBe('final answer')
    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, merged)).toEqual(merged)
  })

  it('does not give an older identical prompt the new turn identity', () => {
    const older = user('older-user', 'repeat')
    const current = [older, user('local-user', 'repeat', { optimistic: true })]
    const snapshot = [older, user('saved-user', 'repeat')]
    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current)).toEqual([
      older, { ...snapshot[1], renderId: 'local-user' },
    ])
  })

  it('keeps independent identities for multiple identical optimistic prompts', () => {
    const current = ['local-1', 'local-2'].map(id => user(id, 'repeat', { optimistic: true }))
    const snapshot = ['saved-1', 'saved-2'].map(id => user(id, 'repeat'))
    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current).map(message => message.renderId))
      .toEqual(['local-1', 'local-2'])
  })
})
