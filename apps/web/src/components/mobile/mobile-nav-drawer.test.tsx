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
        onOpenSettings={() => {}}
      />,
    )

    expect(markup).toContain('Projects &amp; Chats')
    expect(markup).not.toContain('Project tools')
    expect(markup).not.toContain('aria-label="Terminal"')
  })
})
