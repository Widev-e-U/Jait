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

  it('reveals self-opening streaming blocks with the layout-neutral fade class', () => {
    // A height-animated reveal races the virtualizer's one-commit-behind
    // measurement and left the block's tail rendered below the composer.
    const markup = renderToStaticMarkup(
      <Reasoning content={'## Checking\n\n- first'} isStreaming />,
    )

    expect(markup).toContain('reasoning-collapsible')
    expect(markup).toContain('reasoning-collapsible-streaming')
  })

  it('does not tag settled thinking blocks with the streaming fade class', () => {
    const markup = renderToStaticMarkup(<Reasoning content={'## Done'} />)

    expect(markup).toContain('reasoning-collapsible')
    expect(markup).not.toContain('reasoning-collapsible-streaming')
  })
})
