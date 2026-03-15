import { describe, expect, it } from 'vitest'
import {
  clampFloatingScreenSharePosition,
  clampFloatingScreenShareSize,
  getDefaultFloatingScreenSharePosition,
} from './floating-screen-share'

describe('floating screen share helpers', () => {
  it('clamps the panel size to fit small mobile viewports', () => {
    expect(
      clampFloatingScreenShareSize({
        size: { w: 420, h: 320 },
        viewport: { width: 390, height: 844 },
      }),
    ).toEqual({ w: 358, h: 320 })
  })

  it('keeps the default position on screen after sizing', () => {
    expect(
      getDefaultFloatingScreenSharePosition({
        size: { w: 358, h: 320 },
        viewport: { width: 390, height: 844 },
      }),
    ).toEqual({ x: 16, y: 508 })
  })

  it('clamps dragged positions to the visible viewport', () => {
    expect(
      clampFloatingScreenSharePosition({
        position: { x: 900, y: -40 },
        size: { w: 358, h: 320 },
        viewport: { width: 390, height: 844 },
      }),
    ).toEqual({ x: 32, y: 0 })
  })
})
