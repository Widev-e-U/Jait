import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamMessageBody } from './team-room'

const members = [
  { id: 'captain', name: 'Captain Standup', avatar: 'Nova' },
  { id: 'sir', name: 'Sir Push-a-Lot', avatar: 'Blaze' },
]

/** Visible text of a rendered body, with tags removed — the message must survive intact. */
const visibleText = (html: string) => html.replace(/<[^>]*>/g, '')

describe('TeamMessageBody mentions', () => {
  it('renders the existing avatar beside a recognized @agent name and keeps the text intact', () => {
    const content = '@Captain Standup please review #264'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, { content, members }))
    expect(html.match(/data-testid="team-mention"/g)).toHaveLength(1)
    expect(html).toContain('@Captain Standup')
    expect(html).toContain('agent-creature')
    expect(visibleText(html)).toBe(content)
  })

  it('handles multi-word full names and multiple mentions in one body', () => {
    const content = 'Handing off: @Sir Push-a-Lot implements, @Captain Standup reviews.'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, { content, members }))
    expect(html.match(/data-testid="team-mention"/g)).toHaveLength(2)
    expect(visibleText(html)).toBe(content)
  })

  it('leaves unknown @names as readable text without an avatar', () => {
    const content = 'Ping @Some Outsider about #264'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, { content, members }))
    expect(html).not.toContain('data-testid="team-mention"')
    expect(html).not.toContain('agent-creature')
    expect(visibleText(html)).toBe(content)
  })

  it('does not treat email-like @ tokens as mentions', () => {
    const content = 'mail captain@Captain Standup now'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, { content, members }))
    expect(html).not.toContain('data-testid="team-mention"')
    expect(visibleText(html)).toBe(content)
  })

  it('preserves surrounding text when a mention sits mid-sentence next to a longer name', () => {
    const content = 'FYI @Captain Standup, @Captain Standupish is not a member.'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, { content, members }))
    expect(html.match(/data-testid="team-mention"/g)).toHaveLength(1)
    expect(visibleText(html)).toBe(content)
  })
})
