import { describe, expect, it } from 'vitest'
import { applyPendingQuestionEvent as apply, pendingQuestionSessionIds } from './pending-questions'

describe('pending user-question WebSocket state', () => {
  it('badges a chat while any of its questions is unanswered', () => {
    let state: ReadonlyMap<string, string> = new Map()
    for (const id of ['first', 'second', 'second']) {
      state = apply(state, { type: 'user-question.requested', payload: { id, sessionId: 'background-chat' } })
    }
    expect(state.size).toBe(2)
    state = apply(state, { type: 'user-question.resolved', payload: { id: 'first', status: 'submitted' } })
    expect([...pendingQuestionSessionIds(state)]).toEqual(['background-chat'])
    state = apply(state, { type: 'user-question.resolved', payload: { id: 'second', status: 'timeout' } })
    expect(state.size).toBe(0)
  })

  it('replaces stale state with the authoritative snapshot on reconnect', () => {
    const state = new Map([['stale', 'old-chat']])
    const snapshot = apply(state, { type: 'user-question.pending-snapshot', payload: { requests: [{ id: 'new', sessionId: 'other-chat' }] } })
    expect([...snapshot]).toEqual([['new', 'other-chat']])
    expect(apply(snapshot, { type: 'user-question.pending-snapshot', payload: { requests: [] } }).size).toBe(0)
  })

  it('ignores malformed and unrelated events', () => {
    const state = new Map([['request', 'chat']])
    for (const event of [
      { type: 'user-question.requested', payload: null },
      { type: 'user-question.requested', payload: { id: 42 } },
      { type: 'user-question.pending-snapshot', payload: {} },
      { type: 'user-question.resolved', payload: { id: 'unknown' } },
      { type: 'consent.required', payload: { id: 'consent', sessionId: 'chat' } },
    ]) {
      expect(apply(state, event)).toBe(state)
    }
  })
})
