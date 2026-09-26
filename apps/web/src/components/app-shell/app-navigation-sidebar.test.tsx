import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AppNavigationSidebar } from './app-navigation-sidebar'

describe('AppNavigationSidebar', () => {
  it('shows the full desktop navigation and account on Settings', () => {
    const markup = renderToStaticMarkup(
      <AppNavigationSidebar
        account={{ username: 'Jakob', initial: 'J', loading: false, onLogin: () => {}, onLogout: () => {}, themeMode: 'system', onThemeModeChange: () => {} }}
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
    expect(markup).toContain('aria-label="Account: Jakob"')
    expect(markup).toContain('aria-label="Settings" aria-pressed="true"')
    expect(markup).not.toContain('Collapse sidebar')
  })
})
