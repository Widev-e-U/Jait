import { describe, expect, it } from 'vitest'
import { isAtBottomDistance, nextStickToBottomState } from './use-stick-to-bottom'

const attached = { stick: true, detached: false }
const detached = { stick: false, detached: true }

describe('nextStickToBottomState', () => {
  it('keeps following the bottom while content grows underneath', () => {
    expect(nextStickToBottomState({
      ...attached,
      distanceFromBottom: 0,
      scrollingUp: false,
      userScrolling: false,
    })).toEqual(attached)
  })

  it('detaches when the user scrolls up', () => {
    expect(nextStickToBottomState({
      ...attached,
      distanceFromBottom: 300,
      scrollingUp: true,
      userScrolling: true,
    })).toEqual(detached)
  })

  it('ignores an upward shift that no gesture caused (a tool card collapsing)', () => {
    expect(nextStickToBottomState({
      ...attached,
      distanceFromBottom: 300,
      scrollingUp: true,
      userScrolling: false,
    })).toEqual(attached)
  })

  it('stays detached while new content arrives above the bottom edge', () => {
    expect(nextStickToBottomState({
      ...detached,
      distanceFromBottom: 120,
      scrollingUp: false,
      userScrolling: false,
    })).toEqual(detached)
  })

  it('stays detached when merely near the bottom, not at it', () => {
    expect(nextStickToBottomState({
      ...detached,
      distanceFromBottom: 20,
      scrollingUp: false,
      userScrolling: false,
    })).toEqual(detached)
  })

  it('re-attaches once the user reaches the very bottom edge', () => {
    expect(nextStickToBottomState({
      ...detached,
      distanceFromBottom: 0,
      scrollingUp: false,
      userScrolling: true,
    })).toEqual(attached)
  })
})

describe('isAtBottomDistance', () => {
  it('shows the scroll-to-bottom button only once the user is meaningfully away', () => {
    expect(isAtBottomDistance(0)).toBe(true)
    expect(isAtBottomDistance(20)).toBe(true)
    expect(isAtBottomDistance(24)).toBe(false)
    expect(isAtBottomDistance(500)).toBe(false)
  })
})
