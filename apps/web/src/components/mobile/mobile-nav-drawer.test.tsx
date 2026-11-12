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

  it('lists Agents after Chat and Threads after Messenger in one navigation', () => {
    const markup = renderToStaticMarkup(
      <MobileNavDrawer open onClose={() => {}} currentView="agents" onNavigate={() => {}} sessionSelector={<div>Session list</div>} />,
    )
    const at = (label: string) => markup.indexOf(`aria-label="${label}"`)
    expect(at('Chat')).toBeGreaterThan(-1)
    expect(at('Chat')).toBeLessThan(at('Agents'))
    expect(at('Agents')).toBeLessThan(at('Messenger'))
    expect(at('Messenger')).toBeLessThan(at('Threads'))
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
