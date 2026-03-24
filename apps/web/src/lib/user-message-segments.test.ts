import { describe, expect, it } from 'vitest'

import {
  buildEditedUserMessageSegments,
  buildFallbackUserMessageSegments,
  normalizeUserMessageSegments,
  parseUserMessageClipboardPayload,
  parseUserMessageMarkdown,
  parseUserMessageSegments,
  serializeUserMessageSegmentsForClipboard,
  serializeUserMessageSegmentsToMarkdown,
  userReferencedFilesFromSegments,
  type UserMessageSegment,
} from '@/lib/user-message-segments'

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
