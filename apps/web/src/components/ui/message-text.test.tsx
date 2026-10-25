import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageText } from './message-text'
import { MessageLink } from './message-link'

describe('message links', () => {
  it('links Markdown, bare URLs, email and www addresses', () => {
    const html = renderToStaticMarkup(<MessageText>{'[Todo](/todo?q=fix) https://example.com/page.html www.example.com a@example.com'}</MessageText>)
    expect(html).toContain('href="/todo?q=fix"')
    expect(html).toContain('href="https://example.com/page.html"')
    expect(html).toContain('href="http://www.example.com"')
    expect(html).toContain('href="mailto:a@example.com"')
    expect(html).toContain('noopener noreferrer')
  })

  it('preserves plain formatting, code, and image syntax without loading images', () => {
    const html = renderToStaticMarkup(<MessageText>{'**literal**\n`https://code.test`\n![image](https://image.test/a.png)'}</MessageText>)
    expect(html).toContain('**literal**\n`https://code.test`')
    expect(html).toContain('![image](https://image.test/a.png)')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('<img')
  })

  it('supports reference links and punctuation around bare URLs', () => {
    const html = renderToStaticMarkup(<MessageText>{'[Guide][g] (https://example.com).\n\n[g]: /settings'}</MessageText>)
    expect(html).toContain('href="/settings"')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain(').')
  })

  it('does not enable executable URLs or raw HTML', () => {
    const html = renderToStaticMarkup(<MessageText>{'[bad](javascript:alert) <script>alert(1)</script>'}</MessageText>)
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<script>')
    expect(renderToStaticMarkup(<MessageLink href="data:text/html,bad">bad</MessageLink>)).not.toContain('href=')
  })
})
