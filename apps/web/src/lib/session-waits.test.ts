import type { SessionWait } from '@jait/shared'
import { describe, expect, it } from 'vitest'
import {
  applySessionWaitEvent as apply,
  blockingWaitSessionIds,
  primarySessionWait,
  primarySessionWaits,
  sessionWaitsForSession,
  type SessionWaitMap,
} from './session-waits'

function wait(overrides: Partial<SessionWait> & Pick<SessionWait, 'key' | 'kind'>): SessionWait {
  return {
    sessionId: 'chat-a',
    label: overrides.kind,
    blocking: true,
    ...overrides,
  }
}

function updated(sessionId: string, waits: SessionWait[]) {
  return { type: 'session-wait.updated', payload: { sessionId, waits } }
}

describe('session wait WebSocket state', () => {
  it('replaces a session with the authoritative wait list it reports', () => {
    let state: SessionWaitMap = new Map()
    state = apply(state, updated('chat-a', [wait({ key: 'terminal:term-1', kind: 'terminal' })]))
    expect([...state.keys()]).toEqual(['terminal:term-1'])

    // The gateway sends the full list for the session, so a newer payload must
    // drop keys it no longer contains.
    state = apply(state, updated('chat-a', [wait({ key: 'browser:chat-a', kind: 'browser' })]))
    expect([...state.keys()]).toEqual(['browser:chat-a'])
  })

  it('clears a session when it reports an empty list', () => {
    const state = apply(
      apply(new Map(), updated('chat-a', [wait({ key: 'browser:chat-a', kind: 'browser' })])),
      updated('chat-a', []),
    )
    expect(state.size).toBe(0)
  })

  it('keeps other sessions while one session clears', () => {
    let state: SessionWaitMap = new Map()
    state = apply(state, updated('chat-a', [wait({ key: 'browser:chat-a', kind: 'browser' })]))
    state = apply(state, updated('chat-b', [wait({ key: 'question:1', kind: 'question', sessionId: 'chat-b' })]))
    state = apply(state, updated('chat-a', []))
    expect([...state.keys()]).toEqual(['question:1'])
  })

  it('keeps a background wait alongside a blocking one', () => {
    const state = apply(
      new Map(),
      updated('chat-a', [
        wait({ key: 'question:1', kind: 'question' }),
        wait({ key: 'background:term-1', kind: 'background', blocking: false }),
      ]),
    )
    expect(state.size).toBe(2)
    expect(primarySessionWait(state, 'chat-a')?.kind).toBe('question')
    expect(sessionWaitsForSession(state, 'chat-a').map((entry) => entry.kind)).toEqual(['question', 'background'])
  })

  it('replaces everything with the reconnect snapshot', () => {
    const state: SessionWaitMap = new Map([['stale', wait({ key: 'stale', kind: 'consent', sessionId: 'gone' })]])
    const snapshot = apply(state, {
      type: 'session-wait.snapshot',
      payload: { waits: [wait({ key: 'question:1', kind: 'question', sessionId: 'chat-b' })] },
    })
    expect([...snapshot.keys()]).toEqual(['question:1'])
    expect(apply(snapshot, { type: 'session-wait.snapshot', payload: { waits: [] } }).size).toBe(0)
  })

  it('ignores malformed and unrelated events', () => {
    const state: SessionWaitMap = new Map([['browser:chat-a', wait({ key: 'browser:chat-a', kind: 'browser' })]])
    for (const event of [
      { type: 'session-wait.updated', payload: null },
      { type: 'session-wait.updated', payload: { waits: 'nope' } },
      { type: 'session-wait.updated', payload: { waits: [{ key: 42, kind: 'question' }] } },
      { type: 'session-wait.snapshot', payload: {} },
      { type: 'session-deleted', payload: { sessionId: 'chat-a' } },
    ]) {
      expect(apply(state, event)).toBe(state)
    }
  })

  it('treats a snapshot with no usable entries as nothing pending', () => {
    const state: SessionWaitMap = new Map([['browser:chat-a', wait({ key: 'browser:chat-a', kind: 'browser' })]])
    // The snapshot is authoritative: an entry missing `blocking` cannot be
    // rendered, and holding on to stale waits would show a phantom icon.
    const next = apply(state, {
      type: 'session-wait.snapshot',
      payload: { waits: [{ key: 'x', kind: 'question', sessionId: 'chat-a', label: 'y' }] },
    })
    expect(next.size).toBe(0)
  })
})

describe('session wait selection', () => {
  const state: SessionWaitMap = new Map([
    ['question:1', wait({ key: 'question:1', kind: 'question', sessionId: 'chat-a' })],
    ['browser:chat-a', wait({ key: 'browser:chat-a', kind: 'browser', sessionId: 'chat-a' })],
    ['background:term-1', wait({ key: 'background:term-1', kind: 'background', sessionId: 'chat-b', blocking: false })],
  ])

  it('prefers a blocking reason over a background one', () => {
    const mixed: SessionWaitMap = new Map([
      ['background:term-1', wait({ key: 'background:term-1', kind: 'background', sessionId: 'chat-a', blocking: false })],
      ['terminal:term-2', wait({ key: 'terminal:term-2', kind: 'terminal', sessionId: 'chat-a' })],
    ])
    expect(primarySessionWait(mixed, 'chat-a')?.kind).toBe('terminal')
    // Order inside the map must not matter.
    expect(primarySessionWait(new Map([...mixed].reverse()), 'chat-a')?.kind).toBe('terminal')
  })

  it('falls back to the background wait when nothing blocks', () => {
    expect(primarySessionWait(state, 'chat-b')?.kind).toBe('background')
  })

  it('reduces to one wait per session for list rendering', () => {
    const primary = primarySessionWaits(state)
    expect([...primary.keys()].sort()).toEqual(['chat-a', 'chat-b'])
    expect(primary.get('chat-a')?.kind).toBe('question')
  })

  it('returns nothing for a session with no waits', () => {
    expect(primarySessionWait(state, 'chat-z')).toBeUndefined()
    expect(sessionWaitsForSession(state, 'chat-z')).toEqual([])
  })

  it('counts only blocking waits as attention-worthy sessions', () => {
    expect([...blockingWaitSessionIds(state)]).toEqual(['chat-a'])
  })
})
