import { describe, expect, it } from 'vitest'
import { screenSharePoint } from './screen-share-pointer'

describe('screen share pointer mapping', () => {
  it('maps the displayed image and rejects letterboxing', () => {
    const rect = { left: 10, top: 20, width: 400, height: 400 }
    expect(screenSharePoint(rect, 1920, 1080, 210, 220)).toEqual({ x: 0.5, y: 0.5 })
    expect(screenSharePoint(rect, 1920, 1080, 210, 30)).toBeNull()
    expect(screenSharePoint(rect, 1920, 1080, 10, 107.5)).toEqual({ x: 0, y: 0 })
    expect(screenSharePoint(rect, 1920, 1080, 410, 332.5)).toEqual({ x: 1, y: 1 })
  })
  it('handles pillarboxing and clamps an ongoing drag', () => {
    const rect = { left: 0, top: 0, width: 400, height: 200 }
    expect(screenSharePoint(rect, 100, 100, 20, 100)).toBeNull()
    expect(screenSharePoint(rect, 100, 100, 20, 250, true)).toEqual({ x: 0, y: 1 })
  })
  it('rejects invalid dimensions and coordinates', () => {
    const rect = { left: 0, top: 0, width: 1, height: 1 }
    expect(screenSharePoint(rect, 0, 1, 0, 0)).toBeNull()
    expect(screenSharePoint(rect, 1, 1, Number.NaN, 0)).toBeNull()
  })
})
