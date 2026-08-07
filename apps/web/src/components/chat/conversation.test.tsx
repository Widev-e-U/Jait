import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CONVERSATION_SKELETON_TURNS,
  Conversation,
  INITIAL_CONVERSATION_SCROLL_OFFSET,
  pickScrollAnchor,
  positionConversationAtBottom,
  scrollAnchorDelta,
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
    // Turns are bottom-anchored and the overflow is clipped at the top.
    expect(markup).toContain('justify-end')
    expect(markup).toContain('overflow-hidden')
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

  it('alternates prompt then reply and ends on an assistant turn', () => {
    // Bottom-anchored, so the last entry is the one next to the composer.
    expect(CONVERSATION_SKELETON_TURNS.at(-1)?.role).toBe('assistant')
    CONVERSATION_SKELETON_TURNS.forEach((turn, i) => {
      expect(turn.role).toBe(i % 2 === 0 ? 'user' : 'assistant')
    })
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
