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

  it.each([false, true])('renders OpenUI alongside Markdown (streaming: %s)', (isStreaming) => {
    const content = 'Before\n\n```openui\nroot = Panel("Status", [metric, tasks])\nmetric = Metric("Done", "3", "of 5")\ntasks = Checklist("Next", ["Review", "Test"])\n```\n\nAfter'
    const html = renderToStaticMarkup(<AssistantMarkdown content={content} isStreaming={isStreaming} />)
    expect(html).toContain('Before')
    expect(html).toContain('After')
    expect(html).toContain('Status')
    expect(html).toContain('Done')
    expect(html).toContain('Review')
    expect(html).toContain('type="checkbox"')
    expect(html).not.toContain('language-openui')
  })

  it('renders an unfinished OpenUI fence as it streams', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown isStreaming content={'```openui\nroot = Panel("Live", [metric])\nmetric = Metric("Count", "2", "items")'} />)
    expect(html).toContain('Live')
    expect(html).toContain('Count')
  })

  it('keeps malformed OpenUI source available without rendering HTML', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown content={'```openui\n<script>alert(1)</script>\n```'} />)
    expect(html).toContain('OpenUI source')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('keeps Jait pages and external file URLs out of the project file opener', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown
      content="[Todo](/todo?q=fix) [Web](https://example.com/readme.md) [File](/home/jakob/jait/README.md:3)"
      onOpenPath={() => {}} />)
    expect(html).toContain('href="/todo?q=fix"')
    expect(html).toContain('href="https://example.com/readme.md"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('README.md')
    expect(html).toContain('L3')
  })

  it('offers downloads only for explicit download links', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown
      content="[Download report.pdf](/api/project/download?path=%2Fproject%2Freport.pdf) [Source](/project/readme.md:3)"
      onOpenPath={() => {}} />)
    expect(html).toContain('download="report.pdf"')
    expect(html).toContain('aria-label="Download report.pdf"')
    expect(html).not.toContain('aria-label="Download readme.md"')
    expect(html).toContain('L3')
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
