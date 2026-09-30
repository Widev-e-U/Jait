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
    // The collapse control is swapped with the brand: it sits left of the logo.
    expect(markup.indexOf('aria-label="Collapse sidebar"')).toBeLessThan(logoIndex)
  })

  it('shows icon controls and keeps the expand control in the collapsed header', () => {
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
      // The expand control lives in the sidebar header (swapped with the
      // brand), above the mode toggle and the account section.
      const expandIndex = markup.indexOf('aria-label="Expand sidebar"')
      expect(expandIndex).toBeGreaterThan(markup.indexOf('aria-label="Workspace sidebar"'))
      expect(expandIndex).toBeLessThan(markup.indexOf('manager mode'))
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
