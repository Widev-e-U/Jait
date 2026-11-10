import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, LogIn, RefreshCw, ShieldQuestion } from 'lucide-react'
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

  const callReauth = useCallback(async (method: 'GET' | 'POST' | 'DELETE') => {
    try {
      const response = await fetch(REAUTH_URL, {
        method,
        credentials: 'include',
        headers: { Accept: 'application/json' },
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

  const startReauth = () => {
    setReauthOpen(true)
    setReauth({ phase: 'starting', message: 'Starting browser…', liveViewUrl: null })
    void callReauth('POST')
  }

  const closeReauth = () => {
    setReauthOpen(false)
    if (reauth && ['starting', 'waiting_login', 'applying'].includes(reauth.phase)) void callReauth('DELETE')
  }

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

      {needsAttention && (
        <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">
            {status.state === 'expired'
              ? 'The Teams session has expired. Sign in again to resume syncing.'
              : 'The Teams connection could not be verified.'}
          </p>
          <Button size="sm" onClick={startReauth}>
            <LogIn className="mr-2 h-4 w-4" />
            Reconnect Teams
          </Button>
          <p className="text-xs text-muted-foreground">Messages from Teams stay missing until the session is renewed.</p>
        </div>
      )}

      {!needsAttention && status.state === 'connected' && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={startReauth}>
          <LogIn className="mr-2 h-4 w-4" />
          Sign in again
        </Button>
      )}

      <Dialog open={reauthOpen} onOpenChange={open => { if (!open) closeReauth() }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Reconnect Microsoft Teams</DialogTitle>
            <DialogDescription>
              Sign in to Teams in the window below. Jait picks up the new session automatically; no passwords or tokens pass through this page.
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
            <Button size="sm" onClick={startReauth}>Try again</Button>
          )}
        </DialogContent>
      </Dialog>

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  )
}
