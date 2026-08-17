import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

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
  CONVERSATION_SKELETON_TURNS,
  Conversation,
  computeMinimapLineShape,
  computeMinimapRows,
  computeNewTurnTailPadding,
  computeMinimapScrollTop,
  type MinimapBlock,
  INITIAL_CONVERSATION_SCROLL_OFFSET,
  LOAD_MORE_SCROLL_THRESHOLD_PX,
  pickScrollAnchor,
  positionConversationAtBottom,
  scrollAnchorDelta,
  shouldLoadOlderMessages,
} from './conversation'

describe('Conversation', () => {
  it('starts at the lowest available scroll position before the chat paints', () => {
    expect(INITIAL_CONVERSATION_SCROLL_OFFSET).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('positions the scroll element at the bottom synchronously', () => {
    const scrollElement = { scrollHeight: 640, scrollTop: 0 }

    positionConversationAtBottom(scrollElement)

    expect(scrollElement.scrollTop).toBe(640)
  })

  it('shows a chat skeleton until bottom positioning completes', () => {
    const markup = renderToStaticMarkup(
      <Conversation messageContents={['Latest message']}>
        <div>Latest message</div>
      </Conversation>,
    )

    expect(markup).toContain('data-testid="conversation-positioning-skeleton"')
    expect(markup).toContain('Preparing conversation')
    expect(markup).toContain('animate-pulse')
    expect(markup).toContain('visibility:hidden')
  })

  it('renders every skeleton turn so the placeholder fills the viewport height', () => {
    const markup = renderToStaticMarkup(
      <Conversation messageContents={['Latest message']}>
        <div>Latest message</div>
      </Conversation>,
    )

    // One pulse wrapper per turn — too few and the skeleton leaves dead space
    // above it on a tall screen.
    const pulses = markup.match(/animate-pulse/g) ?? []
    expect(pulses).toHaveLength(CONVERSATION_SKELETON_TURNS.length)
    // The first and last user turns pin the skeleton to both viewport edges.
    expect(markup).toContain('justify-between')
    expect(markup).toContain('overflow-hidden')
  })
})

describe('shouldLoadOlderMessages', () => {
  it('requests earlier messages when the loaded window cannot scroll at all', () => {
    // The regression: a chat opens on a tiny message window that often does not
    // overflow the viewport. With no overflow the container emits no scroll
    // events, so a scroll-only trigger never fires and scrolling up produces
    // nothing — no matter how much history the session actually has.
    expect(shouldLoadOlderMessages({ scrollTop: 0, scrollHeight: 400, clientHeight: 900 })).toBe(true)
  })

  it('treats an exactly-fitting window as unscrollable', () => {
    expect(shouldLoadOlderMessages({ scrollTop: 0, scrollHeight: 900, clientHeight: 900 })).toBe(true)
  })

  it('requests earlier messages near the top of a scrollable list', () => {
    expect(shouldLoadOlderMessages({
      scrollTop: LOAD_MORE_SCROLL_THRESHOLD_PX - 1,
      scrollHeight: 5000,
      clientHeight: 900,
    })).toBe(true)
  })

  it('stays quiet while the user is reading below the threshold', () => {
    expect(shouldLoadOlderMessages({
      scrollTop: LOAD_MORE_SCROLL_THRESHOLD_PX,
      scrollHeight: 5000,
      clientHeight: 900,
    })).toBe(false)
    expect(shouldLoadOlderMessages({ scrollTop: 4100, scrollHeight: 5000, clientHeight: 900 })).toBe(false)
  })

  it('ignores sub-pixel overflow that cannot actually be scrolled', () => {
    expect(shouldLoadOlderMessages({ scrollTop: 0, scrollHeight: 900.4, clientHeight: 900 })).toBe(true)
  })
})

describe('conversation skeleton proportions', () => {
  it('gives assistant turns more lines than user turns', () => {
    const user = CONVERSATION_SKELETON_TURNS.filter((t) => t.role === 'user')
    const assistant = CONVERSATION_SKELETON_TURNS.filter((t) => t.role === 'assistant')

    // A prompt is a line or two; a reply is several. Equal blocks read as a
    // generic loading list and visibly reflow once real messages arrive.
    expect(Math.max(...user.map((t) => t.lines)))
      .toBeLessThan(Math.min(...assistant.map((t) => t.lines)))
  })

  it('fills the viewport with alternating turns bounded by user messages', () => {
    const roles = CONVERSATION_SKELETON_TURNS.map((turn) => turn.role)

    expect(roles.length).toBeGreaterThanOrEqual(7)
    expect(roles[0]).toBe('user')
    expect(roles.at(-1)).toBe('user')
    expect(roles.every((role, index) => index === 0 || role !== roles[index - 1])).toBe(true)
  })

  it('ends on a user turn (the most recent prompt sits next to the composer)', () => {
    // Bottom-anchored, so the last entry is the one next to the composer.
    expect(CONVERSATION_SKELETON_TURNS.at(-1)?.role).toBe('user')
  })

  it('renders a scroll container that keeps mobile pull-to-refresh out of the chat surface', () => {
    const markup = renderToStaticMarkup(
      <Conversation messageContents={['hello']}>
        <div>hello</div>
      </Conversation>,
    )

    // Scroll container uses the overflow-y-auto utility class...
    expect(markup).toContain('overflow-y-auto')
    // ...plus inline mobile overscroll-containment styles.
    expect(markup).toContain('-webkit-overflow-scrolling:touch')
    expect(markup).toContain('overscroll-behavior-y:contain')
    expect(markup).toContain('touch-action:pan-y')
  })

  it('keeps the chat surface mounted and shows a sticky loader while loading more chat state', () => {
    const markup = renderToStaticMarkup(
      <Conversation loading loadingLabel="Loading chat" messageContents={['hello']}>
        <div>hello</div>
      </Conversation>,
    )

    // The scroll container stays mounted (existing messages remain in the DOM tree)...
    expect(markup).toContain('overflow-y-auto')
    // ...a reserved sizer slot for the message is rendered...
    expect(markup).toContain('height:120px')
    // ...and the sticky loading indicator is shown.
    expect(markup).toContain('Loading chat')
    expect(markup).toContain('sticky top-3')
  })

})

describe('scroll anchoring', () => {
  it('anchors to the first item still on screen, keeping its partial offset', () => {
    // User is partway through the second message: the first is fully scrolled
    // past, the second straddles the top edge.
    expect(pickScrollAnchor([
      { key: 'm1', top: -420, height: 300 },
      { key: 'm2', top: -120, height: 260 },
      { key: 'm3', top: 140, height: 200 },
    ])).toEqual({ key: 'm2', offset: -120 })
  })

  it('anchors to the top item when the list starts below the fold', () => {
    expect(pickScrollAnchor([
      { key: 'm1', top: 0, height: 100 },
      { key: 'm2', top: 100, height: 100 },
    ])).toEqual({ key: 'm1', offset: 0 })
  })

  it('ignores items with no key and returns null when nothing is on screen', () => {
    expect(pickScrollAnchor([{ key: '', top: 10, height: 50 }])).toBeNull()
    expect(pickScrollAnchor([{ key: 'm1', top: -300, height: 100 }])).toBeNull()
    expect(pickScrollAnchor([])).toBeNull()
  })

  it('corrects by exactly the amount the anchored item moved', () => {
    // 900px of older messages prepended above the anchor: it now sits 900px
    // lower, so scrollTop must advance by 900 to leave the view unchanged.
    expect(scrollAnchorDelta(780, -120)).toBe(900)
    // A streaming card above the viewport grew by 40px.
    expect(scrollAnchorDelta(-80, -120)).toBe(40)
  })

  it('does not write scrollTop for sub-pixel drift', () => {
    // Rounding jitter every animation frame would itself read as flicker.
    expect(scrollAnchorDelta(-120.2, -120)).toBe(0)
    expect(scrollAnchorDelta(-120, -120)).toBe(0)
  })
})

describe('computeNewTurnTailPadding', () => {
  it('reserves the rest of the viewport below a newly sent user message', () => {
    expect(computeNewTurnTailPadding({
      viewportHeight: 800,
      messageStart: 4_000,
      totalSize: 4_120,
    })).toBe(680)
  })

  it('shrinks to zero once real reply content reaches the viewport bottom', () => {
    expect(computeNewTurnTailPadding({
      viewportHeight: 800,
      messageStart: 4_000,
      totalSize: 4_800,
    })).toBe(0)
    expect(computeNewTurnTailPadding({
      viewportHeight: 800,
      messageStart: 4_000,
      totalSize: 5_200,
    })).toBe(0)
  })
})

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

describe('computeMinimapScrollTop', () => {
  // A 10 000px transcript in an 800px viewport. The whole document is scaled
  // onto the rail's content band (the full 800px here), so the pointer is
  // measured against that band.
  const rail = { contentHeight: 800, viewportHeight: 800, totalSize: 10_000 }

  it('centers the viewport on the pressed point', () => {
    // Pressed halfway down the content band → the middle of the transcript,
    // offset up by half an indicator so the pressed content sits mid-viewport.
    expect(computeMinimapScrollTop({ pointerOffset: 400, ...rail })).toBeCloseTo(4600)
  })

  it('clamps a scrub above the rail to the top of the transcript', () => {
    expect(computeMinimapScrollTop({ pointerOffset: 0, ...rail })).toBe(0)
    expect(computeMinimapScrollTop({ pointerOffset: -50, ...rail })).toBe(0)
  })

  it('clamps a scrub past the end to the last screenful', () => {
    // Never past `totalSize - viewportHeight`, so the final scrub still shows
    // a full screen of transcript instead of empty space.
    expect(computeMinimapScrollTop({ pointerOffset: 800, ...rail })).toBeCloseTo(9200)
    expect(computeMinimapScrollTop({ pointerOffset: 5000, ...rail })).toBeCloseTo(9200)
  })

  it('stays at the top when the transcript fits on screen or the band has no height', () => {
    expect(computeMinimapScrollTop({ pointerOffset: 400, contentHeight: 800, viewportHeight: 800, totalSize: 800 })).toBe(0)
    expect(computeMinimapScrollTop({ pointerOffset: 400, contentHeight: 0, viewportHeight: 800, totalSize: 10_000 })).toBe(0)
  })
})

describe('computeMinimapRows', () => {
  const block = (start: number, end: number, role: 'user' | 'agent', widths = [1]): MinimapBlock =>
    ({ start, end, role, widths })

  it('places a message where the document actually has it', () => {
    // 10 000px document, 800px rail → every rail px is 12.5 document px. The
    // user turn owns 5 000–6 000, so its rows must land on 400–480.
    const rows = computeMinimapRows({
      blocks: [block(0, 5_000, 'agent'), block(5_000, 6_000, 'user'), block(6_000, 10_000, 'agent')],
      viewportHeight: 800,
      totalSize: 10_000,
    })
    const userRows = rows.filter((r) => r.isUser)
    expect(userRows.length).toBeGreaterThan(0)
    expect(Math.min(...userRows.map((r) => r.y))).toBeGreaterThanOrEqual(400)
    expect(Math.max(...userRows.map((r) => r.y))).toBeLessThan(480)
  })

  it('renders one minimap mark per actual nonblank wrapped line', () => {
    const rows = computeMinimapRows({
      blocks: [block(0, 900, 'agent', [1, 0.75, 0, 0.5])],
      viewportHeight: 300,
      totalSize: 900,
    })

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.y)).toEqual([0, 75, 225])
    expect(rows.map((row) => row.width)).toEqual([1, 0.75, 0.5])
  })

  it('keeps a rail row and the scroll it scrubs to pointing at the same message', () => {
    const blocks = [block(0, 5_000, 'agent'), block(5_000, 6_000, 'user'), block(6_000, 10_000, 'agent')]
    const rows = computeMinimapRows({ blocks, viewportHeight: 800, totalSize: 10_000 })
    const userRow = rows.find((r) => r.isUser)!
    // Scrubbing that row centers the viewport on it, so the user turn is on
    // screen — the exact failure the document-space mapping exists to prevent.
    const scrollTop = computeMinimapScrollTop({
      pointerOffset: userRow.y,
      contentHeight: 800,
      viewportHeight: 800,
      totalSize: 10_000,
    })
    expect(scrollTop).toBeLessThanOrEqual(6_000)
    expect(scrollTop + 800).toBeGreaterThanOrEqual(5_000)
  })

  it('does not stretch a transcript shorter than the rail', () => {
    // 600px of document in an 800px rail: rows stop at 600, leaving the rest
    // of the rail empty rather than zooming the content up to fill it.
    const rows = computeMinimapRows({
      blocks: [block(0, 600, 'agent')],
      viewportHeight: 800,
      totalSize: 600,
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(Math.max(...rows.map((r) => r.y))).toBeLessThan(600)
  })

  it('preserves each nonblank line when the document is compressed', () => {
    const rows = computeMinimapRows({
      blocks: [block(0, 1_000, 'agent', [1, 0, 1, 0, 1, 0, 1, 0])],
      viewportHeight: 80,
      totalSize: 1_000,
    })
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.width === 1)).toBe(true)
  })

  it('returns nothing without geometry or content', () => {
    expect(computeMinimapRows({ blocks: [], viewportHeight: 800, totalSize: 10_000 })).toEqual([])
    expect(computeMinimapRows({ blocks: [block(0, 100, 'user')], viewportHeight: 0, totalSize: 100 })).toEqual([])
    expect(computeMinimapRows({ blocks: [block(0, 100, 'user')], viewportHeight: 800, totalSize: 0 })).toEqual([])
  })
})
