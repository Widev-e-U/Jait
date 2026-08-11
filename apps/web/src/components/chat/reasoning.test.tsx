import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Reasoning } from './reasoning'

describe('Reasoning', () => {
  it('renders streamed thinking as Markdown without a fake cursor indicator', () => {
    const markup = renderToStaticMarkup(
      <Reasoning content={'## Checking\n\n- first\n- second'} isStreaming />,
    )

    expect(markup).toContain('<h2>Checking</h2>')
    expect(markup).toContain('<li>first</li>')
    expect(markup).not.toContain('inline-block w-1.5 h-3.5')
  })
})
