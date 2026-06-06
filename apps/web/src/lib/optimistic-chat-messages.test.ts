import { describe, expect, it } from 'vitest'
import { mergeSnapshotMessagesWithOptimisticUsers, type OptimisticUserMessageLike } from './optimistic-chat-messages'

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

    expect(mergeSnapshotMessagesWithOptimisticUsers(snapshot, current)).toEqual(snapshot)
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
