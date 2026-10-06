import { describe, it, expect, vi } from 'vitest'
import { createElement, type MouseEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JaitLinkResult } from './jait-link-result'
import { ToolCallCard, isInlineToolCall, type ToolCallInfo } from './tool-call-card'

import { openNotification } from '@/lib/notification-navigation'

vi.mock('@/lib/notification-navigation', () => ({ openNotification: vi.fn() }))

const data = { kind: 'jait-link', href: '/agents', label: 'View the updated team' }
const call = (tool: string, resultData: unknown = data): ToolCallInfo => ({
  callId: tool, tool, args: {}, status: 'success', result: { ok: true, message: 'Link rendered', data: resultData },
})

describe('explicit link cards', () => {
  it.each(['jait.link', 'jait_link', 'mcp__jait__jait_link', 'functions.mcp__jait_core__jait_link'])('renders a visible link for %s', (tool) => {
    const toolCall = call(tool)
    expect(isInlineToolCall(toolCall)).toBe(true)
    const html = renderToStaticMarkup(createElement(ToolCallCard, { call: toolCall }))
    expect(html).toContain('data-testid="jait-link-result"')
    expect(html).toContain('href="/agents"')
    expect(html).toContain('View the updated team')
  })
  it('reads nested external MCP text envelopes', () => {
    const wrapped = { content: [{ type: 'text', text: 'View the updated team\n' + JSON.stringify(data) }] }
    const html = renderToStaticMarkup(createElement(ToolCallCard, { call: call('mcp__jait__jait_link', wrapped) }))
    expect(html).toContain('href="/agents"')
  })
  it('does not render page links from ordinary tool results or external lookalike tools', () => {
    for (const tool of ['agent.profiles', 'cron.add', 'mcp__external__jait_link']) {
      const html = renderToStaticMarkup(createElement(ToolCallCard, { call: call(tool, { ...data, pageLinks: [{ pageId: 'agents' }] }) }))
      expect(html).not.toContain('data-testid="jait-link-result"')
      expect(html).not.toContain('data-testid="tool-page-links"')
    }
  })
  it('keeps failed link calls from rendering navigation', () => {
    const toolCall = { ...call('jait.link'), status: 'error' as const, result: { ok: false, message: 'Invalid link' } }
    expect(isInlineToolCall(toolCall)).toBe(false)
    expect(renderToStaticMarkup(createElement(ToolCallCard, { call: toolCall }))).not.toContain('data-testid="jait-link-result"')
  })
  it('navigates on an ordinary click and preserves modified link clicks', () => {
    vi.mocked(openNotification).mockClear()
    const element = JaitLinkResult({ data })
    const click = element.props.onClick as (event: MouseEvent<HTMLAnchorElement>) => void
    const event = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    expect(openNotification).not.toHaveBeenCalled()
    click(event as unknown as MouseEvent<HTMLAnchorElement>)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(openNotification).toHaveBeenCalledWith({ id: 'jait-link:/agents', link: '/agents' })
    vi.mocked(openNotification).mockClear()
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      click({ ...event, [modifier]: true } as unknown as MouseEvent<HTMLAnchorElement>)
    }
    expect(openNotification).not.toHaveBeenCalled()
  })
  it('revalidates links in the browser and treats labels as plain text', () => {
    const invalid = renderToStaticMarkup(createElement(JaitLinkResult, { data: { ...data, href: 'https://evil.test' } }))
    expect(invalid).not.toContain('href=')
    const escaped = renderToStaticMarkup(createElement(JaitLinkResult, { data: { ...data, label: '<script>alert(1)</script>' } }))
    expect(escaped).not.toContain('<script>')
    expect(escaped).toContain('&lt;script&gt;')
  })
})
