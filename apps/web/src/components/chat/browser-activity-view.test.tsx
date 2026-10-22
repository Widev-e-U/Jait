import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ChatBrowserView } from './chat-browser-view'
import { BrowserActivityView } from './browser-activity-view'
import { forgetBrowserPanelState, rememberBrowserCollapsed } from '@/lib/browser-panel-state'
vi.mock('@/components/remote/no-vnc-session-view', () => ({ NoVncSessionView: ({ source }: { source: string }) => createElement('iframe', { title: 'Agent browser', src: source }) }))
const data = { url: 'https://example.com', browserSession: { sessionId: 'chat-a', controller: 'agent', previewUrl: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify' } }
describe('browser in chat', () => {
  it('keeps browser activities as transcript evidence without duplicate live views', () => {
    const html = renderToStaticMarkup(createElement(BrowserActivityView, { tool: 'browser.navigate', args: {}, data, status: 'success', output: '' }))
    expect(html).toContain('Browser activity')
    expect(html).not.toContain('<iframe')
  })
  it('offers sharing in the chat when the user controls the browser', () => {
    const html = renderToStaticMarkup(createElement(ChatBrowserView, { data: { ...data, browserSession: { ...data.browserSession, controller: 'user' } }, autoOpen: true }))
    expect(html).toContain('Share with agent')
  })
  it('does not embed arbitrary browser URLs as live sessions', () => {
    const html = renderToStaticMarkup(createElement(ChatBrowserView, { data: { browserSession: { ...data.browserSession, previewUrl: 'https://evil.test' } }, autoOpen: true }))
    expect(html).not.toContain('<iframe')
  })
  it('floats over the transcript with its own geometry instead of taking layout space', () => {
    const html = renderToStaticMarkup(createElement(ChatBrowserView, { data, autoOpen: true }))
    expect(html).toContain('data-browser-panel')
    expect(html).toContain('data-browser-minimized="false"')
    // Positioned out of flow, so the conversation column never resizes around it.
    expect(html).toMatch(/class="[^"]*\babsolute\b/)
    expect(html).toMatch(/class="[^"]*\bz-30\b/)
    // Explicit box geometry: the panel cannot collapse or push its siblings.
    expect(html).toMatch(/style="[^"]*left:\s*\d+px/)
    expect(html).toMatch(/style="[^"]*top:\s*12px/)
    expect(html).toMatch(/style="[^"]*width:\s*\d+px/)
    expect(html).toMatch(/style="[^"]*height:\s*\d+px/)
  })
  it('grows and shrinks with a short transition that users can still see', () => {
    const html = renderToStaticMarkup(createElement(ChatBrowserView, { data, autoOpen: true }))
    expect(html).toContain('transition-[left,top,width,height,border-radius,box-shadow]')
    expect(html).toContain('[transition-duration:180ms]')
    expect(html).toContain('[transition-timing-function:cubic-bezier(0.2,0,0,1)]')
    // Users who ask their system to reduce motion get no animation at all.
    expect(html).toContain('motion-reduce:transition-none')
  })
  it('collapses to a small upper-left website-only preview', () => {
    const html = renderToStaticMarkup(createElement(ChatBrowserView, { data, autoOpen: false }))
    expect(html).toContain('data-browser-minimized="true"')
    expect(html).toMatch(/style="[^"]*left:\s*12px/)
    expect(html).toMatch(/style="[^"]*top:\s*12px/)
    expect(html).toMatch(/style="[^"]*width:\s*160px/)
    expect(html).toMatch(/style="[^"]*height:\s*90px/)
    expect(html).toContain('Expand browser')
    // Collapsed, the address bar folds away instead of shrinking the preview.
    // It stays mounted (merely inert) so expanding restores the same session.
    expect(html).toContain('grid-rows-[0fr]')
    expect(html).toContain('inert')
  })
  it('reopens a chat in the collapsed state the user left it in', () => {
    // Switching away and back remounts the panel; the remembered flag wins
    // over the autoOpen default.
    rememberBrowserCollapsed('chat-a', true)
    try {
      const html = renderToStaticMarkup(createElement(ChatBrowserView, { data, autoOpen: true }))
      expect(html).toContain('data-browser-minimized="true"')
      expect(html).toMatch(/style="[^"]*width:\s*160px/)
      expect(html).toMatch(/style="[^"]*height:\s*90px/)
    } finally {
      forgetBrowserPanelState()
    }
  })
  it('remembers the collapsed state per chat instead of globally', () => {
    const other = { ...data, browserSession: { ...data.browserSession, sessionId: 'chat-b' } }
    rememberBrowserCollapsed('chat-a', true)
    try {
      const html = renderToStaticMarkup(createElement(ChatBrowserView, { data: other, autoOpen: true }))
      expect(html).toContain('data-browser-minimized="false"')
    } finally {
      forgetBrowserPanelState()
    }
  })
})
