import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./prompt-input', () => ({ PromptInput: () => null }))

import { AssistantMarkdown } from './message'

describe('AssistantMarkdown', () => {
  it('keeps streaming assistant content formatted as Markdown', () => {
    const markup = renderToStaticMarkup(
      <AssistantMarkdown content={'## Result\n\n- first\n- second'} isStreaming />,
    )

    expect(markup).toContain('<h2>Result</h2>')
    expect(markup).toContain('<li>first</li>')
    expect(markup).not.toContain('data-streaming-text')
  })
})
