import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ChatComposerSurface } from './chat-composer-surface'

describe('ChatComposerSurface', () => {
  it('provides a bordered shell for chat controls', () => {
    const markup = renderToStaticMarkup(
      <ChatComposerSurface><span>composer</span></ChatComposerSurface>,
    )

    expect(markup).toContain('data-chat-composer-surface="true"')
    expect(markup).toContain('rounded-xl')
    expect(markup).toContain('px-2 py-1')
  })
})
