import type { ReactElement } from 'react'
import { notificationContextHasAgentIdentity, safeNotificationLink, type NotificationContext } from '@jait/shared'
import { AgentAvatar } from '@/components/manager/agent-avatar'
import { normalizePersonaAvatar } from '@/lib/persona-agents'
import { openNotification } from './notification-navigation'
import './agent-notification-toast.css'

/**
 * In-app identity toast.
 *
 * No OS transport in this repo can carry a per-agent image (see
 * `NOTIFICATION_PLATFORM_MATRIX` in `@jait/shared`), so the in-app toast is the
 * surface that shows *who* finished the turn: the originating agent's avatar
 * plus its name and role, drawn with the same `AgentAvatar` component the rest
 * of the app uses. A payload without identity never reaches this builder — the
 * caller keeps the plain toast path, so existing notification text is
 * unchanged.
 */
export interface AgentIdentityToastNotification extends NotificationContext {
  id: string
  title: string
  body: string
  level?: 'info' | 'success' | 'warning' | 'error'
}

/** True when the payload names an agent, using the shared sanitizing predicate. */
export function agentIdentityToastEnabled(notif: NotificationContext | null | undefined): boolean {
  return notificationContextHasAgentIdentity(notif)
}

/** First grapheme of the agent name, for the avatar-less fallback badge. */
function agentInitial(name: string): string {
  const trimmed = name.trim()
  // Spread iterates code points, so an emoji or accented label yields one glyph.
  return trimmed ? (Array.from(trimmed)[0] ?? '') : ''
}

export function buildAgentIdentityToast(notif: AgentIdentityToastNotification): ReactElement {
  const name = notif.agentName?.trim() ?? ''
  const role = notif.agentRole?.trim() ?? ''
  const avatar = notif.agentAvatar?.trim() ?? ''
  const initial = agentInitial(name || role)
  // The same sanitizer the OS activation path uses: an unsafe or unknown target
  // never renders an inert or dangerous action.
  const link = safeNotificationLink(notif.link)
  const id = notif.replaceId ?? notif.id

  return (
    <div
      className="agent-identity-toast"
      data-notification-id={notif.id}
      data-level={notif.level ?? 'info'}
      data-agent-avatar={avatar ? normalizePersonaAvatar(avatar) : ''}
    >
      <div className="agent-identity-toast-avatar">
        {avatar
          ? <AgentAvatar avatar={avatar} className="h-9 w-9" />
          : <span className="agent-identity-toast-initial" aria-hidden="true">{initial}</span>}
      </div>
      <div className="agent-identity-toast-content">
        {name ? <div className="agent-identity-toast-name">{name}</div> : null}
        {role ? <div className="agent-identity-toast-role">{role}</div> : null}
        <div className="agent-identity-toast-title">{notif.title}</div>
        {notif.body ? <div className="agent-identity-toast-body">{notif.body}</div> : null}
        {link ? (
          <button
            type="button"
            className="agent-identity-toast-action"
            onClick={() => openNotification({ id, link })}
          >
            Open
          </button>
        ) : null}
      </div>
    </div>
  )
}
