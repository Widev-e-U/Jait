import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

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
  it('keeps navigation, repository tools, and account in the expanded sidebar', () => {
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
    expect(markup).not.toContain('aria-label="Settings"')
    expect(markup).toContain('aria-label="Account menu"')
    expect(markup).toContain('Collapse sidebar')
    // The brand is rendered as the Jait logo mark (no "Jait" wordmark).
    expect(markup).not.toContain('>Jait</span>')
    const logoIndex = markup.indexOf('viewBox="0 0 1024 1024"')
    expect(logoIndex).toBeGreaterThan(-1)
    expect(logoIndex).toBeLessThan(markup.indexOf('aria-label="Collapse sidebar"'))
  })

  it('shows icon controls and moves expand below the logo when collapsed', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'true' } })
    try {
      const markup = renderToStaticMarkup(
        <ManagerMode currentPage="threads" onPageChange={() => {}} isMobile={false} account={account} viewMode="manager" onViewModeChange={() => {}}>
          <div>Thread activity</div>
        </ManagerMode>,
      )

      expect(markup).toContain('Expand sidebar')
      expect(markup).not.toContain('Collapse sidebar')
      expect(markup).toContain('aria-label="Account menu"')
      expect(markup).not.toContain('>Jakob</span>')
      expect(markup.indexOf('Expand sidebar')).toBeLessThan(markup.indexOf('manager mode'))
      expect(markup).not.toContain('>Repositories</span>')
    } finally {
      vi.unstubAllGlobals()
    }
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
