import { describe, expect, it, vi } from 'vitest'

// jsdom has no canvas, so pretext's real text measurement throws. Mock it with a
// deterministic char-width model (8px per char → 64 chars per 512px line) so the
// minimap line-shape tests can assert exact, stable widths.
vi.mock('@chenglou/pretext', () => {
  const CHAR_W = 8
  return {
    prepareWithSegments: (text: string) => ({ __text: text }),
    walkLineRanges: (
      prepared: { __text: string },
      width: number,
      onLine: (line: { width: number }) => void,
    ) => {
      const charsPerLine = Math.max(Math.floor(width / CHAR_W), 1)
      for (const paragraph of prepared.__text.split('\n')) {
        if (paragraph.length === 0) {
          onLine({ width: 0 })
          continue
        }
        let remaining = paragraph.length
        while (remaining > 0) {
          const n = Math.min(remaining, charsPerLine)
          onLine({ width: n * CHAR_W })
          remaining -= n
        }
      }
    },
  }
})
import {
  canReuseMinimapMessageShape,
  computeMinimapLayout,
  computeMinimapLineShape,
  computeMinimapMessageShape,
  computeMinimapMessageWrapWidth,
  computeMinimapRailOffset,
  computeMinimapScrollTop,
  minimapDocumentToContent,
  type MinimapBlock,
} from './conversation-minimap'

describe('computeMinimapLineShape', () => {
  it('turns a short paragraph into one partial-width line', () => {
    const [width, ...rest] = computeMinimapLineShape('a'.repeat(32), 512)

    expect(width).toBeCloseTo(0.5)
    expect(rest).toEqual([])
  })

  it('wraps a long paragraph into full-width lines plus a remainder', () => {
    // 64 chars fill a 512px line (8px/char), so 160 chars is two full lines
    // plus a half line.
    expect(computeMinimapLineShape('a'.repeat(160), 512)).toEqual([1, 1, 0.5])
  })

  it('keeps blank lines blank so paragraph gaps stay visible', () => {
    expect(computeMinimapLineShape('hi\n\nthere', 512)).toEqual([
      expect.any(Number),
      0,
      expect.any(Number),
    ])
  })

  it('gives text-less turns a stub so tool-only messages still show up', () => {
    expect(computeMinimapLineShape('', 512)).toEqual([0.3])
    expect(computeMinimapLineShape('   \n  ', 512)).toEqual([0.3])
  })

  it('bounds the shape of a huge paste', () => {
    expect(computeMinimapLineShape('a'.repeat(2_000_000), 512).length).toBeLessThanOrEqual(4000)
  })
})

describe('computeMinimapMessageShape', () => {
  it('includes interleaved thinking and tool-card rows instead of dropping them', () => {
    const message = {
      role: 'agent' as const,
      segments: [
        { type: 'text', content: 'before' },
        { type: 'thinking', content: 'checking the implementation' },
        { type: 'toolGroup', callIds: ['read-1', 'read-2'] },
        { type: 'text', content: 'after' },
        { type: 'error', content: 'failed' },
      ],
      toolCalls: [
        { callId: 'read-1', status: 'success' },
        { callId: 'read-2', status: 'success' },
      ],
    }

    const shape = computeMinimapMessageShape(message, 'before\nafter', 512)

    expect(shape.widths).toHaveLength(6)
    expect(shape.errorLines).toEqual([false, false, false, false, false, true])
  })

  it('wraps agent previews at the same 85 percent width as rendered agent messages', () => {
    const wrapWidth = computeMinimapMessageWrapWidth(512, 'agent')
    const shape = computeMinimapMessageShape({ role: 'agent' }, 'a'.repeat(115), wrapWidth)

    expect(wrapWidth).toBeCloseTo(512 * 0.85)
    expect(shape.widths).toHaveLength(3)
    expect(computeMinimapMessageWrapWidth(512, 'user')).toBeCloseTo(512 * 0.85 - 32)
  })

  it('invalidates a cached shape when the transcript width changes', () => {
    const message = { role: 'agent' as const, content: 'wrapped text' }
    expect(canReuseMinimapMessageShape(
      { text: 'wrapped text', message, wrapWidth: 512 },
      { text: 'wrapped text', message, wrapWidth: 256 },
    )).toBe(false)
  })
})

describe('computeMinimapLayout', () => {
  const block = (start: number, end: number, role: 'user' | 'agent', widths = [1]): MinimapBlock =>
    ({ start, end, role, widths })

  it('stacks every line at the same pitch regardless of conversation length', () => {
    const short = computeMinimapLayout({ blocks: [block(0, 600, 'agent', [1, 0.8, 0.6])], rowPitch: 3 })
    const long = computeMinimapLayout({
      blocks: [block(0, 60_000, 'agent', Array.from({ length: 3 }, () => 1))],
      rowPitch: 3,
    })

    expect(short.rows.map((row) => row.y)).toEqual([0, 3, 6])
    expect(long.rows.map((row) => row.y)).toEqual([0, 3, 6])
    expect(short.contentHeight).toBe(9)
    expect(long.contentHeight).toBe(9)
  })

  it('renders one mark per nonblank line while blank lines keep their slot', () => {
    const { rows, contentHeight } = computeMinimapLayout({
      blocks: [block(0, 900, 'agent', [1, 0.75, 0, 0.5])],
      rowPitch: 3,
    })

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.y)).toEqual([0, 3, 9])
    expect(rows.map((row) => row.height)).toEqual([3, 3, 3])
    expect(rows.map((row) => row.width)).toEqual([1, 0.75, 0.5])
    expect(contentHeight).toBe(12)
  })

  it('does not open gaps between messages with tall non-prose content', () => {
    // The agent turn is 10x taller in the document than the user turn but has
    // the same line count, so on the rail they are the same size and adjacent.
    const { rows } = computeMinimapLayout({
      blocks: [block(0, 5_000, 'agent', [1, 1]), block(5_000, 5_500, 'user', [0.9, 0.9])],
      rowPitch: 3,
    })
    expect(rows.map((row) => ({ y: row.y, isUser: row.isUser }))).toEqual([
      { y: 0, isUser: false },
      { y: 3, isUser: false },
      { y: 6, isUser: true },
      { y: 9, isUser: true },
    ])
  })

  it('marks only error-segment lines as errors', () => {
    const { rows } = computeMinimapLayout({
      blocks: [{ start: 0, end: 120, role: 'agent', widths: [1, 0.8, 0.6], errorStart: 2 }],
    })
    expect(rows.map((row) => row.isError)).toEqual([false, false, true])
  })

  it('pairs each message document band with the rail band its lines occupy', () => {
    const { spans } = computeMinimapLayout({
      blocks: [block(0, 5_000, 'agent', [1, 1]), block(5_000, 6_000, 'user', [0.9])],
      rowPitch: 3,
    })
    expect(spans).toEqual([
      { documentStart: 0, documentEnd: 5_000, contentStart: 0, contentEnd: 6 },
      { documentStart: 5_000, documentEnd: 6_000, contentStart: 6, contentEnd: 9 },
    ])
  })

  it('returns nothing without content', () => {
    expect(computeMinimapLayout({ blocks: [] })).toEqual({ rows: [], contentHeight: 0, spans: [] })
    expect(computeMinimapLayout({ blocks: [{ start: 0, end: 100, role: 'user', widths: [] }] }).rows).toEqual([])
    expect(computeMinimapLayout({ blocks: [block(100, 100, 'user')] }).rows).toEqual([])
  })
})

describe('computeMinimapRailOffset', () => {
  it('never pans a preview that fits the rail', () => {
    expect(computeMinimapRailOffset({ contentHeight: 300, viewportHeight: 800, scrollTop: 0, totalSize: 10_000 })).toBe(0)
    expect(computeMinimapRailOffset({ contentHeight: 300, viewportHeight: 800, scrollTop: 9_200, totalSize: 10_000 })).toBe(0)
  })

  it('pans an overflowing preview in step with the transcript', () => {
    const rail = { contentHeight: 2_400, viewportHeight: 800, totalSize: 10_000 }
    expect(computeMinimapRailOffset({ ...rail, scrollTop: 0 })).toBe(0)
    // Halfway through the scrollable range → halfway through the overflow.
    expect(computeMinimapRailOffset({ ...rail, scrollTop: 4_600 })).toBeCloseTo(800)
    // Last screenful → the bottom of the preview is on the rail.
    expect(computeMinimapRailOffset({ ...rail, scrollTop: 9_200 })).toBeCloseTo(1_600)
  })
})

describe('computeMinimapScrollTop', () => {
  const block = (start: number, end: number, role: 'user' | 'agent', widths = [1]): MinimapBlock =>
    ({ start, end, role, widths })
  // A 10 000px transcript in an 800px viewport whose preview fits the rail.
  const { spans } = computeMinimapLayout({
    blocks: [block(0, 10_000, 'agent', Array.from({ length: 100 }, () => 1))],
    rowPitch: 3,
  })
  const rail = { railOffset: 0, spans, viewportHeight: 800, totalSize: 10_000 }

  it('centers the viewport on the pressed point', () => {
    // Halfway down the 300px preview → the middle of the transcript, offset up
    // by half a screen so the pressed content sits mid-viewport.
    expect(computeMinimapScrollTop({ pointerOffset: 150, ...rail })).toBeCloseTo(4_600)
  })

  it('clamps a scrub above the rail to the top of the transcript', () => {
    expect(computeMinimapScrollTop({ pointerOffset: 0, ...rail })).toBe(0)
    expect(computeMinimapScrollTop({ pointerOffset: -50, ...rail })).toBe(0)
  })

  it('clamps a scrub past the end of the preview to the last screenful', () => {
    // Below the preview lines is empty rail, and it still means "the end".
    expect(computeMinimapScrollTop({ pointerOffset: 300, ...rail })).toBeCloseTo(9_200)
    expect(computeMinimapScrollTop({ pointerOffset: 780, ...rail })).toBeCloseTo(9_200)
  })

  it('resolves a scrub through the rail pan offset when the preview overflows', () => {
    const long = computeMinimapLayout({
      blocks: [block(0, 10_000, 'agent', Array.from({ length: 800 }, () => 1))],
      rowPitch: 3,
    })
    // The preview is 2 400px tall; panned by 1 600px the rail top shows content
    // offset 1 600 → two thirds through the transcript.
    const scrollTop = computeMinimapScrollTop({
      pointerOffset: 0,
      railOffset: 1_600,
      spans: long.spans,
      viewportHeight: 800,
      totalSize: 10_000,
    })
    expect(scrollTop).toBeCloseTo(10_000 * (1_600 / 2_400) - 400)
  })

  it('stays at the top when there is nothing laid out', () => {
    expect(computeMinimapScrollTop({ pointerOffset: 400, railOffset: 0, spans: [], viewportHeight: 800, totalSize: 10_000 })).toBe(0)
  })

  it('keeps a rail row and the scroll it scrubs to pointing at the same message', () => {
    const blocks = [block(0, 5_000, 'agent'), block(5_000, 6_000, 'user'), block(6_000, 10_000, 'agent')]
    const layout = computeMinimapLayout({ blocks })
    const userRow = layout.rows.find((r) => r.isUser)!
    const scrollTop = computeMinimapScrollTop({
      pointerOffset: userRow.y,
      railOffset: 0,
      spans: layout.spans,
      viewportHeight: 800,
      totalSize: 10_000,
    })
    expect(scrollTop).toBeLessThanOrEqual(6_000)
    expect(scrollTop + 800).toBeGreaterThanOrEqual(5_000)
  })
})

describe('minimapDocumentToContent', () => {
  const spans = [
    { documentStart: 0, documentEnd: 5_000, contentStart: 0, contentEnd: 6 },
    { documentStart: 5_000, documentEnd: 6_000, contentStart: 6, contentEnd: 9 },
  ]

  it('maps a document offset onto the rail band of the message that owns it', () => {
    expect(minimapDocumentToContent(0, spans)).toBe(0)
    expect(minimapDocumentToContent(2_500, spans)).toBeCloseTo(3)
    expect(minimapDocumentToContent(5_500, spans)).toBeCloseTo(7.5)
  })

  it('clamps outside the laid-out document', () => {
    expect(minimapDocumentToContent(-100, spans)).toBe(0)
    expect(minimapDocumentToContent(99_999, spans)).toBe(9)
    expect(minimapDocumentToContent(100, [])).toBe(0)
  })
})
