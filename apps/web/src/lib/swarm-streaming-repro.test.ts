import { describe, expect, it } from 'vitest'
import { createMessageStream, snapshotToChatMessageUpdates } from '@/lib/message-stream'

/**
 * Swarm-mode live-streaming contract.
 *
 * The gateway emits the specialist's work as this exact event sequence (see
 * `chat-swarm-live-prose.test.ts`): a `mode_notice` (the "swarm indication"),
 * a `tool_start` for the delegated `agent.spawn` call, then the specialist's
 * prose streamed LIVE as `tool_output` events with `channel: 'text'` — all
 * BEFORE the specialist's `tool_result`.
 *
 * This test proves that the imperative writer + snapshot -> ChatMessage
 * pipeline carries that live `tool_output` prose into the agent card's
 * `childSegments`, i.e. that the rendered UI has the data it needs to show the
 * specialist's content without a reload. It mirrors the shape the gateway
 * actually emits so that a regression in the writer (dropping the content,
 * or only surfacing it once the `tool_result` arrives) is caught here.
 */
describe('swarm mode live streaming (frontend writer)', () => {
  it('streams specialist tool_output prose into the agent card childSegments live, before the tool_result', () => {
    const stream = createMessageStream()

    // 1. Coordinator announces swarm mode -> assistant text ("swarm indication")
    stream.pushText('Running in Swarm mode — coordinator delegates to specialists.')

    // 2. Coordinator delegates via agent.spawn -> opens the agent card
    stream.pushToolStart('call-1', 'agent.spawn', { prompt: 'investigate the bug' })

    // 3. Specialist streams its prose live (channel=text) -> must land in
    //    the agent card's childSegments immediately (NOT only after result).
    stream.pushToolOutput('call-1', 'specialist live prose', 'text')
    stream.pushToolOutput('call-1', ' more content', 'text')

    const snapshot = stream.snapshot()
    const updates = snapshotToChatMessageUpdates(snapshot)

    const agentCard = updates.toolCalls!.find((tc) => tc.callId === 'call-1')
    expect(agentCard).toBeDefined()

    // ── REGRESSION ────────────────────────────────────────────────────
    // The specialist's prose must already be present in the agent card's
    // childSegments while the run is still streaming — this is exactly what a
    // live render consumes. If childSegments were empty until the final
    // `tool_result`, the UI would only show the swarm indication and the
    // content would only surface on reload.
    const proseSegments = (agentCard?.childSegments ?? []).filter(
      (s) => s.type === 'text',
    )
    const streamedProse = proseSegments.map((s) => s.content).join('')
    expect(streamedProse).toContain('specialist live prose')

    // The tool call is still in-flight (no result yet), so the UI can attach
    // the live segments to the agent card while it streams.
    expect(agentCard!.status).toBe('running')

    // 4. After the specialist finishes, the result arrives.
    stream.pushToolResult('call-1', true, 'specialist live prose more content', {})
    const done = stream.snapshot()
    expect(
      done.toolCalls.find((tc) => tc.callId === 'call-1')?.childSegments,
    ).toBeTruthy()
  })
})
