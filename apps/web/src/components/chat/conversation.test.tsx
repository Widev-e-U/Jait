import { Children } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  CONVERSATION_SKELETON_TURNS,
  Conversation,
  computeNewTurnTailPadding,
  findConversationItemIndex,
  findPreviousMessageIndex,
  getPreviousMessagePreview,
  INITIAL_CONVERSATION_SCROLL_OFFSET,
  isInitialTranscriptFill,
  LOAD_MORE_SCROLL_THRESHOLD_PX,
  pickScrollAnchor,
  positionConversationAtBottom,
  resolvePrependScrollAdjustment,
  scrollAnchorDelta,
  shouldLoadOlderMessages,
  shouldShowPreviousMessagePreview,
  unwrapConversationChildKey,
} from './conversation'

describe('Conversation', () => {
  it('starts at the lowest available scroll position before the chat paints', () => {
    expect(INITIAL_CONVERSATION_SCROLL_OFFSET).toBe(Number.MAX_SAFE_INTEGER)
  })

  describe('findPreviousMessageIndex', () => {
    const items = [
      { index: 3, start: 0 },
      { index: 4, start: 400 },
      { index: 5, start: 900 },
    ]

    it('targets the top of the message the viewport is reading', () => {
      // Scrolled 50px into message 5 — jumping up reveals that message's start.
      expect(findPreviousMessageIndex(items, 950)).toBe(5)
      expect(findPreviousMessageIndex(items, 450)).toBe(4)
    })

    it('walks upward instead of re-targeting the message already at the top', () => {
      // Parked exactly on message 4 — jumping again must reach 3, not 4.
      expect(findPreviousMessageIndex(items, 400)).toBe(3)
    })

    it('falls back to the first rendered message while inside the leading padding', () => {
      expect(findPreviousMessageIndex(items, 4)).toBe(3)
    })

    it('has nothing to jump to at the very top', () => {
      expect(findPreviousMessageIndex(items, 0)).toBeNull()
      expect(findPreviousMessageIndex([], 500)).toBeNull()
    })

    describe('restricted to the user\'s own prompts', () => {
      // A realistic turn layout: prompt, reply, prompt, reply.
      const turns = [
        { index: 0, start: 0 },
        { index: 1, start: 200 },
        { index: 2, start: 900 },
        { index: 3, start: 1000 },
      ]
      const isUser = (index: number) => index % 2 === 0

      it('skips assistant replies and lands on the prompt that started the turn', () => {
        // Reading the second reply — jumping up goes to prompt 2, not reply 1.
        expect(findPreviousMessageIndex(turns, 1200, isUser)).toBe(2)
      })

      it('walks turn by turn on repeated jumps', () => {
        expect(findPreviousMessageIndex(turns, 900, isUser)).toBe(0)
        expect(findPreviousMessageIndex(turns, 0, isUser)).toBeNull()
      })

      it('never jumps down to a prompt that is still below the fold', () => {
        // Only assistant content above the viewport: nothing to jump up to.
        expect(findPreviousMessageIndex(turns, 500, (index) => index === 3)).toBeNull()
      })
    })
  })

  describe('previous message preview visibility', () => {
    it('stays hidden while the chat is at the bottom and auto-following', () => {
      expect(shouldShowPreviousMessagePreview({
        scrollTop: 4_000,
        previousMessageIndex: 2,
        isAtBottom: true,
        stickToBottom: true,
      })).toBe(false)
    })

    it('appears after the user scrolls upward away from auto-follow', () => {
      expect(shouldShowPreviousMessagePreview({
        scrollTop: 2_000,
        previousMessageIndex: 2,
        isAtBottom: false,
        stickToBottom: false,
      })).toBe(true)
    })
  })

  describe('getPreviousMessagePreview', () => {
    it('flattens multiline prompts into a single preview row', () => {
      expect(getPreviousMessagePreview(['First line\n\nSecond line'], 0)).toBe('First line Second line')
    })

    it('uses a readable fallback for text-less turns', () => {
      expect(getPreviousMessagePreview([''], 0)).toBe('Previous message')
      expect(getPreviousMessagePreview(undefined, null)).toBe('Previous message')
    })
  })

  describe('isInitialTranscriptFill', () => {
    it('treats the first batch of loaded history as an opening, not a new turn', () => {
      // Mounted empty while history loaded, then filled — opening the chat must
      // land at the bottom rather than smooth-scrolling the whole transcript.
      expect(isInitialTranscriptFill(true, 12)).toBe(true)
    })

    it('still top-aligns the prompt that starts a brand-new chat', () => {
      expect(isInitialTranscriptFill(true, 1)).toBe(false)
    })

    it('top-aligns every turn sent after the transcript is on screen', () => {
      expect(isInitialTranscriptFill(false, 12)).toBe(false)
      expect(isInitialTranscriptFill(false, 1)).toBe(false)
    })

    it('has nothing to skip for an empty transcript', () => {
      expect(isInitialTranscriptFill(true, 0)).toBe(false)
    })
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

  describe('history prepend compensation', () => {
    const baseline = {
      firstKey: 'm1',
      firstStart: 0,
    }

    it('ignores a live item appended while the history request is pending', () => {
      expect(resolvePrependScrollAdjustment({
        baseline,
        nextItems: [
          { key: 'm1', start: 0 },
          { key: 'm2', start: 200 },
          { key: 'm3', start: 400 },
          { key: 'live', start: 600 },
        ],
      })).toBeNull()
    })

    it('compensates only items prepended above when a live append lands too', () => {
      expect(resolvePrependScrollAdjustment({
        baseline,
        nextItems: [
          { key: 'old-1', start: 0 },
          { key: 'old-2', start: 100 },
          { key: 'm1', start: 250 },
          { key: 'm2', start: 450 },
          { key: 'm3', start: 650 },
          { key: 'live', start: 850 },
        ],
      })).toBe(250)
    })

    it('detects a prepend even when another item disappears in the same commit', () => {
      expect(resolvePrependScrollAdjustment({
        baseline,
        nextItems: [
          { key: 'old-1', start: 0 },
          { key: 'm1', start: 140 },
          { key: 'm2', start: 340 },
        ],
      })).toBe(140)
    })
  })
})

describe('locating the message to anchor at the top', () => {
  // Mirrors the real call shape: the transcript is passed as a nested array of
  // keyed messages, followed by the conditionally-rendered queue.
  const conversationChildren = (ids: string[], queue = false) =>
    Children.toArray([ids.map((id) => <div key={id} />), queue ? <div key="queue" /> : false])

  it('finds a message whose key React rewrote when flattening the children', () => {
    // The regression: `Children.toArray` turns key `m-2` into `.0:$m-2`, so
    // comparing the raw message id against the rendered key never matched and
    // the whole new-turn top anchoring silently did nothing.
    const items = conversationChildren(['m-1', 'm-2', 'm-3'])

    expect(String((items[1] as { key: string }).key)).not.toBe('m-2')
    expect(findConversationItemIndex(items, 'm-2')).toBe(1)
    expect(findConversationItemIndex(items, 'm-3')).toBe(2)
  })

  it('still finds the newest message when the queue renders below it', () => {
    expect(findConversationItemIndex(conversationChildren(['m-1', 'm-2'], true), 'm-2')).toBe(1)
  })

  it('reports -1 for an unknown or absent target', () => {
    expect(findConversationItemIndex(conversationChildren(['m-1']), 'm-9')).toBe(-1)
    expect(findConversationItemIndex(conversationChildren(['m-1']), null)).toBe(-1)
    expect(findConversationItemIndex([], 'm-1')).toBe(-1)
  })

  it('restores keys that React escaped', () => {
    // `:` and `=` are the two characters toArray escapes on the way in, so a
    // round trip through React is the only honest check here.
    const weird = '019f:99=80'
    const [child] = conversationChildren([weird])
    expect(unwrapConversationChildKey(String((child as { key: string }).key))).toBe(weird)

    expect(unwrapConversationChildKey('.$m-1')).toBe('m-1')
    // Positional keys (an unkeyed child) have no original key to recover.
    expect(unwrapConversationChildKey('.0:1')).toBe('.0:1')
    expect(unwrapConversationChildKey('m-1')).toBe('m-1')
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

