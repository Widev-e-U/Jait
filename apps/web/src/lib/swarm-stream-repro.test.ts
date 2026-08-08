import { describe, expect, it, vi } from 'vitest'
import { createMessageStream } from '@/lib/message-stream'
import { createStreamTextPacer } from '@/lib/stream-text-pacer'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'

// REGRESSION TEST for the swarm live-stream stall.
//
// In swarm mode the coordinator's first content-bearing SSE events are TOOL
// events (agent.spawn), not text tokens. The direct-POST handler previously
// awaited textPacer.waitUntilIdle() before processing each tool event, which
// blocks the SSE reader loop behind the (long) swarm mode_notice text pacing
// (rAF/deadline). While that text drained, no tool/sub-agent content rendered
// — the UI looked frozen until a reload.
//
// The fix uses textPacer.flushNow(), which drains any pending text
// synchronously so the tool event renders immediately (ordering preserved:
// text before tool), without blocking the SSE reader loop on the text pacer.
function makeClock() {
  let frame: (() => void) | null = null
  let deadline: (() => void) | null = null
  const requestFrame = vi.fn((cb: () => void) => { frame = cb; return 7 })
  const cancelFrame = vi.fn(() => { frame = null })
  const setDeadline = vi.fn((cb: () => void) => { deadline = cb; return 9 })
  const clearDeadline = vi.fn(() => { deadline = null })
  return { requestFrame, cancelFrame, setDeadline, clearDeadline }
}

describe('swarm direct-POST tool rendering (flushNow, non-blocking)', () => {
  it('renders the coordinator tool card + specialist prose immediately even while a long mode_notice is still queued in the text pacer (no rAF pumping required)', () => {
    const stream = createMessageStream()
    const clock = makeClock()
    let commitCount = 0
    const commits: any[] = []

    const streamScheduler = createStreamRenderScheduler({
      onFlush: () => { commits.push(stream.snapshot()); commitCount++ },
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
      deadlineMs: 300,
    })

    const textPacer = createStreamTextPacer({
      onText: (c) => stream.pushText(c),
      onThinking: (c) => stream.pushThinking(c),
      onCommit: () => { commits.push(stream.snapshot()); commitCount++ },
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
      maxChunkChars: 24,
      deadlineMs: 300,
    })

    // Long swarm mode_notice is enqueued (still queued — NOT yet drained).
    textPacer.enqueueText('Running in Swarm mode — the coordinator is restricted to orchestration tools and must delegate all implementation work to specialist sub-agents.')

    // tool_call_delta + tool_start arrive before the mode_notice has drained.
    // NEW behavior: flushNow() drains pending text synchronously instead of
    // awaiting the pacer, so the tool card renders in the same synchronous pass.
    textPacer.flushNow()
    stream.pushToolStart('agent-call', 'agent', { prompt: 'Do the work', description: 'Developer' })
    streamScheduler.flushNow()

    // specialist prose -> tool_output -> scheduled commit
    stream.pushToolOutput('agent-call', 'specialist live prose', 'text')
    streamScheduler.flushNow()

    // tool_result -> immediate
    stream.pushToolResult('agent-call', true, 'done', undefined)
    streamScheduler.flushNow()

    const snap = stream.snapshot() as any
    const tc = snap.toolCalls?.find((t: any) => t.callId === 'agent-call')
    expect(tc).toBeTruthy()
    expect(tc.tool).toBe('agent')
    expect(tc.childSegments?.some((s: any) => s.type === 'text' && s.content === 'specialist live prose')).toBe(true)
    // The mode_notice text was flushed before the tool events.
    expect(snap.segments?.some((s: any) => s.type === 'text' && /Running in Swarm mode/.test(s.content ?? ''))).toBe(true)
    expect(commitCount).toBeGreaterThan(0)
  })
})
