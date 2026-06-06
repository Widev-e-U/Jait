/**
 * Segment accumulation for the resume/subscribe chat stream consumer.
 *
 * The resume consumer in `useChat` rebuilds an assistant message's ordered
 * `segments` (interleaved text / thinking / tool groups) from a live SSE stream.
 * These helpers are the single source of truth for those mutations: text,
 * thinking, AND tool segments must all flow through the same accumulator,
 * otherwise a batched token flush can overwrite (and erase) a tool group that
 * was written from a separate source, which made tool cards disappear
 * mid-stream until a reload rebuilt the correct order from the DB.
 */

import type { MessageSegment } from '@/hooks/useChat'

/** Append a text chunk, extending a trailing text segment when present. */
export function withTextSegment(segs: MessageSegment[] | undefined, text: string): MessageSegment[] {
  const arr = segs ? [...segs] : []
  const last = arr[arr.length - 1]
  if (last?.type === 'text') {
    arr[arr.length - 1] = { type: 'text', content: last.content + text }
  } else {
    arr.push({ type: 'text', content: text })
  }
  return arr
}

/** Append a thinking chunk, extending a trailing thinking segment when present. */
export function withThinkingSegment(segs: MessageSegment[] | undefined, text: string): MessageSegment[] {
  const arr = segs ? [...segs] : []
  const last = arr[arr.length - 1]
  if (last?.type === 'thinking') {
    arr[arr.length - 1] = { type: 'thinking', content: last.content + text }
  } else {
    arr.push({ type: 'thinking', content: text })
  }
  return arr
}

/** Append a tool callId to the trailing tool group, or start a new group. */
export function withToolSegment(segs: MessageSegment[] | undefined, callId: string): MessageSegment[] {
  const arr = segs ? [...segs] : []
  const last = arr[arr.length - 1]
  if (last?.type === 'toolGroup') {
    if (!last.callIds.includes(callId)) {
      arr[arr.length - 1] = { type: 'toolGroup', callIds: [...last.callIds, callId] }
    }
  } else {
    arr.push({ type: 'toolGroup', callIds: [callId] })
  }
  return arr
}

/** Collect every tool callId already present in a segment list's tool groups. */
export function seedSeenToolCallIds(segs: MessageSegment[] | undefined): Set<string> {
  const seen = new Set<string>()
  for (const seg of segs ?? []) {
    if (seg.type === 'toolGroup') for (const id of seg.callIds) seen.add(id)
  }
  return seen
}

/** A single resume-stream event that affects an assistant message's segments. */
export type ResumeSegmentEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool'; callId: string }

/**
 * Fold a sequence of resume-stream events into ordered segments, mirroring the
 * resume consumer's logic exactly: one authoritative segment list, a `seen` set
 * to avoid re-opening a tool group for a re-emitted callId. Exposed so the
 * interleaving behaviour is unit-testable without a DOM/stream harness.
 */
export function accumulateResumeSegments(
  events: ResumeSegmentEvent[],
  initialSegments?: MessageSegment[],
): { segments: MessageSegment[]; seen: Set<string> } {
  let segments: MessageSegment[] = initialSegments ? [...initialSegments] : []
  const seen = seedSeenToolCallIds(initialSegments)
  for (const event of events) {
    if (event.type === 'text') {
      segments = withTextSegment(segments, event.content)
    } else if (event.type === 'thinking') {
      segments = withThinkingSegment(segments, event.content)
    } else {
      if (seen.has(event.callId)) continue
      seen.add(event.callId)
      segments = withToolSegment(segments, event.callId)
    }
  }
  return { segments, seen }
}
