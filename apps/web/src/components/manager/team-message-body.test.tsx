import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentAvatar } from './agent-avatar'
import { TeamMessageBody } from './team-room'

const members = [
  { id: 'captain', name: 'Captain Standup', avatar: 'Nova' },
  { id: 'sir', name: 'Sir Push-a-Lot', avatar: 'Atlas' },
]

/** Visible text of a rendered body, with tags removed — the message must survive intact. */
const visibleText = (html: string) => html.replace(/<[^>]*>/g, '')

/** The exact markup AgentAvatar produces for a member — the identity a mention must reuse. */
const avatarMarkup = (avatar: string) =>
  renderToStaticMarkup(createElement(AgentAvatar, { avatar, className: 'h-4 w-4 shrink-0' }))

/** One rendered mention: avatar markup followed immediately by the name text. */
const mentionParts = (html: string) =>
  html
    .split('data-testid="team-mention"')
    .slice(1)
    .map(chunk => {
      const pair = chunk.match(/^[^<]*(<svg[\s\S]*?<\/svg>)<span class="font-medium text-primary">([^<]+)<\/span>/)
      return pair ? { avatar: pair[1]!, name: pair[2]! } : null
    })

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

describe('TeamMessageBody mention structure', () => {
  it('keeps the mention avatar inline inside the message paragraph, directly beside the name', () => {
    const content = 'Handing off: @Sir Push-a-Lot implements, @Captain Standup reviews.'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, { content, members }))

    // The body is a single paragraph and nothing block-level is nested inside it.
    expect(html.startsWith('<p ')).toBe(true)
    expect(html.endsWith('</p>')).toBe(true)
    expect(html).not.toContain('<div')

    const parts = mentionParts(html)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ avatar: avatarMarkup('Atlas'), name: '@Sir Push-a-Lot' })
    expect(parts[1]).toEqual({ avatar: avatarMarkup('Nova'), name: '@Captain Standup' })

    // The avatar sits before the name and the name stays plain readable text.
    const firstChunk = html.split('data-testid="team-mention"')[1]!
    expect(firstChunk.indexOf('<svg')).toBeLessThan(firstChunk.indexOf('@Sir Push-a-Lot'))
  })

  it('binds each mention to its own member avatar, in body order, without duplication', () => {
    const content = 'Implements @Captain Standup, reviews @Sir Push-a-Lot.'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, { content, members }))
    const parts = mentionParts(html)

    expect(avatarMarkup('Nova')).not.toBe(avatarMarkup('Atlas'))
    expect(parts).toEqual([
      { avatar: avatarMarkup('Nova'), name: '@Captain Standup' },
      { avatar: avatarMarkup('Atlas'), name: '@Sir Push-a-Lot' },
    ])
    expect(visibleText(html)).toBe(content)
  })

  it('falls back to the default avatar art for a member whose avatar is unset', () => {
    const content = 'Over to @Rookie please'
    const html = renderToStaticMarkup(createElement(TeamMessageBody, {
      content,
      members: [{ id: 'rookie', name: 'Rookie', avatar: null }],
    }))
    expect(mentionParts(html)).toEqual([{ avatar: avatarMarkup('Nova'), name: '@Rookie' }])
    expect(visibleText(html)).toBe(content)
  })
})
