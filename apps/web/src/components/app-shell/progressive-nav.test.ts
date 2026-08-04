import { describe, expect, it } from 'vitest'
import { computeVisibleCount } from './progressive-nav'

/**
 * The overflow menu fills progressively as the header shrinks: items are kept
 * inline from the left until the next button would exceed the available width,
 * and everything past the cutoff is moved into the "⋯" menu.
 */
describe('computeVisibleCount', () => {
  // itemEnds = cumulative offset+width for each nav button, e.g.
  // [60, 124, 198] means Chat ends at 60, PRs at 124, Todo at 198.
  const itemEnds = [60, 124, 198, 280, 366, 456, 546, 636]

  it('keeps every item inline when there is plenty of room', () => {
    expect(computeVisibleCount(itemEnds, 1000)).toBe(itemEnds.length)
  })

  it('hides nothing when the last item exactly fits', () => {
    expect(computeVisibleCount(itemEnds, 636)).toBe(itemEnds.length)
  })

  it('moves exactly the overflowing trailing items into the menu', () => {
    // Available 300 → items ending at 60, 124, 198, 280 fit (4 items);
    // the next button ends at 366 and overflows.
    expect(computeVisibleCount(itemEnds, 300)).toBe(4)
  })

  it('keeps the leftmost items visible as width shrinks (progressive)', () => {
    // Narrower → fewer items inline, but always starting from the left.
    expect(computeVisibleCount(itemEnds, 198)).toBe(3)
    expect(computeVisibleCount(itemEnds, 124)).toBe(2)
    expect(computeVisibleCount(itemEnds, 60)).toBe(1)
    expect(computeVisibleCount(itemEnds, 30)).toBe(0)
  })

  it('returns 0 for an empty item list', () => {
    expect(computeVisibleCount([], 500)).toBe(0)
  })
})
