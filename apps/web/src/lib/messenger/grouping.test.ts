import { describe, expect, it } from 'vitest'
import { MESSAGE_GROUP_WINDOW_MS, messageGroupPositions, sameMessageGroup } from './grouping'
import type { MessengerMessage } from './model'

const base = (overrides: Partial<MessengerMessage> = {}): MessengerMessage => ({
  id: 'm1', sender: 'Katja', body: 'hi', timestamp: 1_700_000_000_000,
  own: false, encrypted: false, unableToDecrypt: false, pending: false, failed: false,
  ...overrides,
})

describe('sameMessageGroup', () => {
  it('groups the same sender inside the window', () => {
    const previous = base()
    const current = base({ id: 'm2', timestamp: previous.timestamp + 30_000 })
    expect(sameMessageGroup(previous, current)).toBe(true)
  })

  it('breaks the run after the group window', () => {
    const previous = base()
    const current = base({ id: 'm2', timestamp: previous.timestamp + MESSAGE_GROUP_WINDOW_MS + 1 })
    expect(sameMessageGroup(previous, current)).toBe(false)
  })

  it('breaks the run when the sender changes, including own messages', () => {
    const previous = base()
    expect(sameMessageGroup(previous, base({ id: 'm2', sender: 'Papa', timestamp: previous.timestamp + 1 }))).toBe(false)
    expect(sameMessageGroup(previous, base({ id: 'm3', own: true, timestamp: previous.timestamp + 1 }))).toBe(false)
  })

  it('never merges a settled message with a sending or failed one', () => {
    const previous = base()
    expect(sameMessageGroup(previous, base({ id: 'm2', pending: true, timestamp: previous.timestamp + 1 }))).toBe(false)
    expect(sameMessageGroup(previous, base({ id: 'm3', failed: true, timestamp: previous.timestamp + 1 }))).toBe(false)
    expect(sameMessageGroup(base({ pending: true }), base({ id: 'm4', timestamp: previous.timestamp + 1 }))).toBe(false)
  })

  it('breaks the run across a date divider', () => {
    const start = new Date(2025, 2, 9, 23, 58).getTime()
    const next = new Date(2025, 2, 10, 0, 1).getTime()
    expect(sameMessageGroup(base({ timestamp: start }), base({ id: 'm2', timestamp: next }))).toBe(false)
  })

  it('keeps two consecutive photos in separate runs', () => {
    const attachment = { url: 'mxc://a', name: 'one.jpg', mime: 'image/jpeg', image: true }
    expect(sameMessageGroup(base({ attachment }), base({ id: 'm2', attachment, timestamp: base().timestamp + 1 }))).toBe(false)
  })

  it('groups a photo with a following text message from the same sender', () => {
    const attachment = { url: 'mxc://a', name: 'one.jpg', mime: 'image/jpeg', image: true }
    expect(sameMessageGroup(base({ attachment }), base({ id: 'm2', timestamp: base().timestamp + 1 }))).toBe(true)
  })
})

describe('messageGroupPositions', () => {
  it('marks the first and last message of a run', () => {
    const messages = [
      base({ id: 'a', timestamp: 1_000 }),
      base({ id: 'b', timestamp: 2_000 }),
      base({ id: 'c', sender: 'Papa', timestamp: 3_000 }),
    ]
    expect(messageGroupPositions(messages)).toEqual([
      { start: true, end: false },
      { start: false, end: true },
      { start: true, end: true },
    ])
  })

  it('keeps every message standalone when none match', () => {
    const messages = [
      base({ id: 'a', timestamp: 1_000 }),
      base({ id: 'b', sender: 'Papa', timestamp: 2_000 }),
    ]
    expect(messageGroupPositions(messages).every(position => position.start && position.end)).toBe(true)
  })

  it('returns nothing for an empty conversation', () => {
    expect(messageGroupPositions([])).toEqual([])
  })
})
