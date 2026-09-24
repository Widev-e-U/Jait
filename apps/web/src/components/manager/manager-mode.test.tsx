import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ManagerMode } from './manager-mode'

describe('ManagerMode', () => {
  it('shows only Repositories and Settings in the Threads sidebar', () => {
    const markup = renderToStaticMarkup(
      <ManagerMode currentPage="threads" onPageChange={() => {}} isMobile={false}>
        <div>Thread activity</div>
      </ManagerMode>,
    )

    expect(markup).toContain('aria-label="Workspace sidebar"')
    expect(markup).not.toContain('>Threads</span>')
    expect(markup).toContain('>Repositories</span>')
    expect(markup).toContain('Browse connected repositories')
    expect(markup).toContain('>Settings</span>')
    expect(markup).toContain('aria-label="Collapse sidebar"')
    expect(markup.indexOf('>Settings</span>')).toBeGreaterThan(markup.indexOf('>Repositories</span>'))
  })

  it('does not show a sidebar on Agents', () => {
    const markup = renderToStaticMarkup(
      <ManagerMode currentPage="agents" onPageChange={() => {}} isMobile={false}>
        <div>Agents page</div>
      </ManagerMode>,
    )

    expect(markup).not.toContain('aria-label="Workspace sidebar"')
    expect(markup).toContain('Agents page')
  })
})
