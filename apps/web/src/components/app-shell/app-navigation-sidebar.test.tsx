import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AppNavigationSidebar } from './app-navigation-sidebar'
import { UpdateButton } from './update-button'

describe('AppNavigationSidebar', () => {
  it('shows the full desktop navigation and account on Settings', () => {
    const markup = renderToStaticMarkup(
      <AppNavigationSidebar
        account={{ username: 'Jakob', initial: 'J', loading: false, onLogin: () => {}, onLogout: () => {}, themeMode: 'system', onThemeModeChange: () => {}, updateControl: (collapsed) => <UpdateButton appPlatform="web" updateInfo={{ currentVersion: '1.0.0', latestVersion: '1.0.1', hasUpdate: true }} releases={[]} updateApplying={false} updateAwaitingRestart={false} onApplyUpdate={async () => {}} collapsed={collapsed} /> }}
        currentView="settings"
        viewMode="developer"
        onNavigate={() => {}}
        onViewModeChange={() => {}}
        onOpenSettings={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Main navigation"')
    expect(markup).toContain('>Chat</span>')
    expect(markup).toContain('>Pull Requests</span>')
    expect(markup).toContain('aria-label="Account menu"')
    expect(markup).toContain('aria-label="Update to v1.0.1"')
    expect(markup).not.toContain('aria-label="Settings"')
    expect(markup).toContain('Collapse sidebar')
  })
})
