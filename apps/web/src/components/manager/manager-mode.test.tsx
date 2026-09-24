import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ManagerMode } from './manager-mode'

describe('ManagerMode', () => {
  it('uses the shared sidebar for Threads, Repositories, and Settings', () => {
    const markup = renderToStaticMarkup(
      <ManagerMode currentPage="threads" onPageChange={() => {}} isMobile={false}>
        <div>Thread activity</div>
      </ManagerMode>,
    )

    expect(markup).toContain('aria-label="Workspace sidebar"')
    expect(markup).toContain('>Threads</span>')
    expect(markup).toContain('>Repositories</span>')
    expect(markup).toContain('>Settings</span>')
    expect(markup).toContain('aria-label="Collapse sidebar"')
    expect(markup.indexOf('>Settings</span>')).toBeGreaterThan(markup.indexOf('>Repositories</span>'))
  })
})
