/**
 * Imperative message stream writer.
 *
 * This module exposes a single, central place to stream every component of an
 * assistant answer into an ordered `MessageSegment[]` list: text tokens, thinking
 * blocks, tool-call groups, tool outputs, tool results, and any segment kinds we
 * add in the future.
 *
 * Why imperative? Both the direct `/api/chat` consumer and the resume SSE
 * consumer in `useChat` need to accumulate high-frequency, interleaved stream
 * events (token, thinking, tool_call_delta, tool_start, tool_output, tool_result,
 * ...) into the same message shape. Doing this with raw React setState produced
 * duplicated accumulation logic and brittle ordering bugs (e.g. a batched token
 * flush overwriting a tool group that was written from a separate code path).
 * A `MessageStreamWriter` owns the accumulation, de-duplication, and buffering
 * concerns; callers just push events and pull `snapshot()` for React.
 *
 * The writer is intentionally framework-agnostic about scheduling: it exposes
 * `markDirty(onFlush)` so a React hook can wire the flush to rAF/setInterval.
 * Keeping scheduling outside the writer keeps it testable and avoids coupling to
 * a specific rendering strategy.
 */

import { withTextSegment, withThinkingSegment, withToolSegment, seedSeenToolCallIds, normalizeMessageSegments, type ResumeSegmentEvent } from '@/lib/stream-segments'
import type { MessageSegment, ChatMessage } from '@/hooks/useChat'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'

export type { MessageSegment }

/** Snapshot of the streamed message at a point in time. */
export interface MessageStreamSnapshot {
  content: string
  thinking: string
  thinkingDuration: number | undefined
  toolCalls: ToolCallInfo[]
  segments: MessageSegment[]
}

/** Tool-related event pushed into the stream. */
export type ToolStreamEvent =
  | {
      type: 'tool_call_delta'
      callId: string
      parentCallId?: string
      nameDelta: string
      argsDelta: string
    }
  | {
      type: 'tool_start'
      callId: string
      parentCallId?: string
      tool: string
      args: Record<string, unknown>
    }
  | {
      type: 'approval_required'
      requestId: string
      callId: string
      tool: string
      args: Record<string, unknown>
    }
  | {
      type: 'tool_output'
      callId: string
      content: string
    }
  | {
      type: 'tool_result'
      callId: string
      parentCallId?: string
      ok: boolean
      message: string
      data: unknown
    }

/** Event accepted by MessageStreamWriter.push(). */
export type MessageStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'steering'; content: string; displayContent?: string }
  | ToolStreamEvent

export interface MessageStreamWriter {
  /** Push a raw stream event. */
  push(event: MessageStreamEvent): void
  /** Convenience: append a text token. */
  pushText(text: string): void
  /** Convenience: append a thinking chunk. */
  pushThinking(text: string): void
  /** Convenience: insert a steered-message marker anchored at the current point in the stream. */
  pushSteering(content: string, displayContent?: string): void
  /** Convenience: push a tool_call_delta. */
  pushToolCallDelta(callId: string, nameDelta: string, argsDelta: string, parentCallId?: string): void
  /** Convenience: push a tool_start. */
  pushToolStart(callId: string, tool: string, args: Record<string, unknown>, parentCallId?: string): void
  /** Convenience: push an approval_required event. */
  pushApprovalRequired(requestId: string, callId: string, tool: string, args: Record<string, unknown>): void
  /** Convenience: append streaming tool output. */
  pushToolOutput(callId: string, content: string): void
  /** Convenience: finalize a tool with a result. */
  pushToolResult(callId: string, ok: boolean, message: string, data: unknown, parentCallId?: string): void
  /**
   * Register a callback to be invoked whenever the stream mutates. The caller is
   * responsible for scheduling the flush (rAF, interval, etc). `markDirty` is
   * deduplicated: multiple mutations between flushes only enqueue one call.
   */
  markDirty(onFlush: () => void): void
  /** Build the current snapshot without clearing pending state. */
  snapshot(): MessageStreamSnapshot
  /** Replace the entire state with a hydrated snapshot (e.g. resume stream snapshot). */
  hydrate(snapshot: Partial<MessageStreamSnapshot>): void
  /** Reset all accumulated state. */
  reset(): void
  /** Finish streaming: mark any still-running tool calls as cancelled and return final snapshot. */
  finish(): MessageStreamSnapshot
  /** True if any tool call is still running or pending. */
  hasActiveToolCalls(): boolean
}

/**
 * Re-insert any steering-marker segments from `previous` into `incoming` at
 * the same position relative to non-steering content, so a hydrate from a
 * fresh (marker-less) snapshot doesn't wipe markers recorded since the last
 * hydrate. Anchor position is the count of non-steering segments that
 * preceded the marker; inserting from the last marker backwards keeps
 * earlier anchors valid and preserves relative order among markers that
 * share the same anchor.
 */
function reanchorSteeringSegments(previous: MessageSegment[], incoming: MessageSegment[]): MessageSegment[] {
  const markers: Array<{ anchor: number; segment: Extract<MessageSegment, { type: 'steering' }> }> = []
  const incomingMarkerCounts = new Map<string, number>()
  for (const segment of incoming) {
    if (segment.type !== 'steering') continue
    const key = segment.content
    incomingMarkerCounts.set(key, (incomingMarkerCounts.get(key) ?? 0) + 1)
  }
  let nonSteeringCount = 0
  for (const seg of previous) {
    if (seg.type === 'steering') {
      const key = seg.content
      const incomingCount = incomingMarkerCounts.get(key) ?? 0
      if (incomingCount > 0) incomingMarkerCounts.set(key, incomingCount - 1)
      else markers.push({ anchor: nonSteeringCount, segment: seg })
    } else nonSteeringCount++
  }
  if (markers.length === 0) return incoming
  const merged = [...incoming]
  for (let i = markers.length - 1; i >= 0; i--) {
    const { anchor, segment } = markers[i]!
    merged.splice(Math.min(anchor, merged.length), 0, segment)
  }
  return merged
}

/**
 * Create a writer that accumulates every component of an assistant answer.
 */
export function createMessageStream(initial?: Partial<MessageStreamSnapshot>): MessageStreamWriter {
  let content = initial?.content ?? ''
  let thinking = initial?.thinking ?? ''
  let thinkingDuration = initial?.thinkingDuration ?? undefined
  let toolCalls: ToolCallInfo[] = initial?.toolCalls ? [...initial.toolCalls] : []
  let segments: MessageSegment[] = initial?.segments ? [...initial.segments] : []
  let dirty = false
  let onDirty: (() => void) | null = null

  // Track when thinking started so we can compute duration when the first text
  // token arrives.
  let thinkingStart: number | null = null

  // De-dupe tool groups in the segment list.
  const seenToolCallIds = seedSeenToolCallIds(segments)

  const appendTextSegment = (text: string) => {
    segments = withTextSegment(segments, text)
  }

  const appendThinkingSegment = (text: string) => {
    segments = withThinkingSegment(segments, text)
  }

  const appendToolSegment = (callId: string) => {
    if (seenToolCallIds.has(callId)) return
    seenToolCallIds.add(callId)
    segments = withToolSegment(segments, callId)
  }

  const mark = () => {
    if (!dirty) {
      dirty = true
      onDirty?.()
    }
  }

  const ensureThinkingStarted = () => {
    if (!thinkingStart) thinkingStart = Date.now()
  }

  const computeThinkingDuration = () => {
    if (thinkingStart && !thinkingDuration) {
      thinkingDuration = Math.round((Date.now() - thinkingStart) / 1000)
    }
  }

  const findToolCallIndex = (callId: string): number => toolCalls.findIndex(tc => tc.callId === callId)

  const pushEvent = (event: MessageStreamEvent) => {
    switch (event.type) {
      case 'text': {
        computeThinkingDuration()
        content += event.content
        appendTextSegment(event.content)
        mark()
        return
      }
      case 'thinking': {
        ensureThinkingStarted()
        thinking += event.content
        appendThinkingSegment(event.content)
        mark()
        return
      }
      case 'steering': {
        segments = [...segments, { type: 'steering', content: event.content, displayContent: event.displayContent }]
        mark()
        return
      }
      case 'tool_call_delta': {
        const idx = findToolCallIndex(event.callId)
        appendToolSegment(event.callId)
        if (idx !== -1) {
          toolCalls = toolCalls.map((tc, i) =>
            i === idx
              ? { ...tc, tool: tc.tool + event.nameDelta, streamingArgs: (tc.streamingArgs ?? '') + event.argsDelta }
              : tc
          )
        } else {
          toolCalls = [
            ...toolCalls,
            {
              callId: event.callId,
              parentCallId: event.parentCallId,
              tool: event.nameDelta,
              args: {},
              status: 'pending',
              streamingArgs: event.argsDelta,
              startedAt: Date.now(),
            },
          ]
        }
        mark()
        return
      }
      case 'tool_start': {
        const idx = findToolCallIndex(event.callId)
        appendToolSegment(event.callId)
        if (idx !== -1) {
          toolCalls = toolCalls.map((tc, i) =>
            i === idx
              ? {
                  ...tc,
                  tool: event.tool,
                  args: event.args,
                  parentCallId: event.parentCallId ?? tc.parentCallId,
                  status: 'running',
                  streamingArgs: undefined,
                }
              : tc
          )
        } else {
          toolCalls = [
            ...toolCalls,
            {
              callId: event.callId,
              parentCallId: event.parentCallId,
              tool: event.tool,
              args: event.args,
              status: 'running',
              startedAt: Date.now(),
            },
          ]
        }
        mark()
        return
      }
      case 'approval_required': {
        if (findToolCallIndex(event.callId) !== -1) return
        appendToolSegment(event.callId)
        toolCalls = [
          ...toolCalls,
          {
            callId: event.callId,
            approvalRequestId: event.requestId,
            approvalState: 'pending',
            tool: event.tool,
            args: event.args,
            status: 'pending',
            startedAt: Date.now(),
          },
        ]
        mark()
        return
      }
      case 'tool_output': {
        const idx = findToolCallIndex(event.callId)
        if (idx !== -1) {
          toolCalls = toolCalls.map((tc, i) =>
            i === idx ? { ...tc, streamingOutput: (tc.streamingOutput ?? '') + event.content } : tc
          )
          mark()
        }
        return
      }
      case 'tool_result': {
        const idx = findToolCallIndex(event.callId)
        if (idx !== -1) {
          toolCalls = toolCalls.map((tc, i) =>
            i === idx
              ? {
                  ...tc,
                  parentCallId: tc.parentCallId ?? event.parentCallId,
                  status: event.ok ? 'success' : 'error',
                  result: { ok: event.ok, message: event.message, data: event.data },
                  completedAt: Date.now(),
                }
              : tc
          )
          mark()
        }
        return
      }
    }
  }

  return {
    push: pushEvent,
    pushText: (text: string) => pushEvent({ type: 'text', content: text }),
    pushThinking: (text: string) => pushEvent({ type: 'thinking', content: text }),
    pushSteering: (content: string, displayContent?: string) => pushEvent({ type: 'steering', content, displayContent }),
    pushToolCallDelta: (callId, nameDelta, argsDelta, parentCallId) =>
      pushEvent({ type: 'tool_call_delta', callId, nameDelta, argsDelta, parentCallId }),
    pushToolStart: (callId, tool, args, parentCallId) =>
      pushEvent({ type: 'tool_start', callId, tool, args, parentCallId }),
    pushApprovalRequired: (requestId, callId, tool, args) =>
      pushEvent({ type: 'approval_required', requestId, callId, tool, args }),
    pushToolOutput: (callId, content) => pushEvent({ type: 'tool_output', callId, content }),
    pushToolResult: (callId, ok, message, data, parentCallId) =>
      pushEvent({ type: 'tool_result', callId, ok, message, data, parentCallId }),

    markDirty: (callback) => {
      onDirty = callback
      // If mutations already happened before a scheduler attached, flush once
      // immediately and clear the dirty flag so the next push schedules a new
      // flush rather than re-firing the old pending notification.
      if (dirty) {
        dirty = false
        callback()
      }
    },

    snapshot: () => {
      // Consuming the snapshot drains the pending-dirty notification.
      dirty = false
      return {
        content,
        thinking,
        thinkingDuration,
        toolCalls: toolCalls,
        segments: segments,
      }
    },

    hydrate: (snapshot) => {
      if (snapshot.content !== undefined) content = snapshot.content
      if (snapshot.thinking !== undefined) thinking = snapshot.thinking
      if (snapshot.thinkingDuration !== undefined) thinkingDuration = snapshot.thinkingDuration
      if (snapshot.toolCalls !== undefined) {
        toolCalls = [...snapshot.toolCalls]
      }
      if (snapshot.segments !== undefined) {
        const incoming = normalizeMessageSegments(snapshot.segments)
        // Steering markers are inserted client-side only (the server never
        // echoes them back in a resume-stream snapshot), so a hydrate from a
        // fresh snapshot — which happens on every resume-stream reconnect,
        // including the routine handoff right after a direct POST stream
        // finishes — would otherwise silently drop any marker recorded since
        // the last hydrate. Re-anchor each one at the same content-relative
        // position it held before, rather than losing it.
        segments = reanchorSteeringSegments(segments, incoming)
        seenToolCallIds.clear()
        for (const id of seedSeenToolCallIds(segments)) seenToolCallIds.add(id)
      }
      mark()
    },

    reset: () => {
      content = ''
      thinking = ''
      thinkingDuration = undefined
      toolCalls = []
      segments = []
      thinkingStart = null
      seenToolCallIds.clear()
      dirty = false
    },

    finish: () => {
      if (toolCalls.some(tc => tc.status === 'running' || tc.status === 'pending')) {
        toolCalls = toolCalls.map(tc =>
          tc.status === 'running' || tc.status === 'pending'
            ? { ...tc, status: 'error' as const, result: { ok: false, message: 'Cancelled' }, completedAt: Date.now() }
            : tc
        )
        mark()
      }
      return {
        content,
        thinking,
        thinkingDuration,
        toolCalls,
        segments,
      }
    },

    hasActiveToolCalls: () => toolCalls.some(tc => tc.status === 'running' || tc.status === 'pending'),
  }
}

/**
 * Helper used by the resume SSE consumer: rebuild a snapshot from a list of
 * ordered resume events (text, thinking, tool callIds). This is the pure
 * accumulation path; for the full imperative stream use `createMessageStream`.
 */
export function resumeEventsToSnapshot(
  events: ResumeSegmentEvent[],
  initial?: Partial<MessageStreamSnapshot>
): MessageStreamSnapshot {
  const stream = createMessageStream(initial)
  for (const event of events) {
    if (event.type === 'text') stream.pushText(event.content)
    else if (event.type === 'thinking') stream.pushThinking(event.content)
    else stream.pushToolStart(event.callId, '', {}, undefined)
  }
  return stream.snapshot()
}

/**
 * Derive a `Partial<ChatMessage>` update from a stream snapshot. Useful when a
 * React consumer wants to apply the snapshot into its message list with a
 * single object spread.
 */
export function snapshotToChatMessageUpdates(snapshot: MessageStreamSnapshot): Partial<ChatMessage> {
  const updates: Partial<ChatMessage> = {}
  updates.content = snapshot.content
  if (snapshot.thinking) updates.thinking = snapshot.thinking
  if (snapshot.thinkingDuration !== undefined) updates.thinkingDuration = snapshot.thinkingDuration
  updates.toolCalls = snapshot.toolCalls
  updates.segments = snapshot.segments
  return updates
}
