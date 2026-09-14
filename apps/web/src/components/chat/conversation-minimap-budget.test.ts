import { describe, expect, it, vi } from 'vitest'
import { prepareWithSegments } from '@chenglou/pretext'
import { computeMinimapLineShape, computeMinimapMessageShape } from './conversation-minimap'

vi.mock('@chenglou/pretext', () => ({
  prepareWithSegments: vi.fn(() => { throw new Error('No canvas') }),
  walkLineRanges: vi.fn(),
}))

describe('minimap work bounds', () => {
  it('does not send an oversized message through canvas measurement on resize', () => {
    vi.mocked(prepareWithSegments).mockClear()
    const text = 'Large pasted output. '.repeat(100000)
    for (const width of [700, 450, 220]) {
      expect(computeMinimapLineShape(text, width).length).toBeLessThanOrEqual(4000)
    }
    expect(prepareWithSegments).not.toHaveBeenCalled()
  })

  it('enforces the row limit across all segments of a message', () => {
    const shape = computeMinimapMessageShape({
      segments: Array.from({ length: 20 }, () => ({ type: 'text', content: 'line\n'.repeat(1000) })),
    }, '', 220)
    expect(shape.widths.length).toBeLessThanOrEqual(4000)
    expect(shape.errorLines).toHaveLength(shape.widths.length)
    expect(shape.userLines).toHaveLength(shape.widths.length)
  })
})
