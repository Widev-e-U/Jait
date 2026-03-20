import { describe, expect, it } from 'vitest'

import {
  buildEditedUserMessageSegments,
  parseUserMessageClipboardPayload,
  parseUserMessageMarkdown,
  serializeUserMessageSegmentsForClipboard,
  serializeUserMessageSegmentsToMarkdown,
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
