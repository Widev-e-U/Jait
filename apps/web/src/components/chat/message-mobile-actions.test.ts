import { describe, expect, it } from 'vitest'
import { getMobileMessageActionsPositionClassName } from './message-mobile-actions'

describe('mobile message actions', () => {
  it('places assistant actions in the unused right gutter instead of over message text', () => {
    const className = getMobileMessageActionsPositionClassName(false)

    expect(className).toContain('-right-7')
    expect(className).not.toContain('right-1.5')
  })

  it('keeps user actions inside the message bubble', () => {
    const className = getMobileMessageActionsPositionClassName(true)

    expect(className).toContain('right-1.5')
    expect(className).not.toContain('-right-7')
  })
})
