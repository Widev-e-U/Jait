import { describe, expect, it } from 'vitest'
import { ScreenShareTouchPointer } from './screen-share-touch'

describe('screen-share touch pointer', () => {
  it('moves relative to the rendered video and taps at the current cursor', () => {
    const pointer = new ScreenShareTouchPointer()
    expect(pointer.begin(1, 100, 100)).toBe(true)
    expect(pointer.move(1, 160, 130, 300, 150)).toEqual({ x: 0.7, y: 0.7 })
    expect(pointer.end(1)).toBeNull()
    expect(pointer.begin(2, 20, 20)).toBe(true)
    expect(pointer.end(2)).toEqual({ x: 0.7, y: 0.7 })
  })

  it('clamps at the image edge and does not click on cancel or another finger', () => {
    const pointer = new ScreenShareTouchPointer()
    expect(pointer.begin(1, 100, 100)).toBe(true)
    expect(pointer.begin(2, 200, 200)).toBe(false)
    expect(pointer.move(2, 300, 300, 100, 100)).toBeNull()
    expect(pointer.move(1, 400, -200, 100, 100)).toEqual({ x: 1, y: 0 })
    pointer.cancel(2)
    expect(pointer.end(2)).toBeNull()
    pointer.cancel(1)
    expect(pointer.end(1)).toBeNull()
    pointer.reset()
    expect(pointer.position).toEqual({ x: 0.5, y: 0.5 })
  })

  it('treats slight finger jitter as a tap but not a completed swipe', () => {
    const pointer = new ScreenShareTouchPointer()
    pointer.begin(1, 10, 10)
    pointer.move(1, 13, 14, 200, 100)
    expect(pointer.end(1)).toEqual({ x: 0.515, y: 0.54 })
    pointer.begin(2, 10, 10)
    pointer.move(2, 30, 10, 200, 100)
    pointer.move(2, 10, 10, 200, 100)
    expect(pointer.end(2)).toBeNull()
  })
})
