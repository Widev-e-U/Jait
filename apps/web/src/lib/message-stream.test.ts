import { describe, it, expect, vi } from 'vitest'
import { createMessageStream, resumeEventsToSnapshot, snapshotToChatMessageUpdates } from '@/lib/message-stream'

describe('createMessageStream', () => {
  it('accumulates text and thinking in order', () => {
    const stream = createMessageStream()
    stream.pushText('Hello ')
    stream.pushThinking('(thinking)')
    stream.pushText('world')
    const snap = stream.snapshot()
    expect(snap.content).toBe('Hello world')
    expect(snap.thinking).toBe('(thinking)')
    expect(snap.segments).toEqual([
      { type: 'text', content: 'Hello ' },
      { type: 'thinking', content: '(thinking)' },
      { type: 'text', content: 'world' },
    ])
  })

  it('merges consecutive same-type segments', () => {
    const stream = createMessageStream()
    stream.pushText('a')
    stream.pushText('b')
    stream.pushThinking('1')
    stream.pushThinking('2')
    stream.pushToolStart('t1', 'search', {})
    stream.pushToolStart('t2', 'read', {})
    expect(stream.snapshot().segments).toEqual([
      { type: 'text', content: 'ab' },
      { type: 'thinking', content: '12' },
      { type: 'toolGroup', callIds: ['t1', 't2'] },
    ])
  })

  it('anchors a steering marker between the text streamed before and after it', () => {
    const stream = createMessageStream()
    stream.pushText('before the steer')
    stream.pushSteering('do X instead', 'do X instead')
    stream.pushText('after the steer')
    expect(stream.snapshot().segments).toEqual([
      { type: 'text', content: 'before the steer' },
      { type: 'steering', content: 'do X instead', displayContent: 'do X instead' },
      { type: 'text', content: 'after the steer' },
    ])
  })

  it('groups repeated tool call IDs once', () => {
    const stream = createMessageStream()
    stream.pushToolStart('a', 'x', {})
    stream.pushToolOutput('a', 'out')
    stream.pushToolResult('a', true, 'ok', {})
    stream.pushToolStart('a', 'x', {})
    expect(stream.snapshot().segments).toEqual([
      { type: 'toolGroup', callIds: ['a'] },
    ])
  })

  it('handles tool_call_delta then tool_start then output then result', () => {
    const stream = createMessageStream()
    stream.pushToolCallDelta('c1', 'web.se', 'arch', 'p1')
    stream.pushToolStart('c1', 'web.search', { query: 'x' }, 'p1')
    stream.pushToolOutput('c1', 'chunk1')
    stream.pushToolOutput('c1', 'chunk2')
    stream.pushToolResult('c1', true, 'done', { hits: 1 }, 'p1')
    const snap = stream.snapshot()
    expect(snap.toolCalls).toHaveLength(1)
    expect(snap.toolCalls[0]).toMatchObject({
      callId: 'c1',
      parentCallId: 'p1',
      tool: 'web.search',
      args: { query: 'x' },
      status: 'success',
      streamingArgs: undefined,
      streamingOutput: 'chunk1chunk2',
      result: { ok: true, message: 'done', data: { hits: 1 } },
    })
    expect(snap.segments).toEqual([{ type: 'toolGroup', callIds: ['c1'] }])
  })

  it('supports approval_required', () => {
    const stream = createMessageStream()
    stream.pushApprovalRequired('r1', 'c1', 'dangerous', { x: 1 })
    const snap = stream.snapshot()
    expect(snap.toolCalls).toEqual([
      {
        callId: 'c1',
        approvalRequestId: 'r1',
        approvalState: 'pending',
        tool: 'dangerous',
        args: { x: 1 },
        status: 'pending',
        startedAt: expect.any(Number),
      },
    ])
    expect(snap.segments).toEqual([{ type: 'toolGroup', callIds: ['c1'] }])
  })

  it('computes thinking duration on first text token', () => {
    vi.useFakeTimers()
    const stream = createMessageStream()
    stream.pushThinking('a')
    vi.advanceTimersByTime(2500)
    stream.pushText('b')
    const snap = stream.snapshot()
    expect(snap.thinkingDuration).toBeGreaterThanOrEqual(2)
    vi.useRealTimers()
  })

  it('hydrates from a snapshot and re-seeds seen tool call IDs', () => {
    const stream = createMessageStream()
    stream.hydrate({
      content: 'already',
      thinking: 'hmm',
      segments: [
        { type: 'text', content: 'already' },
        { type: 'toolGroup', callIds: ['old1'] },
      ],
      toolCalls: [{ callId: 'old1', tool: 'x', args: {}, status: 'success', startedAt: 1, completedAt: 2 }],
    })
    stream.pushToolStart('old1', 'x', {})
    stream.pushText(' more')
    const snap = stream.snapshot()
    expect(snap.segments).toEqual([
      { type: 'text', content: 'already' },
      { type: 'toolGroup', callIds: ['old1'] },
      { type: 'text', content: ' more' },
    ])
  })

  it('preserves a steering marker across a resume-stream hydrate', () => {
    // Regression: hydrate() runs on every resume-stream reconnect (e.g. the
    // routine handoff right after a direct POST stream finishes), and the
    // server never echoes steering markers back in its snapshot. Without
    // re-anchoring, that hydrate silently wiped a marker recorded moments
    // earlier — the steered message would flash briefly, then disappear as
    // soon as the next snapshot arrived.
    const stream = createMessageStream()
    stream.pushText('before the steer')
    stream.pushSteering('do X instead', 'do X instead')
    stream.pushText('after the steer')

    stream.hydrate({
      content: 'before the steerafter the steer and more',
      segments: [
        { type: 'text', content: 'before the steer' },
        { type: 'text', content: 'after the steer and more' },
      ],
    })

    expect(stream.snapshot().segments).toEqual([
      { type: 'text', content: 'before the steer' },
      { type: 'steering', content: 'do X instead', displayContent: 'do X instead' },
      { type: 'text', content: 'after the steer and more' },
    ])
  })

  it('does not duplicate a steering marker echoed by a persisted snapshot', () => {
    const stream = createMessageStream()
    stream.pushText('before')
    stream.pushSteering('do X instead', 'do X instead')

    stream.hydrate({
      content: 'beforeafter',
      segments: [
        { type: 'text', content: 'before' },
        { type: 'steering', content: 'do X instead' },
        { type: 'text', content: 'after' },
      ],
    })

    expect(stream.snapshot().segments).toEqual([
      { type: 'text', content: 'before' },
      { type: 'steering', content: 'do X instead' },
      { type: 'text', content: 'after' },
    ])
  })

  it('resets all state', () => {
    const stream = createMessageStream()
    stream.pushText('hello')
    stream.pushToolStart('t1', 'x', {})
    stream.reset()
    const snap = stream.snapshot()
    expect(snap.content).toBe('')
    expect(snap.segments).toEqual([])
    expect(snap.toolCalls).toEqual([])
  })

  it('finish marks running/pending tool calls as cancelled', () => {
    const stream = createMessageStream()
    stream.pushToolStart('t1', 'x', {})
    stream.pushApprovalRequired('r1', 't2', 'y', {})
    stream.pushToolResult('t1', true, 'ok', {})
    stream.pushToolStart('t3', 'z', {})
    const snap = stream.finish()
    const statuses = snap.toolCalls.map(tc => tc.status)
    expect(statuses).toEqual(['success', 'error', 'error'])
    expect(snap.toolCalls[1].result).toEqual({ ok: false, message: 'Cancelled' })
  })

  it('reports active tool calls', () => {
    const stream = createMessageStream()
    stream.pushToolStart('t1', 'x', {})
    expect(stream.hasActiveToolCalls()).toBe(true)
    stream.pushToolResult('t1', true, 'ok', {})
    expect(stream.hasActiveToolCalls()).toBe(false)
  })

  it('markDirty only invokes callback once until snapshot', () => {
    const stream = createMessageStream()
    const cb = vi.fn()
    stream.markDirty(cb)
    stream.pushText('a')
    stream.pushText('b')
    stream.pushText('c')
    // Callback fires once for the batch, and markDirty flushes dirty immediately.
    expect(cb).toHaveBeenCalledTimes(1)
    // Consuming the snapshot resets the logical dirty state for the scheduler.
    stream.snapshot()
    stream.markDirty(cb)
    stream.pushText('d')
    expect(cb).toHaveBeenCalledTimes(2)
  })
})

describe('resumeEventsToSnapshot', () => {
  it('interleaves text, thinking, and tool calls', () => {
    const snap = resumeEventsToSnapshot([
      { type: 'text', content: 'First ' },
      { type: 'thinking', content: 'hmm' },
      { type: 'tool', callId: 't1' },
      { type: 'text', content: 'second' },
      { type: 'tool', callId: 't2' },
      { type: 'tool', callId: 't1' },
    ])
    expect(snap.segments).toEqual([
      { type: 'text', content: 'First ' },
      { type: 'thinking', content: 'hmm' },
      { type: 'toolGroup', callIds: ['t1'] },
      { type: 'text', content: 'second' },
      { type: 'toolGroup', callIds: ['t2'] },
    ])
  })
})

describe('snapshotToChatMessageUpdates', () => {
  it('produces ChatMessage updates', () => {
    const updates = snapshotToChatMessageUpdates({
      content: 'hello',
      thinking: 'hmm',
      thinkingDuration: 3,
      toolCalls: [],
      segments: [{ type: 'text', content: 'hello' }],
    })
    expect(updates).toEqual({
      content: 'hello',
      thinking: 'hmm',
      thinkingDuration: 3,
      toolCalls: [],
      segments: [{ type: 'text', content: 'hello' }],
    })
  })

  it('omits empty thinking', () => {
    const updates = snapshotToChatMessageUpdates({
      content: 'hello',
      thinking: '',
      thinkingDuration: undefined,
      toolCalls: [],
      segments: [{ type: 'text', content: 'hello' }],
    })
    expect(updates.thinking).toBeUndefined()
  })
})
