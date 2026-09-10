import { describe, expect, it } from 'vitest'

import { getChatTranscriptColumnLeft, shouldShowFloatingLeftIndicator } from './floating-indicator-layout'

describe('floating chat indicator layout', () => {
  it('hides the file diff indicator when it reaches transcript text', () => {
    expect(shouldShowFloatingLeftIndicator({ indicatorRight: 112, contentLeft: 108 })).toBe(false)
  })

  it('keeps the file diff indicator visible with a clear gap before text', () => {
    expect(shouldShowFloatingLeftIndicator({ indicatorRight: 112, contentLeft: 124 })).toBe(true)
  })

  it('hides the file diff indicator for non-finite measurements', () => {
    expect(shouldShowFloatingLeftIndicator({ indicatorRight: Number.NaN, contentLeft: 400 })).toBe(false)
  })
})

describe('chat transcript column', () => {
  it('hugs the panel padding on narrow panels', () => {
    expect(getChatTranscriptColumnLeft(500, false)).toBe(20)
    expect(getChatTranscriptColumnLeft(500, true)).toBe(16)
  })

  it('centers once the panel exceeds the max-w-4xl column', () => {
    expect(getChatTranscriptColumnLeft(896, false)).toBe(20)
    expect(getChatTranscriptColumnLeft(1200, false)).toBe(172)
  })

  it('treats unmeasured panel widths as zero', () => {
    expect(getChatTranscriptColumnLeft(0, false)).toBe(0)
  })
})
