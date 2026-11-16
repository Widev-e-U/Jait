import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AppNavigationSidebar } from './app-navigation-sidebar'
import { UpdateButton } from './update-button'
import { AuthProvider } from '@/hooks/useAuth'

function renderWithAuth(element: ReactElement) {
  return renderToStaticMarkup(<AuthProvider>{element}</AuthProvider>)
}

describe('AppNavigationSidebar', () => {
  it('shows the full desktop navigation and account on Settings', () => {
    const markup = renderWithAuth(
      <AppNavigationSidebar
        account={{ username: 'Jakob', initial: 'J', loading: false, onLogin: () => {}, onLogout: () => {}, themeMode: 'system', onThemeModeChange: () => {}, updateControl: (collapsed) => <UpdateButton appPlatform="web" updateInfo={{ currentVersion: '1.0.0', latestVersion: '1.0.1', hasUpdate: true }} releases={[]} updateApplying={false} updateAwaitingRestart={false} onApplyUpdate={async () => {}} collapsed={collapsed} /> }}
        currentView="settings"
        onNavigate={() => {}}
        onOpenSettings={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Main navigation"')
    expect(markup).toContain('>Chat</span>')
    expect(markup).toContain('>Pull Requests</span>')
    expect(markup).toContain('aria-label="Account menu"')
    expect(markup).toContain('>Jakob</span>')
    expect(markup).not.toContain('>Jait</span>')
    expect(markup.indexOf('aria-label="Collapse sidebar"')).toBeGreaterThan(markup.indexOf('aria-label="Workspace sidebar"'))
    expect(markup).toContain('aria-label="Update to v1.0.1"')
    expect(markup).not.toContain('aria-label="Settings"')
    expect(markup).toContain('Collapse sidebar')
  })
})
