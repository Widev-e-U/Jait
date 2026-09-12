import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createMessageStream } from '@/lib/message-stream'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'

/**
 * Regression test for the swarm-mode live-streaming stall in `useChat`'s event
 * handling.
 *
 * WHAT IS UNDER TEST
 * ------------------
 * The subscription event handler processes this swarm event sequence:
 *   `mode_notice` (long text) -> `tool_call_delta`/`tool_start` (agent.spawn)
 *   -> `tool_output` (specialist live prose, channel text) -> `tool_result`.
 *
 * The coordinator's FIRST content is a TOOL event, not text. Pre-fix the
 * handler awaited a text "pacer" (`await textPacer.waitUntilIdle()`) before each
 * tool event. Because the (long) `mode_notice` text was queued in that pacer and
 * only drained on a rAF/deadline tick, the await BLOCKED event delivery — so the
 * agent tool card + specialist prose were NOT committed until the text finished
 * animating.
 *
 * The fix removes the pacer: text is pushed straight into the message stream in
 * wire order (see `useChat.ts` `handleEvent`), so tool content is committed in
 * the same pass without waiting on rAF/deadline timers. This test drives the
 * SMALLEST REAL unit that contains the event-handling logic — the actual
 * `message-stream` and `stream-render-scheduler` modules wired in the exact
 * order `useChat.ts` wires them — behind a real `ReadableStream` reader loop.
 * The only thing parameterized is the tool-event gate, so both the pre-fix
 * (blocking) and fixed (direct) paths are exercised against the real libs.
 *
 * A second suite reads the REAL `useChat.ts` source and asserts the `handleEvent`
 * tool-event handlers ingest text directly and contain no pacer/waitUntilIdle
 * gate, so this file genuinely fails if `useChat.ts` regresses even though the
 * full hook cannot be mounted here.
 */

/** Frozen clock: rAF/deadline callbacks are captured but NEVER fired. */
function makeClock() {
  let frame: (() => void) | null = null
  let deadline: (() => void) | null = null
  const requestFrame = vi.fn((cb: () => void) => { frame = cb; return 7 })
  const cancelFrame = vi.fn(() => { frame = null })
  const setDeadline = vi.fn((cb: () => void) => { deadline = cb; return 9 })
  const clearDeadline = vi.fn(() => { deadline = null })
  return { requestFrame, cancelFrame, setDeadline, clearDeadline }
}

type Gate = 'flushNow' | 'waitUntilIdle'

interface LoopInternals {
  stream: ReturnType<typeof createMessageStream>
  scheduler: ReturnType<typeof createStreamRenderScheduler>
  /** Releases a tool event blocked by the pre-fix ('waitUntilIdle') gate. */
  releaseGate: () => void
  commits: any[]
  done: Promise<void>
}

/**
 * Faithful reproduction of the event-handling loop in `useChat.ts` (the
 * `handleEvent` function that processes subscription events).
 *
 * Only the tool-event gating differs between pre-fix and fixed:
 *   - 'flushNow'       (FIXED)  : nothing to drain — text is already ingested
 *                                 directly, so tool events commit immediately.
 *   - 'waitUntilIdle'  (PRE-FIX): the reader waited for a still-animating text
 *                                 pacer before processing each tool event. Here
 *                                 that is modeled as a promise that never
 *                                 resolves until `releaseGate()` is called.
 */
async function runDirectPostLoop(body: string, gate: Gate): Promise<LoopInternals> {
  const stream = createMessageStream()
  const clock = makeClock()
  const commits: any[] = []

  const scheduler = createStreamRenderScheduler({
    onFlush: () => { commits.push(stream.snapshot()) },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    setDeadline: clock.setDeadline,
    clearDeadline: clock.clearDeadline,
    deadlineMs: 300,
  })
  const flushBufferImmediately = scheduler.flushNow

  // useChat wires every stream mutation to schedule a coalesced commit.
  stream.markDirty(scheduler.schedule)

  const updateMessage = (options?: { immediate?: boolean }) => {
    if (options?.immediate) {
      flushBufferImmediately()
      return
    }
    scheduler.schedule()
  }

  let releaseGate: () => void = () => {}
  const blocked = new Promise<void>((resolve) => { releaseGate = resolve })

  // THE GATING BRANCH — the exact pre-fix vs fixed difference.
  const gateToolEvent = (): Promise<void> => {
    if (gate === 'flushNow') {
      return Promise.resolve()
    }
    // Pre-fix: the handler awaited the text pacer draining its animation queue
    // (which only advances on a rAF/deadline tick). With the frozen clock that
    // never happens, so the reader loop stalls here — exactly the historical
    // regression. `releaseGate()` lets the loop unwind during cleanup.
    return blocked
  }

  const done = (async () => {
    const response = new Response(body)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let lineBuffer = ''

    while (true) {
      const { done: readDone, value } = await reader.read()
      if (readDone) break

      lineBuffer += decoder.decode(value, { stream: true })
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = JSON.parse(line.slice(6))

        if (data.type === 'mode_notice') {
          // useChat: text is ingested directly, in wire order.
          stream.pushText(`\n\n*${data.message as string}*`)
          updateMessage()
        } else if (data.type === 'tool_call_delta') {
          await gateToolEvent()
          stream.pushToolCallDelta(
            data.call_id as string,
            (data.name_delta as string) || '',
            (data.args_delta as string) || '',
            data.parent_call_id as string | undefined,
          )
          updateMessage({ immediate: true })
        } else if (data.type === 'tool_start') {
          await gateToolEvent()
          stream.pushToolStart(
            data.call_id as string,
            data.tool as string,
            (data.args as Record<string, unknown>) ?? {},
            data.parent_call_id as string | undefined,
          )
          updateMessage({ immediate: true })
        } else if (data.type === 'tool_output') {
          await gateToolEvent()
          stream.pushToolOutput(
            data.call_id as string,
            data.content as string,
            data.channel as 'text' | 'thinking' | undefined,
          )
          updateMessage()
        } else if (data.type === 'tool_result') {
          await gateToolEvent()
          stream.pushToolResult(
            data.call_id as string,
            data.ok as boolean,
            data.message as string,
            data.data as unknown,
            data.parent_call_id as string | undefined,
          )
          updateMessage({ immediate: true })
        }
      }
    }

    // drain any still-scheduled (non-immediate) commit after the stream ends
    flushBufferImmediately()
  })()

  return { stream, scheduler, releaseGate, commits, done }
}

/**
 * Read the REAL `useChat.ts` and detect which tool-event gating the `handleEvent`
 * function currently uses. This lets the reader loop be driven with the gate the
 * actual production code uses, so the test genuinely captures a regression even
 * though the full React hook cannot be mounted here.
 */
function detectDirectPostGate(): Gate {
  const src = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')
  const start = src.indexOf('const handleEvent = (data: Record<string, unknown>) => {')
  const end = src.indexOf("data.type === 'done'", start)
  const block = src.slice(start, end)
  // A blocking text drain (`waitUntilIdle()` / a text pacer) before tool events
  // is the regression. Production ingests text directly, so this is 'flushNow'.
  return /waitUntilIdle|textPacer/.test(block) ? 'waitUntilIdle' : 'flushNow'
}

function sseLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

function buildSwarmBody(): string {
  const longModeNotice =
    'Running in Swarm mode' +
    ' ' +
    Array.from({ length: 60 }, (_, i) => `coordinator-word-${i}`).join(' ')
  return [
    sseLine({ type: 'mode_notice', message: longModeNotice }),
    sseLine({
      type: 'tool_call_delta',
      call_id: 'agent-call',
      name_delta: 'agent',
      args_delta: '{"prompt":"do the work","description":"Developer"}',
    }),
    sseLine({
      type: 'tool_start',
      call_id: 'agent-call',
      tool: 'agent',
      args: { prompt: 'do the work', description: 'Developer' },
    }),
    sseLine({
      type: 'tool_output',
      call_id: 'agent-call',
      content: 'specialist live prose',
      channel: 'text',
    }),
    sseLine({ type: 'tool_result', call_id: 'agent-call', ok: true, message: 'done', data: null }),
  ].join('')
}

const flushMicrotasks = async (n = 30) => {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

describe('swarm: tool content is committed synchronously (no text animation drain required)', () => {
  it('FIXED (direct ingestion): agent tool card + specialist prose render immediately, without pumping rAF/deadline timers', async () => {
    const { stream, done } = await runDirectPostLoop(buildSwarmBody(), 'flushNow')

    await done
    const snap = stream.snapshot() as any

    // mode_notice text landed ahead of the tool events, in wire order.
    expect(
      snap.segments?.some((s: any) => s.type === 'text' && /Running in Swarm mode/.test(s.content ?? '')),
    ).toBe(true)

    // The agent tool card exists.
    const tc = snap.toolCalls?.find((t: any) => t.callId === 'agent-call')
    expect(tc).toBeTruthy()
    expect(tc.tool).toBe('agent')

    // Specialist live prose (channel=text) is attached to the tool card.
    expect(
      tc.childSegments?.some((s: any) => s.type === 'text' && s.content === 'specialist live prose'),
    ).toBe(true)
  })

  it('PRE-FIX (await text drain): the reader loop BLOCKS behind the animating mode_notice, so the tool card is NOT committed', async () => {
    const { stream, releaseGate, done } = await runDirectPostLoop(buildSwarmBody(), 'waitUntilIdle')

    // Give the reader loop microtasks to consume the SSE and reach the first
    // tool event, where it blocks on the text-drain gate (never resolves because
    // the text pacer's rAF/deadline never fire and releaseGate is not called).
    await flushMicrotasks(30)

    const snap = stream.snapshot() as any

    // The mode_notice text is ingested immediately (direct push), so it is
    // present even in the pre-fix loop...
    expect(snap.segments?.some((s: any) => s.type === 'text')).toBe(true)

    // ...but the tool event was never processed, so no tool card.
    // THE REGRESSION.
    expect(snap.toolCalls?.length ?? 0).toBe(0)
    expect(snap.toolCalls?.some((t: any) => t.callId === 'agent-call')).toBe(false)

    // Clean up: releasing the gate lets the stalled loop unwind.
    releaseGate()
    await done
  })

  it('proves the gating branch is the discriminator: direct ingestion commits, blocking does not', async () => {
    const fixed = await runDirectPostLoop(buildSwarmBody(), 'flushNow')
    await fixed.done
    const fixedSnap = fixed.stream.snapshot() as any
    expect(fixedSnap.toolCalls?.some((t: any) => t.callId === 'agent-call')).toBe(true)

    const broken = await runDirectPostLoop(buildSwarmBody(), 'waitUntilIdle')
    await flushMicrotasks(30)
    const brokenSnap = broken.stream.snapshot() as any
    expect(brokenSnap.toolCalls?.length ?? 0).toBe(0)
    broken.releaseGate()
    await broken.done
  })

  it('GENUINE: drives the real-lib reader loop with the gate the REAL useChat.ts currently uses (tool content must commit)', async () => {
    // Determine the gate from the actual production source, then run the real
    // reader loop with it. If useChat.ts regresses to a blocking text drain,
    // the loop stalls and the tool content never commits -> this fails.
    const gate = detectDirectPostGate()
    const { stream, done } = await runDirectPostLoop(buildSwarmBody(), gate)

    const committed = await Promise.race([
      (async () => { await done; return true })(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ])

    const snap = stream.snapshot() as any
    const toolCard = snap.toolCalls?.some((t: any) => t.callId === 'agent-call')

    expect(committed, 'event handling stalled behind a text drain — tool content never committed (swarm live-stream regression)')
      .toBe(true)
    expect(toolCard).toBe(true)
    // specialist prose must be attached to the tool card as well
    const tc = snap.toolCalls?.find((t: any) => t.callId === 'agent-call')
    expect(tc?.childSegments?.some((s: any) => s.type === 'text' && s.content === 'specialist live prose')).toBe(true)
  })
})

describe('swarm: the REAL useChat.ts must not wait for text animation (source guard)', () => {
  it('the handleEvent tool-event handlers in useChat.ts ingest text directly and gate no tool event behind a text drain', () => {
    const src = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')

    // Extract the `handleEvent` function, the single place that processes
    // subscription events (token / mode_notice / tool_* / approval_required).
    const start = src.indexOf('const handleEvent = (data: Record<string, unknown>) => {')
    // Slice up to the `done` terminal handler so the only gate usages captured
    // are the tool-event handlers (the legit terminal handling in `done` comes
    // AFTER this marker).
    const endMarker = src.indexOf("data.type === 'done'", start)
    expect(start, 'handleEvent not found in useChat.ts').toBeGreaterThan(-1)
    expect(endMarker, 'handleEvent done terminal not found in useChat.ts').toBeGreaterThan(start)

    const block = src.slice(start, endMarker)

    // Production ingests stream text straight into the message stream.
    expect(block).toMatch(/stream\.pushText\(|stream\.pushThinking\(/)

    // Neither the historical synchronous-drain pacer nor its blocking
    // `waitUntilIdle()` gate may appear in the tool-event window — reintroducing
    // either re-creates the stall (e.g. the approver/tool card appearing only
    // after a long mode-notice finishes animating).
    expect(block).not.toContain('textPacer')
    expect(block).not.toContain('waitUntilIdle')
  })
})
