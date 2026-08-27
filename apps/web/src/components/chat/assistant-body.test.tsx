import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AssistantBody } from './assistant-body'

describe('AssistantBody message-part reveal', () => {
  it('height-reveals text, error, and steering segments', () => {
    const markup = renderToStaticMarkup(
      <AssistantBody
        segments={[
          { type: 'text', content: 'Answer text' },
          { type: 'error', content: 'Something failed' },
          { type: 'steering', content: 'Try another path' },
        ]}
      />,
    )

    expect(markup.match(/class="chat-message-part-reveal"/g)).toHaveLength(3)
    expect(markup.match(/chat-message-part-reveal-inner/g)).toHaveLength(3)
  })

  it('height-reveals the empty streaming indicator', () => {
    const markup = renderToStaticMarkup(
      <AssistantBody segments={[]} isStreaming />,
    )

    expect(markup).toContain('class="chat-message-part-reveal"')
    expect(markup).toContain('chat-message-part-reveal-inner')
  })
})
