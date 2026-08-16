import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  AssistantMarkdown,
  getCodeHighlightDelay,
  highlightCodeHtml,
} from './assistant-markdown'

describe('AssistantMarkdown', () => {
  it('keeps streaming assistant content formatted as Markdown', () => {
    const markup = renderToStaticMarkup(
      <AssistantMarkdown content={'## Result\n\n- first\n- second'} isStreaming />,
    )

    expect(markup).toContain('<h2>Result</h2>')
    expect(markup).toContain('<li>first</li>')
    expect(markup).not.toContain('data-streaming-text')
  })

  it('highlights completed code without a debounce delay', () => {
    expect(getCodeHighlightDelay(false)).toBe(0)
    expect(getCodeHighlightDelay(true)).toBeGreaterThan(0)
  })

  it('produces token colors for fenced TypeScript code', async () => {
    const highlighted = await highlightCodeHtml(
      'const answer: number = 42',
      'ts',
      'github-dark',
    )

    expect(highlighted).toContain('style="color:')
    expect(highlighted).toContain('answer')
  })
})
