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


describe('AssistantBody error retry', () => {
  const error = { type: 'error' as const, content: 'The model provider is experiencing issues (502). Please try again later.' }

  it('offers Retry for a final provider error when a handler is available', () => {
    const markup = renderToStaticMarkup(<AssistantBody segments={[error]} onTryContinue={() => {}} />)
    expect(markup).toContain('Retry</button>')
    expect(markup).not.toContain('disabled=""')
  })

  it.each([{ isContinuing: true }, { isStreaming: true }])('disables Retry while busy: %j', (busy) => {
    const markup = renderToStaticMarkup(<AssistantBody segments={[error]} onTryContinue={() => {}} {...busy} />)
    expect(markup).toContain('disabled=""')
  })

  it('does not offer Retry without a handler or after a later response', () => {
    expect(renderToStaticMarkup(<AssistantBody segments={[error]} />)).not.toContain('Retry</button>')
    expect(renderToStaticMarkup(<AssistantBody segments={[error, { type: 'text', content: 'Recovered' }]} onTryContinue={() => {}} />)).not.toContain('Retry</button>')
  })
})
