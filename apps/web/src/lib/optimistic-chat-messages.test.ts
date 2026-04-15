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
