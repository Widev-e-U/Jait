import { describe, expect, it } from 'vitest'

import {
  resolveEditRestartTargetIndex,
  transcriptBeforeEditTarget,
  type EditRestartRenderableMessage,
} from './edit-resend'

const user = (id: string, content = `content-${id}`): EditRestartRenderableMessage => ({
  id,
  role: 'user',
  content,
})
const assistant = (id: string, content = `answer-${id}`): EditRestartRenderableMessage => ({
  id,
  role: 'assistant',
  content,
})
const notice = (id: string): EditRestartRenderableMessage => ({
  id,
  role: 'user',
  kind: 'system-notice',
  content: 'Background terminal completed.',
})

describe('resolveEditRestartTargetIndex', () => {
  const transcript = [user('s-0'), assistant('s-1'), user('s-2'), assistant('s-3')]

  it('prefers the message id', () => {
    expect(resolveEditRestartTargetIndex(transcript, { messageId: 's-2' })).toBe(2)
  })

  it('falls back to messageFromEnd when the id is unknown', () => {
    // messageFromEnd: 2 points at the assistant answer of the first turn,
    // which walks back to that turn's user message.
    expect(resolveEditRestartTargetIndex(transcript, { messageId: 'gone', messageFromEnd: 2 })).toBe(0)
  })

  it('falls back to the absolute messageIndex when the id is unknown', () => {
    expect(resolveEditRestartTargetIndex(transcript, { messageId: 'gone', messageIndex: 2 })).toBe(2)
  })

  it('walks back to the nearest user message for off-by-one indexes', () => {
    // messageFromEnd: 0 points at the trailing assistant answer.
    expect(resolveEditRestartTargetIndex(transcript, { messageFromEnd: 0 })).toBe(2)
  })

  it('ignores system notices when resolving', () => {
    const withNotice = [user('s-0'), assistant('s-1'), notice('s-2')]
    expect(resolveEditRestartTargetIndex(withNotice, { messageId: 's-2' })).toBe(-1)
    expect(resolveEditRestartTargetIndex(withNotice, { messageFromEnd: 0 })).toBe(0)
  })

  it('resolves optimistic rows by id (edit of a freshly sent message)', () => {
    const withOptimistic = [...transcript, { id: 'user-pending', role: 'user', content: 'new', optimistic: true }]
    expect(resolveEditRestartTargetIndex(withOptimistic, { messageId: 'user-pending' })).toBe(4)
  })

  it('returns -1 when nothing resolves', () => {
    expect(resolveEditRestartTargetIndex([], { messageIndex: 3 })).toBe(-1)
    expect(resolveEditRestartTargetIndex([assistant('a-0')], { messageIndex: 0 })).toBe(-1)
    expect(resolveEditRestartTargetIndex(transcript, {})).toBe(-1)
  })
})

describe('transcriptBeforeEditTarget', () => {
  it('drops the edited message and everything after it', () => {
    const transcript = [user('s-0'), assistant('s-1'), user('s-2'), assistant('s-3')]
    expect(transcriptBeforeEditTarget(transcript, { messageId: 's-2' }).map((m) => m.id)).toEqual(['s-0', 's-1'])
  })

  it('keeps everything before the only user message', () => {
    const transcript = [user('s-0'), assistant('s-1')]
    expect(transcriptBeforeEditTarget(transcript, { messageFromEnd: 1 })).toEqual([])
  })

  it('falls back to the full transcript when the target cannot be resolved', () => {
    const transcript = [user('s-0'), assistant('s-1')]
    const result = transcriptBeforeEditTarget(transcript, { messageId: 'gone' })
    expect(result.map((m) => m.id)).toEqual(['s-0', 's-1'])
    expect(result).not.toBe(transcript)
  })
})
