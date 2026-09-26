import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FilesChanged } from './files-changed'

describe('FilesChanged in the composer', () => {
  it('draws a bottom divider below its header when merged', () => {
    const markup = renderToStaticMarkup(
      <FilesChanged files={[{ path: 'src/app.ts', name: 'app.ts', state: 'undecided' }]} merged />,
    )
    expect(markup.split('>')[0]).toContain('overflow-hidden border-b border-border')
  })
})
