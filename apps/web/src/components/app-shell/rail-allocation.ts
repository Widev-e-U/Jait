/**
 * Vertical slot allocation for the workspace sidebar's overflow sections.
 *
 * Each section (main navigation, workspace tools) hides items behind a
 * three-dot button when the rail is too short. The sections used to measure
 * themselves independently and split the rail by flex basis, so one section
 * could hide items and show its three-dot button while another kept unused
 * slack. The allocator here distributes the rail's *actual* free height across
 * all sections together: every button that fits is shown before any three-dot
 * button is added, and hidden items can borrow space left over by another
 * section.
 */

export const RAIL_ITEM_GAP = 4 // gap-1 between buttons
export const RAIL_MORE_BUTTON_HEIGHT = 36 // h-9 three-dot button

export interface RailSectionInput {
  /** Rendered height (px) of each item's button in this section, in order. */
  itemHeights: number[]
}

export interface RailSectionAllocation {
  /** Number of items rendered inline, in order, from the section's start. */
  visibleCount: number
  /** Whether the section's remaining items live behind the three-dot button. */
  showMore: boolean
}

/** Content height of a section showing `count` of `itemHeights` items. */
export function contentHeight(itemHeights: number[], count: number, moreHeight: number = RAIL_MORE_BUTTON_HEIGHT): number {
  if (count <= 0) return 0
  const items = itemHeights.slice(0, count).reduce((sum, h) => sum + h, 0)
  const gaps = (count - 1) * RAIL_ITEM_GAP
  const more = count < itemHeights.length ? RAIL_ITEM_GAP + moreHeight : 0
  return items + gaps + more
}

/**
 * Distribute `available` px between independent rail sections.
 *
 * Items are dealt out one at a time to the section with the lowest visible
 * share, as long as the item (plus the section's three-dot button when items
 * remain hidden) fits into the available height. The result never shows a
 * three-dot button in one section while another section has enough unused
 * space for one of the hidden buttons — the failure mode that made the rail
 * show "…" too early.
 */
export function allocateRailSections(sections: RailSectionInput[], available: number, moreHeight: number = RAIL_MORE_BUTTON_HEIGHT): RailSectionAllocation[] {
  const counts = sections.map(() => 0)
  const totalItems = sections.reduce((sum, s) => sum + s.itemHeights.length, 0)
  if (totalItems === 0) return sections.map(() => ({ visibleCount: 0, showMore: false }))
  const height = (itemHeights: number[], count: number) => contentHeight(itemHeights, count, moreHeight)

  // Deal items one at a time to the section with the lowest visible share, as
  // long as the next button fits. Skipping (instead of stopping at) a section
  // whose next button does not fit lets cheaper candidates use leftover space —
  // including the final item of a section, which replaces its three-dot button
  // and can therefore be cheaper than the button it removes.
  let progress = true
  while (progress) {
    progress = false
    const total = sections.reduce((sum, s, i) => sum + height(s.itemHeights, counts[i]), 0)
    let target = -1
    let targetRatio = Infinity
    for (let i = 0; i < sections.length; i++) {
      const n = sections[i].itemHeights.length
      if (counts[i] >= n) continue
      const delta = height(sections[i].itemHeights, counts[i] + 1) - height(sections[i].itemHeights, counts[i])
      const ratio = counts[i] / n
      if (total + delta <= available && ratio < targetRatio) {
        targetRatio = ratio
        target = i
      }
    }
    if (target !== -1) {
      counts[target]++
      progress = true
    }
  }

  return sections.map((s, i) => ({
    visibleCount: counts[i],
    showMore: counts[i] < s.itemHeights.length,
  }))
}
