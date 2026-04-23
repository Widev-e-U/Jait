import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Conversation } from './conversation'

describe('Conversation', () => {
  it('renders a scroll container that keeps mobile pull-to-refresh out of the chat surface', () => {
    const markup = renderToStaticMarkup(
      <Conversation messageContents={['hello']}>
        <div>hello</div>
      </Conversation>,
    )

    expect(markup).toContain('overflow-y:auto')
    expect(markup).toContain('-webkit-overflow-scrolling:touch')
    expect(markup).toContain('overscroll-behavior-y:contain')
    expect(markup).toContain('touch-action:pan-y')
  })
})
