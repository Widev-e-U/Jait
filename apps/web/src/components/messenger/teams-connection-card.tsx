import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, RefreshCw, ShieldQuestion } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface BridgeStatus {
  platform: string
  label: string
  state: 'connected' | 'expired' | 'error' | 'unknown'
  checkedAt: string
  expiresAt?: string
  detail?: string
  reauth?: { command?: string; hint?: string }
}

const POLL_MS = 60_000

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
  const [copied, setCopied] = useState(false)

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

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

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

      {needsAttention && (status.reauth?.hint || status.reauth?.command) && (
        <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          {status.reauth?.hint && <p className="text-xs text-destructive">{status.reauth.hint}</p>}
          {status.reauth?.command && (
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded bg-background/80 px-2 py-1 text-xs">{status.reauth.command}</code>
              <Button variant="outline" size="sm" onClick={() => void copyCommand(status.reauth?.command ?? '')}>
                <Copy className="mr-2 h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Messages from Teams stay missing until the session is renewed.</p>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  )
}
