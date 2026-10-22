import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MobileNavDrawer } from './mobile-nav-drawer'

describe('MobileNavDrawer', () => {
  it('keeps project tools out of the drawer because they live in the mobile footer', () => {
    const markup = renderToStaticMarkup(
      <MobileNavDrawer
        open
        onClose={() => {}}
        currentView="chat"
        onNavigate={() => {}}
        sessionSelector={<div>Session list</div>}
      />,
    )

    // The selector names itself through its own search field, so the drawer adds no title row.
    expect(markup).toContain('Session list')
    expect(markup).not.toContain('Projects &amp; Chats')
    expect(markup).not.toContain('Project tools')
    expect(markup).not.toContain('aria-label="Terminal"')
  })

  it('shows Manager pages without Developer navigation in Manager mode', () => {
    const markup = renderToStaticMarkup(
      <MobileNavDrawer open onClose={() => {}} currentView="agents" onNavigate={() => {}} sessionSelector={<div>Session list</div>} />,
    )
    expect(markup).toContain('aria-label="Threads"')
    expect(markup).toContain('aria-label="Agents"')
    expect(markup.indexOf('aria-label="Agents"')).toBeLessThan(markup.indexOf('aria-label="Threads"'))
    expect(markup).not.toContain('aria-label="Chat"')
    expect(markup).not.toContain('Projects &amp; Chats')
  })

  it('leaves Settings to the account menu instead of duplicating it', () => {
    const markup = renderToStaticMarkup(
      <MobileNavDrawer open onClose={() => {}} currentView="chat" onNavigate={() => {}} sessionSelector={null} />,
    )
    expect(markup).not.toContain('aria-label="Settings"')
    expect(markup).not.toContain('Account settings')
    expect(markup).not.toContain('Sign in')
  })

  it('does not render the animated agent control in the drawer footer', () => {
    const markup = renderToStaticMarkup(
      <MobileNavDrawer open onClose={() => {}} currentView="agents" onNavigate={() => {}} sessionSelector={null} />,
    )
    expect(markup).not.toContain('aria-label="Agent controls"')
  })
})
