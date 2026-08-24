import { readFileSync } from 'node:fs'
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

  it('provides session context to tool calls rendered from ordered assistant segments', () => {
    const source = readFileSync(new URL('./message.tsx', import.meta.url), 'utf8')
    const segmentedAssistantBranch = source.match(
      /!isUser && segments && segments\.length > 0 \? \(([\s\S]*?)\n        \) : \(/,
    )?.[1] ?? ''

    expect(segmentedAssistantBranch).toContain('<SubAgentAuthProvider sessionId={sessionId} authToken={authToken}>')
    expect(segmentedAssistantBranch).toContain('<AssistantBody')
  })
})
