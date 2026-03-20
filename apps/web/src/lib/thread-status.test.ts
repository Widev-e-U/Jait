import { describe, expect, it } from 'vitest'

import { canStopThread } from './thread-status'

describe('canStopThread', () => {
  it('allows stopping running threads', () => {
    expect(canStopThread({ status: 'running' })).toBe(true)
  })

  it('hides stop controls for terminal thread states', () => {
    expect(canStopThread({ status: 'completed' })).toBe(false)
    expect(canStopThread({ status: 'error' })).toBe(false)
    expect(canStopThread({ status: 'interrupted' })).toBe(false)
  })
})
