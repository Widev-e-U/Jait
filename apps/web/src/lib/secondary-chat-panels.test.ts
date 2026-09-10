import { describe, expect, it } from 'vitest'

import { appendSecondaryChatPanel, MAX_CHAT_PANELS } from './secondary-chat-panels'

const panel = (id: string) => ({ session: { id } })

describe('secondary chat panels', () => {
  it('allows two secondary chats beside the main chat', () => {
    const panels = appendSecondaryChatPanel(
      appendSecondaryChatPanel([], panel('chat-2')),
      panel('chat-3'),
    )

    expect(MAX_CHAT_PANELS).toBe(3)
    expect(panels.map((entry) => entry.session.id)).toEqual(['chat-2', 'chat-3'])
  })

  it('ignores duplicate and over-limit panels', () => {
    const existing = [panel('chat-2'), panel('chat-3')]

    expect(appendSecondaryChatPanel(existing, panel('chat-2'))).toBe(existing)
    expect(appendSecondaryChatPanel(existing, panel('chat-4'))).toBe(existing)
  })
})
