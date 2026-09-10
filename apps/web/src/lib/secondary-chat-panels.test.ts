import { describe, expect, it } from 'vitest'

import { appendSecondaryChatPanel, getVisibleChatPanelCount, MAX_CHAT_PANELS, shouldShowChatPanelHideButton } from './secondary-chat-panels'

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

  it('shows hide controls only while more than one chat panel is visible', () => {
    expect(getVisibleChatPanelCount(true, 0)).toBe(1)
    expect(shouldShowChatPanelHideButton(1)).toBe(false)
    expect(getVisibleChatPanelCount(true, 2)).toBe(3)
    expect(shouldShowChatPanelHideButton(3)).toBe(true)
    expect(getVisibleChatPanelCount(false, 1)).toBe(1)
  })
})
