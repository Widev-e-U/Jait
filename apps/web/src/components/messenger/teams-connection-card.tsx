import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, LogIn, Plus, RefreshCw, ShieldQuestion, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'

interface BridgeStatus {
  platform: string
  label: string
  state: 'connected' | 'expired' | 'error' | 'unknown'
  checkedAt: string
  expiresAt?: string
  detail?: string
  reauth?: { command?: string; hint?: string }
  accounts?: { id: string; name: string; state: BridgeStatus['state']; detail?: string; expiresAt?: string; tenants?: { id: string; name: string; connected: boolean }[]; tenantError?: string }[]
}

interface ReauthState {
  phase: 'idle' | 'starting' | 'waiting_login' | 'applying' | 'done' | 'error'
  message: string
  liveViewUrl: string | null
}

const POLL_MS = 60_000
const REAUTH_POLL_MS = 2_000
const REAUTH_URL = '/api/messenger/bridge-reauth/teams'

function timeOf(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function presentation(status: BridgeStatus) {
  switch (status.state) {
    case 'connected':
      return {
        text: 'Connected',
        variant: 'secondary' as const,
        Icon: CheckCircle2,
        className: 'text-emerald-600',
      }
    case 'expired':
      return {
        text: 'Auth timed out',
        variant: 'destructive' as const,
        Icon: AlertTriangle,
        className: 'text-destructive',
      }
    case 'error':
      return {
        text: 'Check failed',
        variant: 'destructive' as const,
        Icon: AlertTriangle,
        className: 'text-destructive',
      }
    default:
      return {
        text: 'Unknown',
        variant: 'outline' as const,
        Icon: ShieldQuestion,
        className: 'text-muted-foreground',
      }
  }
}

/**
 * Shows whether the Teams bridge session behind this Matrix account is still usable
 * and offers a manual re-check plus the re-authentication hint.
 */
export function TeamsConnectionCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reauth, setReauth] = useState<ReauthState | null>(null)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<{ accountId: string; tenantId: string; name: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const load = useCallback(async (force: boolean) => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/messenger/bridge-status', {
        method: force ? 'POST' : 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Status request failed (${response.status})`)
      const body = (await response.json()) as { bridges?: BridgeStatus[] }
      const teams = body.bridges?.find(bridge => bridge.platform === 'teams') ?? body.bridges?.[0] ?? null
      setStatus(teams)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Status request failed')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
    const timer = window.setInterval(() => void load(false), POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const callReauth = useCallback(async (method: 'GET' | 'POST' | 'DELETE', tenant?: { accountId: string; tenantId: string }) => {
    try {
      const response = await fetch(REAUTH_URL, {
        method,
        credentials: 'include',
        headers: { Accept: 'application/json', ...(tenant ? { 'Content-Type': 'application/json' } : {}) },
        ...(method === 'POST' && tenant ? { body: JSON.stringify(tenant) } : {}),
      })
      if (!response.ok) throw new Error(`Re-authentication request failed (${response.status})`)
      setReauth((await response.json()) as ReauthState)
    } catch (failure) {
      setReauth({
        phase: 'error',
        message: failure instanceof Error ? failure.message : 'Re-authentication request failed',
        liveViewUrl: null,
      })
    }
  }, [])

  const startReauth = (tenant: { accountId: string; tenantId: string; name: string } | null = null) => {
    setSelectedTenant(tenant)
    setReauthOpen(true)
    setReauth({ phase: 'starting', message: 'Starting browser…', liveViewUrl: null })
    void callReauth('POST', tenant ? { accountId: tenant.accountId, tenantId: tenant.tenantId } : undefined)
  }

  const closeReauth = () => {
    setReauthOpen(false)
    if (reauth && ['starting', 'waiting_login', 'applying'].includes(reauth.phase)) void callReauth('DELETE')
  }

  const removeAccount = useCallback(async (id: string) => {
    setRemoving(true)
    setError('')
    try {
      const response = await fetch(`/api/messenger/bridge-accounts/teams?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      const body = (await response.json().catch(() => ({}))) as { bridges?: BridgeStatus[]; error?: string }
      if (!response.ok) throw new Error(body.error || `Removing the account failed (${response.status})`)
      setStatus(body.bridges?.find(bridge => bridge.platform === 'teams') ?? body.bridges?.[0] ?? null)
      setConfirmRemove(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Removing the account failed')
    } finally {
      setRemoving(false)
    }
  }, [])

  const reauthPhase = reauth?.phase
  useEffect(() => {
    if (!reauthOpen || !reauthPhase || !['starting', 'waiting_login', 'applying'].includes(reauthPhase)) return
    const timer = window.setInterval(() => void callReauth('GET'), REAUTH_POLL_MS)
    return () => window.clearInterval(timer)
  }, [reauthOpen, reauthPhase, callReauth])

  useEffect(() => {
    if (reauthPhase !== 'done') return
    void load(true)
    const timer = window.setTimeout(() => setReauthOpen(false), 1500)
    return () => window.clearTimeout(timer)
  }, [reauthPhase, load])

  if (!status && !error) {
    return (
      <section aria-label="Teams connection" className={className}>
        <p className="text-xs text-muted-foreground">Checking Teams connection…</p>
      </section>
    )
  }

  if (!status) {
    return (
      <section aria-label="Teams connection" className={className}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Teams connection</span>
          <Badge variant="destructive">Check failed</Badge>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void load(true)}>
            <RefreshCw className={busy ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            Refresh
          </Button>
        </div>
        <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>
      </section>
    )
  }

  const look = presentation(status)
  const { Icon } = look
  const checked = timeOf(status.checkedAt)
  const expires = timeOf(status.expiresAt)
  const needsAttention = status.state === 'expired' || status.state === 'error'
  const accounts = status.accounts ?? []

  return (
    <section aria-label="Teams connection" className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{status.label} connection</h3>
            <Badge variant={look.variant} className="gap-1">
              <Icon className={`h-3 w-3 ${look.className}`} />
              {look.text}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {checked ? `Last checked ${checked}` : 'Not checked yet'}
            {expires ? ` · Token valid until ${expires}` : ''}
          </p>
          {status.detail && <p className="break-words text-xs text-muted-foreground">{status.detail}</p>}
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void load(true)}>
          <RefreshCw className={busy ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refresh
        </Button>
      </div>

      {accounts.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Teams accounts">
          {accounts.map(account => {
            const accountLook = presentation({ ...status, state: account.state })
            const AccountIcon = accountLook.Icon
            const confirming = confirmRemove === account.id
            return (
              <li key={account.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <AccountIcon className={`h-4 w-4 shrink-0 ${accountLook.className}`} />
                <span className="min-w-0 flex-1 truncate font-medium" title={account.detail}>{account.name}</span>
                <Badge variant={accountLook.variant}>{accountLook.text}</Badge>
                {account.state !== 'connected' && (
                  <Button size="sm" variant="outline" onClick={() => startReauth()}>
                    <LogIn className="mr-2 h-3.5 w-3.5" />
                    Sign in again
                  </Button>
                )}
                {confirming ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={removing} onClick={() => void removeAccount(account.id)}>
                      {removing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" disabled={removing} onClick={() => setConfirmRemove(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${account.name}`} title="Remove account"
                    onClick={() => setConfirmRemove(account.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {account.tenants && account.tenants.length > 0 && (
                  <ul aria-label={`Organizations for ${account.name}`} className="w-full space-y-1 border-t pt-2 pl-6">
                    {account.tenants.map(tenant => (
                      <li key={tenant.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{tenant.name}</span>
                        {tenant.connected ? <Badge variant="secondary">Connected</Badge> : (
                          <Button size="sm" variant="outline" onClick={() => startReauth({ accountId: account.id, tenantId: tenant.id, name: tenant.name })}>
                            <LogIn className="mr-2 h-3.5 w-3.5" /> Sign in
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {account.tenantError && <p role="status" className="w-full pl-6 text-xs text-muted-foreground">{account.tenantError}</p>}
                {confirming && (
                  <p className="w-full text-xs text-muted-foreground">
                    Stops syncing this Teams account. Its chats stay in Matrix but no longer update.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {needsAttention && accounts.length === 0 && (
        <p className="mt-3 text-xs text-destructive">
          {status.state === 'expired' ? 'No Teams account is signed in.' : 'The Teams connection could not be verified.'}
        </p>
      )}

      <Button variant="outline" size="sm" className="mt-3" onClick={() => startReauth()}>
        <Plus className="mr-2 h-4 w-4" />
        Add Teams account
      </Button>

      <Dialog open={reauthOpen} onOpenChange={open => { if (!open) closeReauth() }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedTenant ? `Sign in to ${selectedTenant.name}` : 'Sign in to Microsoft Teams'}</DialogTitle>
            <DialogDescription>
              {selectedTenant ? `Sign in with your usual account, then select ${selectedTenant.name} in Teams if needed. Guest accounts normally use their original email address. Jait will connect once it receives a session for that organization.` : 'Sign in with the Teams account you want to add or renew in the window below. Jait picks up the new session automatically.'}
            </DialogDescription>
          </DialogHeader>
          {reauth?.liveViewUrl && reauth.phase === 'waiting_login' ? (
            <div className="h-[60vh] overflow-hidden rounded-lg border">
              <NoVncSessionView source={reauth.liveViewUrl} title="Teams sign-in" className="h-full w-full border-0 bg-white" />
            </div>
          ) : (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              {(reauth?.phase === 'starting' || reauth?.phase === 'applying') && <Loader2 className="h-4 w-4 animate-spin" />}
              {reauth?.phase === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              <span role={reauth?.phase === 'error' ? 'alert' : 'status'} className={reauth?.phase === 'error' ? 'text-destructive' : ''}>
                {reauth?.message}
              </span>
            </div>
          )}
          {reauth?.phase === 'error' && (
            <Button size="sm" onClick={() => startReauth(selectedTenant)}>Try again</Button>
          )}
        </DialogContent>
      </Dialog>

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  )
}
