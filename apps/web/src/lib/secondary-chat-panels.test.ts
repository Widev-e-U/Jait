import { describe, expect, it } from 'vitest'

import {
  appendSecondaryChatPanel,
  closeSecondaryChatPanel,
  getOpenChatSessionIds,
  getVisibleChatPanelCount,
  MAX_CHAT_PANELS,
  shouldShowChatPanelHideButton,
} from './secondary-chat-panels'

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

describe('open chat session highlighting', () => {
  it('highlights the main chat and every secondary panel', () => {
    const ids = getOpenChatSessionIds(true, 'main-1', [panel('chat-2'), panel('chat-3')])

    expect([...ids].sort()).toEqual(['chat-2', 'chat-3', 'main-1'])
  })

  it('keeps the other chat highlighted when one of two open chats is closed', () => {
    // Two secondary panels open beside the main chat -> all three are blue.
    const openPanels = [panel('chat-2'), panel('chat-3')]
    expect(getOpenChatSessionIds(true, 'main-1', openPanels).size).toBe(3)

    // Close the second panel -> only it loses its highlight.
    const afterClose = closeSecondaryChatPanel(openPanels, 'chat-3')
    const ids = getOpenChatSessionIds(true, 'main-1', afterClose)

    expect(afterClose.map((entry) => entry.session.id)).toEqual(['chat-2'])
    expect(ids.has('chat-2')).toBe(true)
    expect(ids.has('main-1')).toBe(true)
    expect(ids.has('chat-3')).toBe(false)
  })

  it('does not close unrelated panels when a session id is not present', () => {
    const panels = [panel('chat-2'), panel('chat-3')]

    expect(closeSecondaryChatPanel(panels, 'missing')).toEqual(panels)
  })

  it('drops the main chat highlight when the main panel is hidden but keeps panels', () => {
    const ids = getOpenChatSessionIds(false, 'main-1', [panel('chat-2')])

    expect(ids.has('main-1')).toBe(false)
    expect(ids.has('chat-2')).toBe(true)
  })

  it('never highlights a missing main session', () => {
    expect(getOpenChatSessionIds(true, null, []).size).toBe(0)
  })
})
