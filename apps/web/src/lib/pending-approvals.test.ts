import { describe, expect, it } from 'vitest'
import { applyPendingApprovalEvent as apply } from './pending-approvals'

describe('pending approval WebSocket state', () => {
  it('keeps a chat waiting until all its requests resolve, including timeout/rejection', () => {
    let state: ReadonlyMap<string, string> = new Map()
    for (const id of ['first', 'second', 'second']) {
      state = apply(state, { type: 'consent.required', payload: { id, sessionId: 'background-chat' } })
    }
    expect(state.size).toBe(2)
    state = apply(state, { type: 'consent.resolved', payload: { requestId: 'first', approved: true } })
    expect([...state.values()]).toEqual(['background-chat'])
    state = apply(state, { type: 'consent.resolved', payload: { requestId: 'second', decidedVia: 'timeout' } })
    expect(state.size).toBe(0)
  })

  it('replaces stale state with the authoritative snapshot on reconnect', () => {
    const state = new Map([['stale', 'old-chat']])
    const snapshot = apply(state, { type: 'consent.pending-snapshot', payload: { requests: [{ id: 'new', sessionId: 'other-chat' }] } })
    expect([...snapshot]).toEqual([['new', 'other-chat']])
    expect(apply(snapshot, { type: 'consent.pending-snapshot', payload: { requests: [] } }).size).toBe(0)
  })

  it('ignores malformed and unrelated events', () => {
    const state = new Map([['request', 'chat']])
    for (const event of [{ type: 'consent.required', payload: null }, { type: 'consent.required', payload: { id: 42 } }, { type: 'consent.pending-snapshot', payload: {} }, { type: 'consent.resolved', payload: { requestId: 'unknown' } }]) {
      expect(apply(state, event)).toBe(state)
    }
  })
})
