import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { highlightSearchMatchHtml } from './settings-search-highlight'

describe('highlightSearchMatch', () => {
  it('wraps matching settings search text in mark tags', () => {
    const markup = renderToStaticMarkup(
      createElement('span', {
        dangerouslySetInnerHTML: { __html: highlightSearchMatchHtml('OPENAI_API_KEY', 'openai') },
      }),
    )

    expect(markup).toContain('<mark')
    expect(markup).toContain('>OPENAI</mark>_API_KEY')
  })

  it('returns plain text when there is no match', () => {
    const markup = renderToStaticMarkup(
      createElement(Fragment, null, highlightSearchMatchHtml('Session archive', 'token')),
    )

    expect(markup).toBe('Session archive')
  })
})
