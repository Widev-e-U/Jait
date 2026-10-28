import { describe, expect, it } from 'vitest'
import { constrainBrowserWindow, resizeBrowserWindow } from './browser-window'

const frame = { width: 1000, height: 700, top: 12 }
const box = { left: 100, top: 100, width: 500, height: 300 }
describe('browser window boundaries', () => {
  it('keeps moved windows inside the chat and below the mobile header', () => {
    expect(constrainBrowserWindow({ ...box, left: -900, top: 900 }, frame)).toEqual({ ...box, left: 12, top: 388 })
    expect(constrainBrowserWindow({ ...box, top: 0 }, { ...frame, top: 60 }).top).toBe(60)
  })
  it('fits an existing window after the chat shrinks', () => {
    expect(constrainBrowserWindow(box, { width: 280, height: 250, top: 12 })).toEqual({ left: 12, top: 12, width: 256, height: 226 })
  })
  it('clamps every resize handle without crossing the opposite edge or frame', () => {
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      for (const delta of [-2000, 2000]) {
        const result = resizeBrowserWindow(box, edge, delta, delta, frame)
        expect(result.left).toBeGreaterThanOrEqual(12)
        expect(result.top).toBeGreaterThanOrEqual(12)
        expect(result.left + result.width).toBeLessThanOrEqual(988)
        expect(result.top + result.height).toBeLessThanOrEqual(688)
        expect(result.width).toBeGreaterThanOrEqual(320)
        expect(result.height).toBeGreaterThanOrEqual(180)
        if (edge.includes('w')) expect(result.left + result.width).toBe(600)
        if (edge.includes('n')) expect(result.top + result.height).toBe(400)
      }
    }
  })
})


describe('browser window resize regressions', () => {
  it.each(['n', 's', 'e', 'w'])('changes only the intended dimension for the %s edge', edge => {
    const result = resizeBrowserWindow(box, edge, 40, 30, frame)
    if (edge === 'n' || edge === 's') {
      expect(result.left).toBe(box.left)
      expect(result.width).toBe(box.width)
    } else {
      expect(result.top).toBe(box.top)
      expect(result.height).toBe(box.height)
    }
    expect(result).not.toEqual(box)
  })

  it('allows resizing in a chat smaller than the normal minimum window', () => {
    const smallFrame = { width: 280, height: 250, top: 60 }
    const fitted = constrainBrowserWindow(box, smallFrame)
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const resized = resizeBrowserWindow(fitted, edge, 2000, -2000, smallFrame)
      expect(resized).toEqual({ left: 12, top: 60, width: 256, height: 178 })
    }
  })
})
