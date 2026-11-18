import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agentIdentityToastEnabled, buildAgentIdentityToast } from './agent-notification-toast'

const { openNotification } = vi.hoisted(() => ({ openNotification: vi.fn() }))

vi.mock('./notification-navigation', () => ({ openNotification }))

type ToastNotification = Parameters<typeof buildAgentIdentityToast>[0]

function render(notif: ToastNotification): string {
  return renderToStaticMarkup(buildAgentIdentityToast(notif))
}

/** Walk the element tree to the rendered action button, if the toast drew one. */
function findActionButton(node: ReactNode): ReactElement<{ type?: string; children?: ReactNode; onClick?: () => void }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findActionButton(child)
      if (found) return found
    }
    return null
  }
  if (!isValidElement(node)) return null
  const element = node as ReactElement<{ type?: string; children?: ReactNode; onClick?: () => void }>
  if (element.props.type === 'button') return element
  return findActionButton(element.props.children)
}

describe('agent identity toast rendering', () => {
  beforeEach(() => {
    openNotification.mockReset()
  })

  it('draws the originating agent avatar, name and role instead of a plain text toast', () => {
    const html = render({
      id: 'completion:sess-1',
      title: 'Response ready',
      body: 'Ada finished the refactor',
      level: 'success',
      agentId: 'agent-lady-merge-a-lot',
      agentName: 'Lady Merge-a-Lot',
      agentRole: 'Junior Software Engineer',
      agentAvatar: 'Pixel',
    })

    // The identity is actually *displayed*, not merely carried in props.
    expect(html).toContain('agent-identity-toast-name')
    expect(html).toContain('Lady Merge-a-Lot')
    expect(html).toContain('agent-identity-toast-role')
    expect(html).toContain('Junior Software Engineer')

    // The avatar is the real creature component, painted in this agent's colour
    // (PERSONA_AVATARS[2] === 'Pixel' -> #fb7185), so it is that agent's avatar
    // rather than a generic app glyph.
    expect(html).toContain('agent-creature')
    expect(html).toContain('fill="#fb7185"')
    expect(html).toContain('data-agent-avatar="Pixel"')

    // Original notification text is passed through untouched.
    expect(html).toContain('Response ready')
    expect(html).toContain('Ada finished the refactor')
    expect(html).toContain('data-notification-id="completion:sess-1"')
    expect(html).toContain('data-level="success"')
    expect(html).not.toContain('agent-identity-toast-initial')
  })

  it('picks the avatar belonging to each agent, so two agents do not look alike', () => {
    const base = { id: 'completion:x', title: 'Ready', body: 'Done' }
    const nova = render({ ...base, agentName: 'Lady Merge-a-Lot', agentAvatar: 'Nova' })
    const pixel = render({ ...base, agentName: 'Sir Push-a-Lot', agentAvatar: 'Pixel' })

    expect(nova).toContain('fill="#a78bfa"')
    expect(nova).toContain('data-agent-avatar="Nova"')
    expect(pixel).toContain('fill="#fb7185"')
    expect(pixel).toContain('data-agent-avatar="Pixel"')
    expect(nova).not.toBe(pixel)
  })

  it('falls back to a name initial when the agent has no avatar, and to info level', () => {
    const html = render({ id: 'completion:no-avatar', title: 'Ready', body: 'Done', agentName: 'Pixel' })

    expect(html).toContain('agent-identity-toast-initial')
    expect(html).toContain('>P</span>')
    expect(html).not.toContain('agent-creature')
    expect(html).toContain('data-level="info"')
    expect(html).toContain('data-agent-avatar=""')
  })

  it('keeps one glyph for an astral-plane name initial', () => {
    expect(render({ id: 'completion:emoji', title: 'Ready', body: 'Done', agentName: '🦊 Foxglove' }))
      .toContain('>🦊</span>')
  })

  it('escapes a hostile agent name rather than injecting markup', () => {
    const html = render({ id: 'completion:evil', title: 'Ready', body: 'Done', agentName: '<img src=x onerror=alert(1)>' })

    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })

  it('only offers an action for a link the shared sanitizer accepts', () => {
    const base = { id: 'completion:link', title: 'Ready', body: 'Done', agentName: 'Ada' }

    expect(render({ ...base, link: '/chat?sessionId=abc' })).toContain('Open')
    expect(render({ ...base, link: 'https://evil.example/steal' })).not.toContain('Open')
    expect(render({ ...base, link: '//evil.example' })).not.toContain('Open')
    expect(render({ ...base, link: '/definitely-not-a-jait-page' })).not.toContain('Open')
  })

  it('activates the notification card id and the sanitized link when the action is pressed', () => {
    const replacesCard = findActionButton(buildAgentIdentityToast({
      id: 'completion:2', replaceId: 'chat:sess-1', title: 'Ready', body: 'Done',
      agentName: 'Ada', link: '/chat?sessionId=sess-1',
    }))
    expect(replacesCard).not.toBeNull()
    replacesCard?.props.onClick?.()
    expect(openNotification).toHaveBeenCalledWith({ id: 'chat:sess-1', link: '/chat?sessionId=sess-1' })

    const standalone = findActionButton(buildAgentIdentityToast({
      id: 'completion:3', title: 'Ready', body: 'Done', agentName: 'Ada', link: '/chat?sessionId=sess-1',
    }))
    standalone?.props.onClick?.()
    expect(openNotification).toHaveBeenLastCalledWith({ id: 'completion:3', link: '/chat?sessionId=sess-1' })
  })
})

describe('agentIdentityToastEnabled', () => {
  it('requires a real name or avatar, so blank identity keeps the plain toast', () => {
    expect(agentIdentityToastEnabled({ agentName: 'Lady Merge-a-Lot' })).toBe(true)
    expect(agentIdentityToastEnabled({ agentAvatar: 'Pixel' })).toBe(true)
    expect(agentIdentityToastEnabled({ agentRole: 'Junior Software Engineer' })).toBe(false)
    expect(agentIdentityToastEnabled({ agentId: 'agent-1' })).toBe(false)
    expect(agentIdentityToastEnabled({ agentName: '   ', agentAvatar: '' })).toBe(false)
    expect(agentIdentityToastEnabled({})).toBe(false)
    expect(agentIdentityToastEnabled(null)).toBe(false)
    expect(agentIdentityToastEnabled(undefined)).toBe(false)
  })
})
