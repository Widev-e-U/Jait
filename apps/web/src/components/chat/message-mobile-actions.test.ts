import { describe, expect, it } from 'vitest'
import { getMobileMessageActionsPositionClassName } from './message'

describe('mobile message actions', () => {
  it('places assistant actions in the unused right gutter instead of over message text', () => {
    const className = getMobileMessageActionsPositionClassName()

    expect(className).toContain('-right-7')
    expect(className).not.toContain('right-0.5')
  })
})
