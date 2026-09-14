import { describe, expect, it } from 'vitest'

import {
  USER_BUBBLE_INTERACTIVE_SELECTOR,
  isInteractiveBubbleTarget,
  shouldStartUserMessageEdit,
} from './message-bubble-click'

/** Fake event target whose `closest` returns a match for the given selectors. */
function targetMatching(...selectors: string[]) {
  return {
    closest: (selector: string) => {
      const parts = selector.split(',').map((part) => part.trim())
      return parts.some((part) => selectors.includes(part)) ? ({} as Element) : null
    },
  }
}

/** Fake bubble element whose `contains` reports whether a match is nested in it. */
function bubbleContaining(nestedInBubble: boolean) {
  return { contains: () => nestedInBubble }
}

const editable = { canEdit: true, isEditing: false }

describe('USER_BUBBLE_INTERACTIVE_SELECTOR', () => {
  it('covers buttons (image "Click to expand" trigger) and form controls', () => {
    expect(USER_BUBBLE_INTERACTIVE_SELECTOR).toContain('button')
    expect(USER_BUBBLE_INTERACTIVE_SELECTOR).toContain('a')
    expect(USER_BUBBLE_INTERACTIVE_SELECTOR).toContain('[role="button"]')
    expect(USER_BUBBLE_INTERACTIVE_SELECTOR).toContain('[data-no-message-edit]')
  })
})

describe('isInteractiveBubbleTarget', () => {
  it('is false for a plain bubble target with no interactive ancestor', () => {
    expect(isInteractiveBubbleTarget(targetMatching())).toBe(false)
  })

  it('is true when the click is inside a nested button (image expand)', () => {
    expect(isInteractiveBubbleTarget(targetMatching('button'))).toBe(true)
  })

  it('is safe for null/undefined/non-element targets', () => {
    expect(isInteractiveBubbleTarget(null)).toBe(false)
    expect(isInteractiveBubbleTarget(undefined)).toBe(false)
    expect(isInteractiveBubbleTarget({})).toBe(false)
    expect(isInteractiveBubbleTarget('text')).toBe(false)
  })

  it('only counts matches nested inside the bubble when a boundary is passed', () => {
    expect(isInteractiveBubbleTarget(targetMatching('button'), bubbleContaining(true))).toBe(true)
    expect(isInteractiveBubbleTarget(targetMatching('button'), bubbleContaining(false))).toBe(false)
    // A boundary without `contains` (or a missing boundary) falls back to accepting matches.
    expect(isInteractiveBubbleTarget(targetMatching('button'), {})).toBe(true)
    expect(isInteractiveBubbleTarget(targetMatching('button'), null)).toBe(true)
  })
})

describe('shouldStartUserMessageEdit', () => {
  it('starts editing when clicking plain bubble content', () => {
    expect(shouldStartUserMessageEdit({ target: targetMatching() }, '', editable)).toBe(true)
  })

  it('does NOT start editing when expanding an image (click on nested button)', () => {
    const event = { target: targetMatching('button') }
    expect(shouldStartUserMessageEdit(event, '', editable)).toBe(false)
  })

  it('does NOT start editing when the click is inside a nested link or input', () => {
    expect(shouldStartUserMessageEdit({ target: targetMatching('a') }, '', editable)).toBe(false)
    expect(shouldStartUserMessageEdit({ target: targetMatching('input') }, '', editable)).toBe(false)
    expect(
      shouldStartUserMessageEdit({ target: targetMatching('[contenteditable="true"]') }, '', editable),
    ).toBe(false)
  })

  it('respects explicit opt-out via data-no-message-edit', () => {
    expect(
      shouldStartUserMessageEdit({ target: targetMatching('[data-no-message-edit]') }, '', editable),
    ).toBe(false)
  })

  it('does NOT start editing when text is selected', () => {
    expect(shouldStartUserMessageEdit({ target: targetMatching() }, 'selected text', editable)).toBe(false)
  })

  it('ignores whitespace-only selections', () => {
    expect(shouldStartUserMessageEdit({ target: targetMatching() }, '   \n  ', editable)).toBe(true)
  })

  it('never starts editing for non-editable or already-editing messages', () => {
    expect(
      shouldStartUserMessageEdit({ target: targetMatching() }, '', { canEdit: false, isEditing: false }),
    ).toBe(false)
    expect(
      shouldStartUserMessageEdit({ target: targetMatching() }, '', { canEdit: true, isEditing: true }),
    ).toBe(false)
  })

  it('is safe when the event is missing', () => {
    expect(shouldStartUserMessageEdit(null, '', editable)).toBe(true)
    expect(shouldStartUserMessageEdit(undefined, '', editable)).toBe(true)
  })

  it('still starts editing when the interactive match is an ancestor, not a child', () => {
    // e.g. the bubble sits inside a clickable message row: the row matches the
    // selector but is not nested in the bubble, so editing must still work.
    const event = { target: targetMatching('button'), currentTarget: bubbleContaining(false) }
    expect(shouldStartUserMessageEdit(event, '', editable)).toBe(true)
    expect(isInteractiveBubbleTarget(event.target, bubbleContaining(false))).toBe(false)
  })

  it('uses the event currentTarget as the boundary when none is passed explicitly', () => {
    const event = { target: targetMatching('button'), currentTarget: bubbleContaining(false) }
    expect(shouldStartUserMessageEdit(event, '', editable)).toBe(true)
  })

  it('does NOT start editing for an interactive child inside the bubble', () => {
    const event = { target: targetMatching('button'), currentTarget: bubbleContaining(true) }
    expect(shouldStartUserMessageEdit(event, '', editable)).toBe(false)
  })
})
