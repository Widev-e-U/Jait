import { describe, expect, it } from 'vitest'
import { getScreenShareLayoutState } from './screen-share-layout'

describe('getScreenShareLayoutState', () => {
  it('shows desktop panel only on non-mobile screens', () => {
    const desktopState = getScreenShareLayoutState({ isMobile: false, showScreenShare: true, hasMessages: true })
    expect(desktopState.showDesktopScreenShare).toBe(true)
    expect(desktopState.showMobileScreenShare).toBe(false)

    const mobileState = getScreenShareLayoutState({ isMobile: true, showScreenShare: true, hasMessages: true })
    expect(mobileState.showDesktopScreenShare).toBe(false)
    expect(mobileState.showMobileScreenShare).toBe(true)
  })

  it('uses a taller mobile screen-share panel when chat has no messages yet', () => {
    const emptyState = getScreenShareLayoutState({ isMobile: true, showScreenShare: true, hasMessages: false })
    expect(emptyState.mobilePanelHeightClass).toContain('h-[50dvh]')

    const activeChatState = getScreenShareLayoutState({ isMobile: true, showScreenShare: true, hasMessages: true })
    expect(activeChatState.mobilePanelHeightClass).toContain('h-[42dvh]')
  })
})
