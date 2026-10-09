import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BrowserActivityView } from './browser-activity-view'
vi.mock('@/components/remote/no-vnc-session-view', () => ({ NoVncSessionView: ({ source }: { source: string }) => createElement('iframe', { title: 'Agent browser', src: source }) }))
const data = { url: 'https://example.com', browserSession: { sessionId: 'chat-a', controller: 'agent', previewUrl: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify' } }
describe('browser in chat', () => {
  it('renders the live browser and takeover directly in a navigation card', () => {
    const html = renderToStaticMarkup(createElement(BrowserActivityView, { tool: 'browser.navigate', args: {}, data, status: 'success', output: '' }))
    expect(html).toContain('title="Agent browser"')
    expect(html).toContain('Take control')
  })
  it('offers sharing in the chat when the user controls the browser', () => {
    const html = renderToStaticMarkup(createElement(BrowserActivityView, { tool: 'browser.navigate', args: {}, data: { ...data, browserSession: { ...data.browserSession, controller: 'user' } }, status: 'success', output: '' }))
    expect(html).toContain('Share with agent')
  })
  it('does not embed arbitrary browser URLs as live sessions', () => {
    const html = renderToStaticMarkup(createElement(BrowserActivityView, { tool: 'browser.navigate', args: {}, data: { browserSession: { ...data.browserSession, previewUrl: 'https://evil.test' } }, status: 'success', output: '' }))
    expect(html).not.toContain('<iframe')
  })
})
