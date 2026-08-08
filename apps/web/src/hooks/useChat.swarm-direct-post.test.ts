import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createMessageStream } from '@/lib/message-stream'
import { createStreamTextPacer } from '@/lib/stream-text-pacer'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'

/**
 * Regression test for the swarm-mode live-streaming stall in the direct-POST
 * SSE handler inside `useChat` (`sendMessage`).
 *
 * WHAT IS UNDER TEST
 * ------------------
 * The direct-POST reader loop processes this swarm event sequence:
 *   `mode_notice` (long text) -> `tool_call_delta`/`tool_start` (agent.spawn)
 *   -> `tool_output` (specialist live prose, channel text) -> `tool_result`.
 *
 * The coordinator's FIRST content is a TOOL event, not text. Pre-fix the loop
 * did `await textPacer.waitUntilIdle()` before each tool event. Because the
 * (long) `mode_notice` text is queued in the text pacer and only drains on a
 * rAF/deadline tick, that await BLOCKS the entire SSE reader loop — so the
 * agent tool card + specialist prose are NOT committed until the text pacer
 * drains. The fix uses `textPacer.flushNow()`, which drains pending text
 * synchronously, so the tool content is committed in the same pass without
 * blocking the loop on rAF/deadline timers.
 *
 * Because this repo's vitest environment is `node` (no jsdom / happy-dom /
 * @testing-library/react are installed), the full React `useChat` hook cannot
 * be mounted. Instead this test drives the SMALLEST REAL unit that contains
 * the `while (true)` SSE reader-loop logic: the actual `message-stream`,
 * `stream-text-pacer` and `stream-render-scheduler` modules wired in the exact
 * order `useChat.ts` wires them, running a real `ReadableStream` reader loop
 * that reproduces the direct-POST event handling (including the exact
 * `flushNow`/`waitUntilIdle` gating branch). The gating branch is the only
 * thing that differs between the pre-fix and fixed `useChat.ts`, and it is
 * parameterized here so both variants are exercised against the real libs.
 *
 * A second suite reads the REAL `useChat.ts` source and asserts the direct-POST
 * branch still uses `textPacer.flushNow()` for tool events (not the pre-fix
 * `await textPacer.waitUntilIdle()`), so this file genuinely fails if
 * `useChat.ts` regresses even though the full hook cannot be mounted here.
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
  textPacer: ReturnType<typeof createStreamTextPacer>
  commits: any[]
  done: Promise<void>
}

/**
 * Faithful reproduction of the direct-POST SSE reader loop in `useChat.ts`
 * (the `sendMessage` branch that does `fetch(`${API_URL}/api/chat`)`).
 *
 * Only the tool-event gating differs between pre-fix and fixed:
 *   - 'flushNow'       (FIXED) : `textPacer.flushNow()` — synchronous drain
 *   - 'waitUntilIdle'  (PRE-FIX): `await textPacer.waitUntilIdle()` — blocks
 *                                 while long mode_notice text is still queued.
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

  const textPacer = createStreamTextPacer({
    onText: (chunk) => stream.pushText(chunk),
    onThinking: (chunk) => stream.pushThinking(chunk),
    // useChat: textPacer.onCommit -> updateMessage({ immediate: true })
    onCommit: () => flushBufferImmediately(),
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    setDeadline: clock.setDeadline,
    clearDeadline: clock.clearDeadline,
    maxChunkChars: 24,
    deadlineMs: 300,
  })

  // useChat wires every stream mutation to schedule a commit.
  stream.markDirty(scheduler.schedule)

  const updateMessage = (options?: { immediate?: boolean }) => {
    if (options?.immediate) {
      flushBufferImmediately()
      return
    }
    scheduler.schedule()
  }

  // THE GATING BRANCH — the exact pre-fix vs fixed difference.
  const gateToolEvent = (): Promise<void> => {
    if (gate === 'flushNow') {
      textPacer.flushNow()
      return Promise.resolve()
    }
    return textPacer.waitUntilIdle()
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
          textPacer.enqueueText(`\n\n*${data.message as string}*`)
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

  return { stream, scheduler, textPacer, commits, done }
}

/**
 * Read the REAL `useChat.ts` and detect which tool-event gating the direct-POST
 * SSE branch currently uses. This lets the reader loop be driven with the gate
 * the actual production code uses, so the test genuinely captures a regression
 * even though the full React hook cannot be mounted here.
 */
function detectDirectPostGate(): Gate {
  const src = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')
  const start = src.indexOf('const response = await fetch(`${API_URL}/api/chat`')
  const end = src.indexOf("data.type === 'queued'", start)
  const block = src.slice(start, end)
  return block.includes('textPacer.flushNow()') ? 'flushNow' : 'waitUntilIdle'
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

describe('swarm direct-POST: tool content is committed synchronously (no text-pacer drain required)', () => {
  it('FIXED (flushNow): agent tool card + specialist prose render immediately, without pumping rAF/deadline timers', async () => {
    const { stream, done } = await runDirectPostLoop(buildSwarmBody(), 'flushNow')

    await done
    const snap = stream.snapshot() as any

    // mode_notice text drained synchronously ahead of the tool events.
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

  it('PRE-FIX (await waitUntilIdle): the reader loop BLOCKS behind the paced mode_notice, so the tool card is NOT committed', async () => {
    const { stream, textPacer } = await runDirectPostLoop(buildSwarmBody(), 'waitUntilIdle')

    // Give the reader loop microtasks to consume the SSE and reach the first
    // tool event, where it blocks on waitUntilIdle (never resolves because the
    // text pacer's rAF/deadline never fire and flushNow is never called).
    await flushMicrotasks(30)

    const snap = stream.snapshot() as any

    // The mode_notice is still queued in the pacer — never drained, so the
    // stream has no committed text yet.
    expect(snap.segments?.some((s: any) => s.type === 'text')).toBe(false)

    // THE REGRESSION: the tool event was never processed, so no tool card.
    expect(snap.toolCalls?.length ?? 0).toBe(0)
    expect(snap.toolCalls?.some((t: any) => t.callId === 'agent-call')).toBe(false)

    // Clean up: resolving the pacer lets the stalled loop unwind.
    textPacer.cancel()
  })

  it('proves the gating branch is the discriminator: flushNow commits, waitUntilIdle does not', async () => {
    const fixed = await runDirectPostLoop(buildSwarmBody(), 'flushNow')
    await fixed.done
    const fixedSnap = fixed.stream.snapshot() as any
    expect(fixedSnap.toolCalls?.some((t: any) => t.callId === 'agent-call')).toBe(true)

    const broken = await runDirectPostLoop(buildSwarmBody(), 'waitUntilIdle')
    await flushMicrotasks(30)
    const brokenSnap = broken.stream.snapshot() as any
    expect(brokenSnap.toolCalls?.length ?? 0).toBe(0)
    broken.textPacer.cancel()
  })

  it('GENUINE: drives the real-lib reader loop with the gate the REAL useChat.ts currently uses (tool content must commit)', async () => {
    // Determine the gate from the actual production source, then run the real
    // reader loop with it. If useChat.ts regresses to `await waitUntilIdle()`,
    // the loop stalls and the tool content never commits -> this fails.
    const gate = detectDirectPostGate()
    const { stream, done } = await runDirectPostLoop(buildSwarmBody(), gate)

    const committed = await Promise.race([
      (async () => { await done; return true })(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ])

    const snap = stream.snapshot() as any
    const toolCard = snap.toolCalls?.some((t: any) => t.callId === 'agent-call')

    expect(committed, 'direct-POST reader loop stalled behind textPacer.waitUntilIdle() — tool content never committed (swarm live-stream regression)')
      .toBe(true)
    expect(toolCard).toBe(true)
    // specialist prose must be attached to the tool card as well
    const tc = snap.toolCalls?.find((t: any) => t.callId === 'agent-call')
    expect(tc?.childSegments?.some((s: any) => s.type === 'text' && s.content === 'specialist live prose')).toBe(true)
  })
})

describe('swarm direct-POST: the REAL useChat.ts must gate tool events on flushNow (source guard)', () => {
  it('the direct-POST branch in useChat.ts does not gate tool events behind await textPacer.waitUntilIdle()', () => {
    const src = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')

    // Extract the direct-POST (non-resume) SSE branch that owns the stream.
    const start = src.indexOf('const response = await fetch(`${API_URL}/api/chat`')
    // Slice up to the `queued` terminal handler so the only `waitUntilIdle`
    // usages captured are the tool-event handlers (the legit terminal
    // `await waitUntilIdle()` in `done`/`queued` come AFTER this marker).
    const endMarker = src.indexOf("data.type === 'queued'", start)
    expect(start, 'direct-POST fetch branch not found in useChat.ts').toBeGreaterThan(-1)
    expect(endMarker, 'direct-POST queued terminal not found in useChat.ts').toBeGreaterThan(start)

    const block = src.slice(start, endMarker)

    // Fixed: tool events flush pending text synchronously.
    expect(block).toMatch(/textPacer\.flushNow\(\)/)

    // Pre-fix code awaited waitUntilIdle() directly before pushing tool events,
    // which is what blocked the reader loop. Within the tool-event window it
    // must NOT appear at all.
    expect(block).not.toContain('await textPacer.waitUntilIdle()')
  })
})

describe('swarm resume-stream: the REAL useChat.ts must gate tool events on flushNow (source guard)', () => {
  it('the resume-stream branch in useChat.ts does not gate tool events behind await textPacer.waitUntilIdle()', () => {
    const src = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')

    // Extract the resume-stream SSE branch (resumeSessionStream). The `snapshot`
    // handler is unique to this branch and marks its start.
    const start = src.indexOf("data.type === 'snapshot'")
    // Slice up to the `done` terminal handler so the only `waitUntilIdle`
    // usages captured are the tool-event handlers (the legit terminal
    // `await waitUntilIdle()` in `done` comes AFTER this marker).
    const endMarker = src.indexOf("data.type === 'done'", start)
    expect(start, 'resume-stream snapshot branch not found in useChat.ts').toBeGreaterThan(-1)
    expect(endMarker, 'resume-stream done terminal not found in useChat.ts').toBeGreaterThan(start)

    const block = src.slice(start, endMarker)

    // Fixed: tool events (incl. approval_required) flush pending text synchronously.
    expect(block).toMatch(/textPacer\.flushNow\(\)/)

    // Pre-fix code awaited waitUntilIdle() directly before pushing tool events,
    // which is what blocked the reader loop (e.g. the approver appearing while
    // long mode-notice text is still queued). Within the tool-event window it
    // must NOT appear at all.
    expect(block).not.toContain('await textPacer.waitUntilIdle()')
  })
})
