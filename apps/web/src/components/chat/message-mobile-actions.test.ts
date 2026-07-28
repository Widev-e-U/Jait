import { describe, expect, it } from 'vitest'
import { getMobileMessageActionsPositionClassName } from './message-mobile-actions'

describe('mobile message actions', () => {
  it('places assistant actions in the unused right gutter instead of over message text', () => {
    const className = getMobileMessageActionsPositionClassName(false)

    expect(className).toContain('-right-7')
    expect(className).not.toContain('right-0')
  })

  it('keeps user actions inside the message bubble', () => {
    const className = getMobileMessageActionsPositionClassName(true)

    expect(className).toContain('right-0')
    expect(className).not.toContain('-right-7')
  })
})
