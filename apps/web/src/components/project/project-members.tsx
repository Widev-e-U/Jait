import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiUrl } from '@/lib/gateway-url'

interface Member {
  userId: string
  username: string
  displayName: string | null
  role: string
}

/** Project membership is separate from sharing individual chats. */
export function ProjectMembers({ projectId, token }: { projectId: string; token: string | null }) {
  const [members, setMembers] = useState<Member[]>([])
  const [canManage, setCanManage] = useState(false)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endpoint = `${getApiUrl()}/api/projects/${encodeURIComponent(projectId)}/members`

  const request = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    })
    const result = await response.json().catch(() => ({})) as { error?: string; detail?: string; details?: string; members?: Member[]; canManage?: boolean }
    if (!response.ok) throw new Error(result.detail || result.details || result.error || 'Could not update project members')
    return result
  }, [token])

  const load = useCallback(async () => {
    const result = await request(endpoint)
    setMembers(result.members ?? [])
    setCanManage(result.canManage ?? false)
  }, [endpoint, request])

  useEffect(() => {
    let active = true
    setMembers([])
    setCanManage(false)
    setError('')
    void request(endpoint).then((result) => {
      if (active) { setMembers(result.members ?? []); setCanManage(result.canManage ?? false) }
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load project members')
    })
    return () => { active = false }
  }, [endpoint, request])

  const change = async (url: string, init: RequestInit) => {
    setBusy(true)
    setError('')
    try {
      await request(url, init)
      setUsername('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update project members')
    } finally { setBusy(false) }
  }

  return <div className="space-y-2 border-t pt-4">
    <Label>Project members</Label>
    <p className="text-2xs text-muted-foreground">Members can access this project. Chats must be shared separately.</p>
    {members.length > 0 && <ul className="space-y-1">
      {members.map((member) => <li key={member.userId} className="flex items-center justify-between gap-2 text-sm">
        <span>{member.displayName || member.username} <span className="text-muted-foreground">(@{member.username}, {member.role})</span></span>
        {canManage && member.role !== 'owner' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void change(`${endpoint}/${encodeURIComponent(member.userId)}`, { method: 'DELETE' })}>Remove</Button>}
      </li>)}
    </ul>}
    {canManage && <form className="flex gap-2" onSubmit={(event) => {
      event.preventDefault()
      if (username.trim()) void change(endpoint, { method: 'POST', body: JSON.stringify({ username: username.trim() }) })
    }}>
      <Input aria-label="Account username" placeholder="Account username" value={username} onChange={(event) => setUsername(event.target.value)} />
      <Button type="submit" variant="outline" disabled={busy || !username.trim()}>Add member</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
