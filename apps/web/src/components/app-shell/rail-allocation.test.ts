import { describe, expect, it } from 'vitest'

import {
  allocateRailSections,
  contentHeight,
  RAIL_ITEM_GAP,
  RAIL_MORE_BUTTON_HEIGHT,
} from './rail-allocation'

const ITEM = 36 // h-9 collapsed rail button

describe('allocateRailSections', () => {
  it('shows every item without a three-dot button when everything fits', () => {
    const sections = [
      { itemHeights: Array(10).fill(ITEM) },
      { itemHeights: Array(6).fill(ITEM) },
    ]
    const result = allocateRailSections(sections, 1000)
    expect(result).toEqual([
      { visibleCount: 10, showMore: false },
      { visibleCount: 6, showMore: false },
    ])
  })

  it('does not show a three-dot button while a hidden button still fits in the slack', () => {
    // Regression: section A showed "…" although section B kept unused height.
    const sections = [
      { itemHeights: Array(10).fill(ITEM) },
      { itemHeights: Array(6).fill(ITEM) },
    ]
    for (let available = 0; available <= 700; available += 7) {
      const result = allocateRailSections(sections, available)
      for (let i = 0; i < sections.length; i++) {
        const { itemHeights } = sections[i]
        const { visibleCount, showMore } = result[i]
        expect(showMore).toBe(visibleCount < itemHeights.length)
        const used = sections.reduce((sum, s, j) => sum + contentHeight(s.itemHeights, result[j].visibleCount), 0)
        // Allocated content never exceeds the rail…
        if (result.some((r, j) => r.visibleCount < sections[j].itemHeights.length)) {
          // …and whenever items are hidden anywhere, no hidden button may fit
          // into the space that is left.
          for (let j = 0; j < sections.length; j++) {
            const next = contentHeight(sections[j].itemHeights, result[j].visibleCount + 1) - contentHeight(sections[j].itemHeights, result[j].visibleCount)
            if (result[j].visibleCount < sections[j].itemHeights.length) {
              expect(used + next).toBeGreaterThan(available)
            }
          }
        }
      }
    }
  })

  it('splits a tight rail proportionally between sections', () => {
    // 400px fits 8 slots + both three-dot buttons: 5 items + ⋯ and 3 items + ⋯.
    const result = allocateRailSections(
      [
        { itemHeights: Array(10).fill(ITEM) },
        { itemHeights: Array(6).fill(ITEM) },
      ],
      400,
    )
    expect(result).toEqual([
      { visibleCount: 5, showMore: true },
      { visibleCount: 3, showMore: true },
    ])
  })

  it('lets a section borrow another section\'s leftover space', () => {
    // Section A needs only one button; section B must still show both items
    // instead of hiding one behind "…" (36 + 76 = 112).
    const result = allocateRailSections(
      [
        { itemHeights: [ITEM] },
        { itemHeights: [ITEM, ITEM] },
      ],
      112,
    )
    expect(result).toEqual([
      { visibleCount: 1, showMore: false },
      { visibleCount: 2, showMore: false },
    ])
  })

  it('keeps hidden items reachable when the rail is extremely short', () => {
    const result = allocateRailSections([{ itemHeights: [ITEM, ITEM] }], 20)
    expect(result).toEqual([{ visibleCount: 0, showMore: true }])
  })

  it('returns no buttons for empty sections', () => {
    const result = allocateRailSections([{ itemHeights: [] }, { itemHeights: [] }], 500)
    expect(result).toEqual([
      { visibleCount: 0, showMore: false },
      { visibleCount: 0, showMore: false },
    ])
  })

  it('accounts for the three-dot button replacing itself on the last item', () => {
    // One section, three items: the third item swaps with the ⋯ button, so
    // 2 items + ⋯ and 3 items cost the same and 3 items must win.
    const heights = [ITEM, ITEM, ITEM]
    expect(contentHeight(heights, 2)).toBe(contentHeight(heights, 3))
    const result = allocateRailSections([{ itemHeights: heights }], contentHeight(heights, 3))
    expect(result).toEqual([{ visibleCount: 3, showMore: false }])
  })

  it('counts gaps and the three-dot button like the rendered markup', () => {
    // [item] gap [item] gap [⋯]
    const heights = [ITEM, ITEM, ITEM]
    expect(contentHeight(heights, 2)).toBe(ITEM + RAIL_ITEM_GAP + ITEM + RAIL_ITEM_GAP + RAIL_MORE_BUTTON_HEIGHT)
  })
})
