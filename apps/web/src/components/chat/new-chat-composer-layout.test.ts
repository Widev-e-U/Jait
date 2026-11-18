import { describe, expect, it } from 'vitest'

import {
  KEYBOARD_BOTTOM_INSET_MIN_PX,
  NEW_CHAT_COMPOSER_REVEAL_MARGIN_PX,
  clampRevealDeltaToHeader,
  getComposerRevealDelta,
  getKeyboardBottomInset,
  getNewChatColumnClassName,
  getNewChatStackClassName,
  getVisibleViewportBottom,
  shouldPlaceControlRowAboveComposer,
} from './new-chat-composer-layout'

describe('new chat column layout', () => {
  it('keeps the desktop empty state centered and clipped', () => {
    const classes = getNewChatColumnClassName(false, true)

    expect(classes).toContain('justify-center')
    expect(classes).toContain('overflow-hidden')
    expect(classes).toContain('px-4')
    expect(classes).not.toContain('overflow-y-auto')
    expect(classes).not.toContain('pt-12')
    expect(getNewChatStackClassName(false)).not.toContain('my-auto')
  })

  it('scrolls the mobile empty state instead of clipping the composer', () => {
    const classes = getNewChatColumnClassName(true, true)

    expect(classes).toContain('overflow-y-auto')
    expect(classes).toContain('overscroll-contain')
    expect(classes).toContain('pt-12')
    expect(classes).not.toContain('overflow-hidden')
    // `justify-center` would hide the overflow above the composer.
    expect(classes).not.toContain('justify-center')
    // Auto margins center the stack while it fits.
    expect(getNewChatStackClassName(true)).toContain('my-auto')
  })

  it('drops horizontal padding when the chat panel is collapsed', () => {
    expect(getNewChatColumnClassName(false, false)).not.toContain('px-4')
    expect(getNewChatColumnClassName(true, false)).not.toContain('px-4')
  })
})

describe('keyboard bottom inset', () => {
  it('is zero when the platform resizes the layout viewport', () => {
    // Android WebView / interactive-widget=resizes-content shrink innerHeight.
    expect(getKeyboardBottomInset(500, { height: 500, offsetTop: 0 })).toBe(0)
  })

  it('reports the part the layout viewport still covers on iOS', () => {
    expect(getKeyboardBottomInset(800, { height: 480, offsetTop: 0 })).toBe(320)
  })

  it('accounts for a scrolled visual viewport', () => {
    expect(getKeyboardBottomInset(800, { height: 480, offsetTop: 40 })).toBe(280)
  })

  it('ignores small deltas and unusable measurements', () => {
    expect(getKeyboardBottomInset(800, { height: 800 } as Pick<VisualViewport, 'height'>)).toBe(0)
    expect(getKeyboardBottomInset(800, { height: 800 - KEYBOARD_BOTTOM_INSET_MIN_PX + 1, offsetTop: 0 })).toBe(0)
    expect(getKeyboardBottomInset(800, null)).toBe(0)
    expect(getKeyboardBottomInset(800, { height: 0, offsetTop: 0 })).toBe(0)
    expect(getKeyboardBottomInset(0, { height: 400, offsetTop: 0 })).toBe(0)
  })

  it('never eats more than most of the screen', () => {
    expect(getKeyboardBottomInset(800, { height: 10, offsetTop: 0 })).toBe(560)
  })
})

describe('composer reveal', () => {
  it('returns nothing when the composer already fits', () => {
    expect(getComposerRevealDelta(600, 100, 520)).toBe(0)
  })

  it('returns the exact overhang so the input moves up just enough', () => {
    // Composer bottom 640, visible band 100..620 → 20px hidden + margin.
    expect(getComposerRevealDelta(640, 100, 520)).toBe(20 + NEW_CHAT_COMPOSER_REVEAL_MARGIN_PX)
  })

  it('never lifts the composer by the whole keyboard height', () => {
    // Regression: the column already shrinks with the keyboard, so a 300px
    // keyboard must only hide ~135px of the composer, never all 300px. Padding
    // the column by the inset as well lifted it a second time and parked the
    // input under the header.
    const keyboardPx = 300
    const composerBottom = 387
    const columnTop = 47
    const visibleBottom = 560 - keyboardPx
    const delta = getComposerRevealDelta(composerBottom, columnTop, visibleBottom - columnTop)

    expect(delta).toBe(composerBottom + NEW_CHAT_COMPOSER_REVEAL_MARGIN_PX - visibleBottom)
    expect(delta).toBeLessThan(keyboardPx)
  })

  it('is a no-op for unusable geometry', () => {
    expect(getComposerRevealDelta(Number.NaN, 0, 500)).toBe(0)
    expect(getComposerRevealDelta(600, 0, 0)).toBe(0)
  })
})

describe('visible viewport bottom', () => {
  it('falls back to the layout viewport when vision data is missing', () => {
    expect(getVisibleViewportBottom(null, 800)).toBe(800)
    expect(getVisibleViewportBottom(undefined, 800)).toBe(800)
    expect(getVisibleViewportBottom({ height: 0, offsetTop: 0 }, 800)).toBe(800)
    expect(getVisibleViewportBottom({ height: Number.NaN, offsetTop: 0 }, 800)).toBe(800)
  })

  it('reports where the soft keyboard starts', () => {
    expect(getVisibleViewportBottom({ height: 260, offsetTop: 0 }, 560)).toBe(260)
    expect(getVisibleViewportBottom({ height: 480, offsetTop: 0 }, 800)).toBe(480)
  })

  it('accounts for a padded visual viewport', () => {
    // iOS can pan the visual viewport; the visible bottom moves with it.
    expect(getVisibleViewportBottom({ height: 480, offsetTop: 40 }, 800)).toBe(520)
  })

  it('never reports more than the layout viewport', () => {
    expect(getVisibleViewportBottom({ height: 900, offsetTop: 480 }, 800)).toBe(800)
  })

  it('uses the visual measurement when the layout height is unusable', () => {
    expect(getVisibleViewportBottom({ height: 260, offsetTop: 0 }, 0)).toBe(260)
  })
})

describe('clamp reveal delta to header', () => {
  it('keeps the delta when the composer stays clear of the header', () => {
    // Composer top 300, header bottom 48 → room for 244px of nudge.
    expect(clampRevealDeltaToHeader(135, 300, 48)).toBe(135)
  })

  it('caps the delta so the composer top lands at header bottom plus margin', () => {
    // A short visible band (keyboard plus browser chrome) would otherwise
    // scroll the composer straight under the header.
    const capped = clampRevealDeltaToHeader(400, 300, 48)

    expect(capped).toBe(300 - (48 + NEW_CHAT_COMPOSER_REVEAL_MARGIN_PX))
  })

  it('refuses to move when the composer is already under the header', () => {
    expect(clampRevealDeltaToHeader(120, 50, 48)).toBe(0)
    expect(clampRevealDeltaToHeader(120, 56, 48)).toBe(0)
  })

  it('is a no-op for non-positive deltas and unusable geometry', () => {
    expect(clampRevealDeltaToHeader(0, 300, 48)).toBe(0)
    expect(clampRevealDeltaToHeader(-20, 300, 48)).toBe(0)
    expect(clampRevealDeltaToHeader(Number.NaN, 300, 48)).toBe(0)
    expect(clampRevealDeltaToHeader(135, Number.NaN, 48)).toBe(135)
  })
})

describe('composer control row placement', () => {
  it('moves the row above the composer while a mobile keyboard is open', () => {
    // The composer card must be the stack's bottom element so the reveal can
    // dock it just above the keyboard instead of wedging the row in between.
    expect(shouldPlaceControlRowAboveComposer(true, 300)).toBe(true)
  })

  it('keeps the row below the composer in every other case', () => {
    expect(shouldPlaceControlRowAboveComposer(true, 0)).toBe(false)
    expect(shouldPlaceControlRowAboveComposer(false, 300)).toBe(false)
    expect(shouldPlaceControlRowAboveComposer(false, 0)).toBe(false)
    expect(shouldPlaceControlRowAboveComposer(true, Number.NaN)).toBe(false)
    expect(shouldPlaceControlRowAboveComposer(true, -10)).toBe(false)
  })
})
