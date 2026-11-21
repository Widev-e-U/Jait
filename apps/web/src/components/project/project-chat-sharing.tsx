import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getApiUrl } from '@/lib/gateway-url'
import type { ProjectSession } from '@/hooks/useProjects'

/** Sharing a chat is an explicit, reversible decision by its owner. */
export function ProjectChatSharing({ sessions, token }: { sessions: ProjectSession[]; token: string }) {
  const [sharing, setSharing] = useState<Record<string, boolean>>(() => Object.fromEntries(sessions.map((session) => [session.id, session.sharedWithProject === true])))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setSharing(Object.fromEntries(sessions.map((session) => [session.id, session.sharedWithProject === true])))
  }, [sessions])

  const manageable = sessions.filter((session) => session.canManageShare && session.status === 'active')
  const update = async (session: ProjectSession) => {
    const sharedWithProject = !sharing[session.id]
    setBusy(session.id)
    setError('')
    try {
      const response = await fetch(`${getApiUrl()}/api/sessions/${encodeURIComponent(session.id)}/share`, {
        method: 'PATCH', credentials: 'include',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedWithProject }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string; details?: string }
        throw new Error(result.details || result.error || 'Could not change chat sharing')
      }
      const result = await response.json() as { sharedWithProject: boolean }
      setSharing((current) => ({ ...current, [session.id]: result.sharedWithProject }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change chat sharing')
    } finally { setBusy(null) }
  }

  if (!manageable.length) return null
  return <div className="space-y-2 border-t pt-4">
    <Label>Share chats</Label>
    <p className="text-2xs text-muted-foreground">Project members can read shared chats. Only the chat owner can send messages or run tools.</p>
    <ul className="space-y-1">
      {manageable.map((session) => <li key={session.id} className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">{session.name || 'Untitled chat'} <span className="text-muted-foreground">({sharing[session.id] ? 'Shared' : 'Private'})</span></span>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void update(session)}>{sharing[session.id] ? 'Stop sharing' : 'Share with project'}</Button>
      </li>)}
    </ul>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
