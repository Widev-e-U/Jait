import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ChatComposerSurface } from './chat-composer-surface'

describe('ChatComposerSurface', () => {
  it('provides the shared visual shell for every chat composer', () => {
    const markup = renderToStaticMarkup(
      <ChatComposerSurface><span>composer</span></ChatComposerSurface>,
    )

    expect(markup).toContain('data-chat-composer-surface="true"')
    expect(markup).toContain('rounded-2xl')
    expect(markup).toContain('focus-within:border-primary/50')
  })
})
