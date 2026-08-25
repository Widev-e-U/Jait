import { describe, expect, it } from 'vitest'
import {
  pickToolCardAnchorEdge,
  toolCardAnchorScrollDelta,
  toolCardVisibilityNudge,
  TOOL_CARD_ANCHOR_MARGIN_PX,
} from './tool-card-anchor'

const VIEWPORT = 800

describe('pickToolCardAnchorEdge', () => {
  it('pins the top edge for a card in the upper half', () => {
    expect(pickToolCardAnchorEdge({ top: 120, bottom: 160 }, VIEWPORT)).toBe('top')
  })

  it('pins the bottom edge for a card in the lower half', () => {
    expect(pickToolCardAnchorEdge({ top: 600, bottom: 640 }, VIEWPORT)).toBe('bottom')
  })

  it('pins the top edge for a card scrolled partly off the top', () => {
    expect(pickToolCardAnchorEdge({ top: -200, bottom: 300 }, VIEWPORT)).toBe('top')
  })

  it('falls back to the top edge when the bottom edge is below the fold', () => {
    // Collapsing a tall card: its bottom is off-screen, so pinning it would
    // drag the whole card — header included — out of view.
    expect(pickToolCardAnchorEdge({ top: 500, bottom: 2400 }, VIEWPORT)).toBe('top')
  })

  it('has nothing to measure against without a viewport', () => {
    expect(pickToolCardAnchorEdge({ top: 0, bottom: 40 }, 0)).toBe('top')
  })
})

describe('toolCardAnchorScrollDelta', () => {
  it('leaves the view alone when a top-anchored card grows downward', () => {
    // The reflow already kept the card's top put, so the content below it moved
    // down on its own — exactly the intended result.
    expect(toolCardAnchorScrollDelta({
      edge: 'top',
      before: { top: 120, bottom: 160 },
      after: { top: 120, bottom: 460 },
    })).toBe(0)
  })

  it('puts a top-anchored card back when the reflow moved it', () => {
    expect(toolCardAnchorScrollDelta({
      edge: 'top',
      before: { top: 120, bottom: 160 },
      after: { top: 90, bottom: 390 },
    })).toBe(-30)
  })

  it('pulls the content above up when a bottom-anchored card expands', () => {
    // 300px of new body unfolded below the header: scroll down by 300 so the
    // card's bottom edge stays where it was and the transcript above slides up
    // out of the way.
    expect(toolCardAnchorScrollDelta({
      edge: 'bottom',
      before: { top: 600, bottom: 640 },
      after: { top: 600, bottom: 940 },
    })).toBe(300)
  })

  it('is finished once the anchored edge is back where it started', () => {
    // The frame after the correction above landed.
    expect(toolCardAnchorScrollDelta({
      edge: 'bottom',
      before: { top: 600, bottom: 640 },
      after: { top: 300, bottom: 640 },
    })).toBe(0)
  })

  it('stops short of pushing a bottom-anchored header off the top', () => {
    // A body taller than the space above the card: full compensation would put
    // the header at -100, so clamp to what leaves it at the margin.
    expect(toolCardAnchorScrollDelta({
      edge: 'bottom',
      before: { top: 600, bottom: 640 },
      after: { top: 600, bottom: 1540 },
    })).toBe(600 - TOOL_CARD_ANCHOR_MARGIN_PX)
  })

  it('never scrolls a card whose header already sits above the viewport', () => {
    expect(toolCardAnchorScrollDelta({
      edge: 'bottom',
      before: { top: 40, bottom: 600 },
      after: { top: -20, bottom: 900 },
    })).toBe(0)
  })

  it('follows a bottom-anchored card back down as it collapses', () => {
    expect(toolCardAnchorScrollDelta({
      edge: 'bottom',
      before: { top: 500, bottom: 740 },
      after: { top: 500, bottom: 540 },
    })).toBe(-200)
  })

  it('ignores sub-pixel drift', () => {
    expect(toolCardAnchorScrollDelta({
      edge: 'top',
      before: { top: 120, bottom: 160 },
      after: { top: 120.3, bottom: 460 },
    })).toBe(0)
  })
})

describe('toolCardVisibilityNudge', () => {
  it('leaves a header that is comfortably in view alone', () => {
    expect(toolCardVisibilityNudge({ top: 200, bottom: 240 }, VIEWPORT)).toBe(0)
  })

  it('brings a header that ended up above the fold back down', () => {
    expect(toolCardVisibilityNudge({ top: -60, bottom: -20 }, VIEWPORT))
      .toBe(-60 - TOOL_CARD_ANCHOR_MARGIN_PX)
  })

  it('brings a header that ended up below the fold back up', () => {
    expect(toolCardVisibilityNudge({ top: 900, bottom: 940 }, VIEWPORT))
      .toBe(900 - (VIEWPORT - TOOL_CARD_ANCHOR_MARGIN_PX))
  })
})
