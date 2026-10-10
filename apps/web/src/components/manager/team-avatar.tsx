import type { CSSProperties } from 'react'
import { AgentAvatar } from './agent-avatar'
import './team-avatar.css'

export interface TeamAvatarMember { id: string; name: string; avatar: string }

/** Presentational: callers supply confirmed runtime, never enabled/paused state. */
export function TeamAvatar({ members, runningIds = new Set<string>(), layout = 'cluster', size, className = '' }: {
  members: readonly TeamAvatarMember[]
  runningIds?: ReadonlySet<string>
  layout?: 'cluster' | 'stack'
  size?: 24 | 32 | 48 | 64
  className?: string
}) {
  const unique = members.filter((member, index) => members.findIndex(other => other.id === member.id) === index)
  const visible = unique.slice(0, 4)
  const remaining = unique.length - visible.length
  const label = unique.length ? `Team: ${unique.map(member => `${member.name}${runningIds.has(member.id) ? ' (working)' : ''}`).join(', ')}` : 'Team: no members'
  return <span role="img" aria-label={label} title={label} style={{ '--team-avatar-size': `${size ?? (layout === 'cluster' ? 48 : 32)}px` } as CSSProperties} className={`team-avatar team-avatar-${layout} ${unique.length === 1 ? 'team-avatar-single' : ''} ${className}`}>
    {visible.map((member, index) => <span key={member.id} aria-hidden="true" data-member-id={member.id}
      className={`team-avatar-member team-avatar-member-${index}`}>
      <AgentAvatar avatar={member.avatar} running={runningIds.has(member.id)} className="h-full w-full" />
    </span>)}
    {remaining > 0 && <span aria-hidden="true" className="team-avatar-more">+{remaining}</span>}
    {!unique.length && <span aria-hidden="true" className="team-avatar-empty">0</span>}
  </span>
}
