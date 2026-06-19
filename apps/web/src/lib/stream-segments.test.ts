import { describe, expect, it } from 'vitest'
import type { MessageSegment } from '@/hooks/useChat'
import {
  accumulateResumeSegments,
  normalizeMessageSegments,
  seedSeenToolCallIds,
  withTextSegment,
  withToolSegment,
  type ResumeSegmentEvent,
} from '@/lib/stream-segments'

describe('withTextSegment', () => {
  it('extends a trailing text segment instead of appending a new one', () => {
    expect(withTextSegment([{ type: 'text', content: 'Hel' }], 'lo')).toEqual([
      { type: 'text', content: 'Hello' },
    ])
  })

  it('starts a new text segment after a tool group', () => {
    expect(withTextSegment([{ type: 'toolGroup', callIds: ['a'] }], 'hi')).toEqual([
      { type: 'toolGroup', callIds: ['a'] },
      { type: 'text', content: 'hi' },
    ])
  })
})

describe('seedSeenToolCallIds', () => {
  it('collects every callId across tool groups', () => {
    const segs: MessageSegment[] = [
      { type: 'toolGroup', callIds: ['a', 'b'] },
      { type: 'text', content: 'x' },
      { type: 'toolGroup', callIds: ['c'] },
    ]
    expect([...seedSeenToolCallIds(segs)].sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('accumulateResumeSegments - interleaving (problem 2 regression)', () => {
  it('keeps a tool group when a text token arrives after it', () => {
    // This is the exact sequence that used to drop the tool card: text, then a
    // tool call, then more text. The tool group must survive.
    const events: ResumeSegmentEvent[] = [
      { type: 'text', content: 'Let me edit' },
      { type: 'tool', callId: 'edit-1' },
      { type: 'text', content: ' the file.' },
    ]
    const { segments } = accumulateResumeSegments(events)
    expect(segments).toEqual([
      { type: 'text', content: 'Let me edit' },
      { type: 'toolGroup', callIds: ['edit-1'] },
      { type: 'text', content: ' the file.' },
    ])
  })

  it('groups consecutive tool calls and splits groups around text', () => {
    const events: ResumeSegmentEvent[] = [
      { type: 'tool', callId: 'a' },
      { type: 'tool', callId: 'b' },
      { type: 'text', content: 'done' },
      { type: 'tool', callId: 'c' },
    ]
    const { segments } = accumulateResumeSegments(events)
    expect(segments).toEqual([
      { type: 'toolGroup', callIds: ['a', 'b'] },
      { type: 'text', content: 'done' },
      { type: 'toolGroup', callIds: ['c'] },
    ])
  })

  it('does not re-open a group for a re-emitted callId (enriched tool.start)', () => {
    // ACP agents re-emit tool.start for the same callId; a later re-emit (after
    // text) must NOT create a second group for it.
    const events: ResumeSegmentEvent[] = [
      { type: 'tool', callId: 'edit-1' },
      { type: 'text', content: 'thinking...' },
      { type: 'tool', callId: 'edit-1' },
    ]
    const { segments } = accumulateResumeSegments(events)
    expect(segments).toEqual([
      { type: 'toolGroup', callIds: ['edit-1'] },
      { type: 'text', content: 'thinking...' },
    ])
  })

  it('does not re-append tool calls already present in the snapshot', () => {
    const initial: MessageSegment[] = [
      { type: 'text', content: 'before' },
      { type: 'toolGroup', callIds: ['old-1'] },
    ]
    const events: ResumeSegmentEvent[] = [
      { type: 'tool', callId: 'old-1' }, // already in snapshot, ignore
      { type: 'text', content: 'after' },
    ]
    const { segments } = accumulateResumeSegments(events, initial)
    expect(segments).toEqual([
      { type: 'text', content: 'before' },
      { type: 'toolGroup', callIds: ['old-1'] },
      { type: 'text', content: 'after' },
    ])
  })
})

describe('the old two-source approach (documents the fixed bug)', () => {
  // Faithful model of the previous resume-consumer logic: text tokens were
  // tracked in `accumulated` and flushed by replacing the message segments,
  // while tool segments were written onto the message only. A token after a
  // tool call therefore overwrote (erased) the tool group.
  function accumulateBuggy(events: ResumeSegmentEvent[]): MessageSegment[] {
    let accumulated: MessageSegment[] | undefined
    let message: MessageSegment[] | undefined
    for (const event of events) {
      if (event.type === 'text') {
        accumulated = withTextSegment(accumulated, event.content)
        message = [...accumulated] // token flush replaces message segments
      } else if (event.type === 'tool') {
        message = withToolSegment(message, event.callId) // written to message only
      }
    }
    return message ?? []
  }

  it('loses the tool group when text follows a tool call (the reported bug)', () => {
    const events: ResumeSegmentEvent[] = [
      { type: 'text', content: 'Let me edit' },
      { type: 'tool', callId: 'edit-1' },
      { type: 'text', content: ' the file.' },
    ]
    const buggy = accumulateBuggy(events)
    expect(buggy.some((s) => s.type === 'toolGroup')).toBe(false)
    // The fixed accumulator keeps it.
    expect(accumulateResumeSegments(events).segments.some((s) => s.type === 'toolGroup')).toBe(true)
  })
})

describe('normalizeMessageSegments (crash regression: "X.filter is not a function")', () => {
  it('returns an empty array for non-array payloads', () => {
    expect(normalizeMessageSegments(null)).toEqual([])
    expect(normalizeMessageSegments(undefined)).toEqual([])
    expect(normalizeMessageSegments({ type: 'toolGroup', callIds: ['a'] } as unknown)).toEqual([])
    expect(normalizeMessageSegments('not-an-array' as unknown)).toEqual([])
  })

  it('coerces a malformed toolGroup with non-array callIds into a safe group', () => {
    // A persisted/legacy toolGroup missing callIds (or with a non-array value)
    // used to crash the renderer at `seg.callIds.includes(...)`.
    const raw = [
      { type: 'toolGroup' }, // missing callIds
      { type: 'toolGroup', callIds: 'a,b' }, // non-array callIds
      { type: 'toolGroup', callIds: ['a', 1, '', 'b'] }, // mixed/non-string ids
    ] as unknown
    expect(normalizeMessageSegments(raw)).toEqual([
      { type: 'toolGroup', callIds: ['a', 'b'] },
    ])
  })

  it('drops unknown segment types and coerces non-string content', () => {
    const raw = [
      { type: 'mystery', payload: 123 },
      { type: 'text', content: { not: 'a string' } },
      { type: 'thinking', content: 'hi' },
    ] as unknown
    expect(normalizeMessageSegments(raw)).toEqual([
      { type: 'text', content: '[object Object]' },
      { type: 'thinking', content: 'hi' },
    ])
  })

  it('passes well-formed segments through unchanged', () => {
    const raw: MessageSegment[] = [
      { type: 'text', content: 'hello' },
      { type: 'toolGroup', callIds: ['a', 'b'] },
      { type: 'error', content: 'boom' },
    ]
    expect(normalizeMessageSegments(raw)).toEqual(raw)
  })
})
