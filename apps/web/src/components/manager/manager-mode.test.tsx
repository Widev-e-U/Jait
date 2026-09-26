import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ManagerMode } from './manager-mode'

const account = {
  username: 'Jakob',
  initial: 'J',
  loading: false,
  onLogin: () => {},
  onLogout: () => {},
  themeMode: 'system' as const,
  onThemeModeChange: () => {},
}

describe('ManagerMode', () => {
  it('keeps navigation, repository tools, settings, and account in the expanded sidebar', () => {
    const markup = renderToStaticMarkup(
      <ManagerMode currentPage="threads" onPageChange={() => {}} isMobile={false} account={account} viewMode="manager" onViewModeChange={() => {}}>
        <div>Thread activity</div>
      </ManagerMode>,
    )

    expect(markup).toContain('aria-label="Workspace sidebar"')
    expect(markup).toContain('aria-label="Main navigation"')
    expect(markup).toContain('>Threads</span>')
    expect(markup).toContain('>Repositories</span>')
    expect(markup).toContain('Browse connected repositories')
    expect(markup).toContain('>Settings</span>')
    expect(markup).toContain('Account: Jakob')
    expect(markup).not.toContain('Collapse sidebar')
    expect(markup.indexOf('>Settings</span>')).toBeGreaterThan(markup.indexOf('>Repositories</span>'))
  })

  it('keeps the sidebar on Agents', () => {
    const markup = renderToStaticMarkup(
      <ManagerMode currentPage="agents" onPageChange={() => {}} isMobile={false} account={account} viewMode="manager" onViewModeChange={() => {}}>
        <div>Agents page</div>
      </ManagerMode>,
    )

    expect(markup).toContain('aria-label="Workspace sidebar"')
    expect(markup).toContain('>Agents</span>')
    expect(markup).toContain('Agents page')
  })
})
