import { describe, expect, it } from 'vitest'

import { mergeAttachmentsIntoSegments } from '@/lib/message-segment-builders'

import {
  buildEditedUserMessageSegments,
  buildFallbackUserMessageSegments,
  normalizeUserMessageSegments,
  parseUserMessageClipboardPayload,
  parseUserMessageMarkdown,
  parseUserMessageSegments,
  serializeUserMessageSegmentsForClipboard,
  serializeUserMessageSegmentsToMarkdown,
  userMessageTextFromSegments,
  userReferencedChatsFromSegments,
  userReferencedFilesFromSegments,
  type UserMessageSegment,
} from '@/lib/user-message-segments'

describe('skill message segments', () => {
  it('preserves skill chips and contributes explicit slash invocation text', () => {
    const segments: UserMessageSegment[] = [
      { type: 'skill', id: 'debugging', name: 'Debugging' },
      { type: 'text', text: ' fix this' },
    ]

    expect(normalizeUserMessageSegments(segments)).toEqual(segments)
    expect(userMessageTextFromSegments(segments)).toBe('/debugging  fix this')
    expect(serializeUserMessageSegmentsToMarkdown(segments)).toBe('/debugging  fix this')
  })
})

describe('user message segment serialization', () => {
  it('round-trips custom markdown references with interleaved text', () => {
    const segments: UserMessageSegment[] = [
      { type: 'text', text: 'check ' },
      { type: 'file', path: 'apps/web/src/App.tsx', name: 'App.tsx' },
      { type: 'text', text: ' and ' },
      { type: 'file', path: 'README.md', name: 'README.md' },
      { type: 'text', text: ' please' },
    ]

    const markdown = serializeUserMessageSegmentsToMarkdown(segments)

    expect(markdown).toContain('@apps/web/src/App.tsx')
    expect(parseUserMessageMarkdown(markdown)).toEqual(segments)
  })

  it('round-trips clipboard payload for structured paste', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'packages/gateway/src/routes/chat.ts', name: 'chat.ts' },
      { type: 'text', text: ' summarize this' },
    ]

    const payload = serializeUserMessageSegmentsForClipboard(segments)

    expect(payload).not.toBeNull()
    expect(parseUserMessageClipboardPayload(payload!)).toEqual(segments)
  })

  it('ignores non-jait markdown links', () => {
    expect(parseUserMessageMarkdown('[docs](https://example.com)')).toEqual([])
  })

  it('does not treat email addresses as file references', () => {
    expect(parseUserMessageMarkdown('email me at user@example.com')).toEqual([])
  })

  it('keeps referenced files when editing existing user text', () => {
    const previous: UserMessageSegment[] = [
      { type: 'text', text: 'check ' },
      { type: 'file', path: 'apps/web/src/App.tsx', name: 'App.tsx' },
      { type: 'text', text: ' now' },
    ]

    expect(buildEditedUserMessageSegments('please review this instead', previous)).toEqual([
      { type: 'text', text: 'please review this instead' },
      { type: 'file', path: 'apps/web/src/App.tsx', name: 'App.tsx' },
    ])
  })

  it('round-trips non-image uploaded attachments through display segments', () => {
    const segments: UserMessageSegment[] = [
      { type: 'text', text: 'review this ' },
      { type: 'attachment', name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' },
    ]

    const payload = serializeUserMessageSegmentsForClipboard(segments)

    expect(serializeUserMessageSegmentsToMarkdown(segments)).toContain('[attachment:notes.txt]')
    expect(parseUserMessageClipboardPayload(payload!)).toEqual(segments)
  })

  it('merges non-image uploads into display segments', () => {
    expect(mergeAttachmentsIntoSegments(undefined, [
      { name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' },
    ])).toEqual([
      { type: 'attachment', name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' },
    ])
  })

  it('round-trips chat references through clipboard and markdown', () => {
    const segments: UserMessageSegment[] = [
      { type: 'chat', sessionId: 'sess-abc', name: 'Gateway refactor' },
      { type: 'text', text: ' summarize this chat' },
    ]

    const payload = serializeUserMessageSegmentsForClipboard(segments)
    expect(payload).not.toBeNull()
    expect(parseUserMessageClipboardPayload(payload!)).toEqual(segments)

    const markdown = serializeUserMessageSegmentsToMarkdown(segments)
    expect(markdown).toContain('[chat:sess-abc]')
    expect(parseUserMessageMarkdown(markdown)).toEqual([
      { type: 'chat', sessionId: 'sess-abc', name: 'sess-abc' },
      { type: 'text', text: ' summarize this chat' },
    ])
  })

  it('extracts chat references for the send pipeline', () => {
    const segments: UserMessageSegment[] = [
      { type: 'text', text: 'continue from ' },
      { type: 'chat', sessionId: 'sess-abc', name: 'Gateway refactor' },
    ]

    const chats = userReferencedChatsFromSegments(segments)
    expect(chats).toEqual([{ sessionId: 'sess-abc', name: 'Gateway refactor' }])
  })

  it('recovers chat references from plain pasted text when the structured clipboard payload is missing', () => {
    // Regression: copying the composer fell back to plain text on surfaces that
    // drop custom clipboard types, so `[chat:id]` arrived as raw text and the
    // paste handler re-created it as a loose text segment.
    const parsed = parseUserMessageMarkdown('look at [chat:sess-abc] please')

    expect(parsed).toEqual([
      { type: 'text', text: 'look at ' },
      { type: 'chat', sessionId: 'sess-abc', name: 'sess-abc' },
      { type: 'text', text: ' please' },
    ])
  })

  it('keeps chat references in place when the user edits a sent message', () => {
    const previous: UserMessageSegment[] = [
      { type: 'chat', sessionId: 'sess-abc', name: 'Gateway refactor' },
      { type: 'text', text: 'orig with follow-up question' },
      { type: 'file', path: '/tmp/gateway.ts', name: 'gateway.ts' },
    ]

    // Only files survive the legacy fallback path; image/attachment/chat are
    // re-appended so the edit keeps referencing the linked conversation.
    expect(buildEditedUserMessageSegments('rewritten question', previous)).toEqual([
      { type: 'text', text: 'rewritten question' },
      { type: 'file', path: '/tmp/gateway.ts', name: 'gateway.ts' },
      { type: 'chat', sessionId: 'sess-abc', name: 'Gateway refactor' },
    ])
  })
})

describe('kind preservation', () => {
  it('normalizeUserMessageSegments preserves kind on file segments', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'C:\\Users\\test\\folder', name: 'folder', kind: 'dir' },
      { type: 'file', path: 'C:\\Users\\test\\file.ts', name: 'file.ts', kind: 'file' },
      { type: 'file', path: 'src/utils.ts', name: 'utils.ts' },
    ]
    const result = normalizeUserMessageSegments(segments)
    expect(result[0]).toEqual({ type: 'file', path: 'C:\\Users\\test\\folder', name: 'folder', kind: 'dir' })
    expect(result[1]).toEqual({ type: 'file', path: 'C:\\Users\\test\\file.ts', name: 'file.ts', kind: 'file' })
    expect(result[2]).toEqual({ type: 'file', path: 'src/utils.ts', name: 'utils.ts' })
  })

  it('userReferencedFilesFromSegments preserves kind', () => {
    const segments: UserMessageSegment[] = [
      { type: 'text', text: 'check ' },
      { type: 'file', path: '/home/user/project', name: 'project', kind: 'dir' },
    ]
    const files = userReferencedFilesFromSegments(segments)
    expect(files).toEqual([{ path: '/home/user/project', name: 'project', kind: 'dir' }])
  })

  it('buildFallbackUserMessageSegments preserves kind', () => {
    const files = [
      { path: 'C:\\folder', name: 'folder', kind: 'dir' as const },
      { path: 'C:\\file.ts', name: 'file.ts' },
    ]
    const segments = buildFallbackUserMessageSegments('hello', files)
    expect(segments[1]).toEqual({ type: 'file', path: 'C:\\folder', name: 'folder', kind: 'dir' })
    expect(segments[2]).toEqual({ type: 'file', path: 'C:\\file.ts', name: 'file.ts' })
  })

  it('parseUserMessageSegments preserves kind from raw data', () => {
    const raw = [
      { type: 'file', path: 'C:\\Users\\test\\src', name: 'src', kind: 'dir' },
      { type: 'file', path: 'index.ts', name: 'index.ts', kind: 'file' },
      { type: 'file', path: 'other.ts', name: 'other.ts' },
    ]
    const result = parseUserMessageSegments(raw)
    expect(result[0]).toEqual({ type: 'file', path: 'C:\\Users\\test\\src', name: 'src', kind: 'dir' })
    expect(result[1]).toEqual({ type: 'file', path: 'index.ts', name: 'index.ts', kind: 'file' })
    expect(result[2]).toEqual({ type: 'file', path: 'other.ts', name: 'other.ts' })
  })
})

describe('Windows backslash path handling', () => {
  it('normalizeUserMessageSegments extracts name from backslash paths', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'C:\\Users\\jake\\project\\src', name: '' },
    ]
    const result = normalizeUserMessageSegments(segments)
    expect(result[0]).toMatchObject({ name: 'src' })
  })

  it('parseUserMessageSegments derives name from backslash paths', () => {
    const raw = [{ type: 'file', path: 'D:\\Projects\\my-app' }]
    const result = parseUserMessageSegments(raw)
    expect(result[0]).toMatchObject({ name: 'my-app', path: 'D:\\Projects\\my-app' })
  })

  it('clipboard round-trip preserves kind on file segments', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'C:\\folder', name: 'folder', kind: 'dir' },
      { type: 'text', text: ' explain' },
    ]
    const payload = serializeUserMessageSegmentsForClipboard(segments)
    expect(payload).not.toBeNull()
    const restored = parseUserMessageClipboardPayload(payload!)
    expect(restored[0]).toEqual({ type: 'file', path: 'C:\\folder', name: 'folder', kind: 'dir' })
  })
})

describe('line range references', () => {
  it('round-trips file and terminal line ranges through clipboard payloads', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'src/app.ts', name: 'app.ts', lineRange: { startLine: 4, endLine: 8 } },
      { type: 'terminal', terminalId: 'term-123', name: '123', lineRange: { startLine: 1, endLine: 3 }, selectedText: 'one\ntwo\nthree' },
    ]

    const payload = serializeUserMessageSegmentsForClipboard(segments)
    expect(payload).not.toBeNull()
    expect(parseUserMessageClipboardPayload(payload!)).toEqual(segments)
  })

  it('keeps separate ranges for the same file reference', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'src/app.ts', name: 'app.ts', lineRange: { startLine: 1, endLine: 2 } },
      { type: 'file', path: 'src/app.ts', name: 'app.ts', lineRange: { startLine: 5, endLine: 6 } },
    ]

    expect(userReferencedFilesFromSegments(segments)).toEqual([
      { path: 'src/app.ts', name: 'app.ts', lineRange: { startLine: 1, endLine: 2 } },
      { path: 'src/app.ts', name: 'app.ts', lineRange: { startLine: 5, endLine: 6 } },
    ])
  })

  it('parses line ranges from fallback markdown references', () => {
    expect(parseUserMessageMarkdown('check @src/app.ts#L4-L8 and [terminal:term-123#L1-L3]')).toEqual([
      { type: 'text', text: 'check ' },
      { type: 'file', path: 'src/app.ts', name: 'app.ts', lineRange: { startLine: 4, endLine: 8 } },
      { type: 'text', text: ' and ' },
      { type: 'terminal', terminalId: 'term-123', name: 'term-123', lineRange: { startLine: 1, endLine: 3 } },
    ])
  })
})
