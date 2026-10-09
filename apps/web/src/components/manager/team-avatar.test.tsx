import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamAvatar } from './team-avatar'

describe('TeamAvatar identity', () => {
  it('counts unique people and retains their chosen creature identities', () => {
    const members = Array.from({ length: 7 }, (_, i) => ({ id: `agent-${i}`, name: `Agent ${i}`, avatar: 'Nova' }))
    const html = renderToStaticMarkup(createElement(TeamAvatar, { members: [members[0], ...members], runningIds: new Set(['agent-2']) }))
    expect(html.match(/data-member-id=/g)).toHaveLength(4)
    expect(html).toContain('+3')
    expect(html.match(/agent-creature-working/g)).toHaveLength(1)
    expect(html).toContain('data-member-id="agent-2"')
    expect(html).toContain('fill="#a78bfa"')
    expect(html).toContain('aria-label="Team: Agent 0, Agent 1, Agent 2, Agent 3, Agent 4, Agent 5, Agent 6"')
  })
  it('escapes member names and renders an accessible empty team', () => {
    expect(renderToStaticMarkup(createElement(TeamAvatar, { members: [{ id: 'one', name: '<script>', avatar: 'unknown' }] }))).toContain('Team: &lt;script&gt;')
    const empty = renderToStaticMarkup(createElement(TeamAvatar, { members: [], size: 24 }))
    expect(empty).toContain('aria-label="Team: no members"')
    expect(empty).toContain('--team-avatar-size:24px')
    expect(empty).not.toContain('agent-creature')
  })
})
