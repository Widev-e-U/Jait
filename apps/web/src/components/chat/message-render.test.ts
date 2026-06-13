import { describe, expect, it } from 'vitest'
import { hasRenderableUserMessageContent } from './message-render-state'

describe('Message rendering', () => {
  it('treats user messages that only contain display segments as renderable', () => {
    expect(hasRenderableUserMessageContent({
      content: '',
      userDisplayText: '',
      userDisplaySegments: [
        { type: 'file', path: '/tmp/example.ts', name: 'example.ts' },
      ],
      attachmentCount: 0,
    })).toBe(true)
  })

  it('treats user messages that only contain image attachments as renderable', () => {
    expect(hasRenderableUserMessageContent({
      content: '',
      userDisplayText: '',
      userDisplaySegments: [],
      attachmentCount: 1,
    })).toBe(true)
  })

  it('keeps genuinely empty user messages non-renderable', () => {
    expect(hasRenderableUserMessageContent({
      content: '',
      userDisplayText: '',
      userDisplaySegments: [],
      attachmentCount: 0,
    })).toBe(false)
  })
})
