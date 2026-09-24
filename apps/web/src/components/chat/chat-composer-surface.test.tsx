import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ChatComposerSurface } from './chat-composer-surface'

describe('ChatComposerSurface', () => {
  it('provides a plain footer for chat controls', () => {
    const markup = renderToStaticMarkup(
      <ChatComposerSurface><span>composer</span></ChatComposerSurface>,
    )

    expect(markup).toContain('<footer')
    expect(markup).toContain('data-chat-composer-surface="true"')
    expect(markup).toContain('px-1 py-1')
    expect(markup).not.toContain('border')
    expect(markup).not.toContain('rounded-xl')
  })
})
