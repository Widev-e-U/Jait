import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Conversation, INITIAL_CONVERSATION_SCROLL_OFFSET, positionConversationAtBottom } from './conversation'

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
