import { describe, expect, it, vi } from 'vitest'
import { createMessageStream } from '@/lib/message-stream'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'

// REGRESSION TEST for the swarm live-stream stall.
//
// In swarm mode the coordinator's first content-bearing SSE events are TOOL
// events (agent.spawn), not text tokens. Historically a text "pacer" sat between
// the SSE reader and the message stream: it split text into 24-char chunks and
// drained them on a rAF/deadline tick, and the tool-event handler awaited
// `textPacer.waitUntilIdle()` first. That await blocked the reader loop behind
// the (long) swarm mode_notice text animation, so no tool/sub-agent content
// rendered — the UI looked frozen until a reload.
//
// The fix removes the pacer entirely: text is ingested straight into the
// message stream in wire order, and React commits are coalesced by the render
// scheduler. A tool event therefore renders in the same pass as the text that
// preceded it, with nothing between the reader and the stream.
function makeClock() {
  let frame: (() => void) | null = null
  let deadline: (() => void) | null = null
  const requestFrame = vi.fn((cb: () => void) => { frame = cb; return 7 })
  const cancelFrame = vi.fn(() => { frame = null })
  const setDeadline = vi.fn((cb: () => void) => { deadline = cb; return 9 })
  const clearDeadline = vi.fn(() => { deadline = null })
  return { requestFrame, cancelFrame, setDeadline, clearDeadline }
}

describe('swarm direct-POST tool rendering (direct ingestion, non-blocking)', () => {
  it('renders the coordinator tool card + specialist prose immediately in the same pass as the preceding text (no rAF pumping required)', () => {
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

    // useChat wires every stream mutation to schedule a coalesced commit.
    stream.markDirty(streamScheduler.schedule)

    // Long swarm mode_notice is ingested directly — nothing is queued/animated.
    stream.pushText('\n\n*Running in Swarm mode — the coordinator is restricted to orchestration tools and must delegate all implementation work to specialist sub-agents.*')

    // tool_call_delta + tool_start arrive right after the mode_notice.
    stream.pushToolStart('agent-call', 'agent', { prompt: 'Do the work', description: 'Developer' })
    streamScheduler.flushNow()

    // specialist prose -> tool_output -> commit
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
    // The mode_notice text landed before the tool events, in wire order.
    expect(snap.segments?.some((s: any) => s.type === 'text' && /Running in Swarm mode/.test(s.content ?? ''))).toBe(true)
    expect(commitCount).toBeGreaterThan(0)
  })
})
