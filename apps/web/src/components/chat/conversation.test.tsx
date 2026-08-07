import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CONVERSATION_SKELETON_TURNS,
  Conversation,
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
    // Turns are bottom-anchored and the overflow is clipped at the top.
    expect(markup).toContain('justify-end')
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

  it('keeps exactly two user turns and fills the rest with assistant turns', () => {
    const user = CONVERSATION_SKELETON_TURNS.filter((t) => t.role === 'user')
    const assistant = CONVERSATION_SKELETON_TURNS.filter((t) => t.role === 'assistant')

    // The skeleton reads as a mostly-agent conversation with a couple of recent
    // user prompts, so the agent output dominates the placeholder.
    expect(user).toHaveLength(2)
    expect(assistant.length).toBeGreaterThan(user.length * 2)
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
