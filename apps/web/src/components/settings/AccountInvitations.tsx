import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { getApiUrl } from '@/lib/gateway-url'

export function AccountInvitations({ token }: { token: string | null }) {
  const [invitation, setInvitation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const create = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/invitations`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'include',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Could not create invitation')
      setInvitation(result.invitation)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create invitation') }
    finally { setBusy(false) }
  }
  return <Card className="p-4 space-y-3">
    <div className="font-medium">Invite another account</div>
    <p className="text-sm text-muted-foreground">The gateway owner can create a code for one account. It expires after 24 hours. Share it with someone you trust to use this gateway.</p>
    <Button variant="outline" onClick={() => void create()} disabled={busy || !token}>{busy ? 'Creating…' : 'Create invitation'}</Button>
    {invitation && <Input aria-label="Invitation code" readOnly value={invitation} onFocus={(event) => event.target.select()} />}
    {error && <p className="text-sm text-destructive">{error}</p>}
  </Card>
}
