import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, MessageCircle, Plug, Power, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

type ChannelStatus = 'stopped' | 'connecting' | 'qr' | 'connected' | 'error'

interface ChannelConfig {
  enabled?: boolean
  allowedSenders?: string[]
  respondToAll?: boolean
  tools?: string[]
}

interface ChannelInfo {
  id: string
  label: string
  status: ChannelStatus
  enabled: boolean
  qr: string | null
  config: ChannelConfig
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const STATUS_BADGE: Record<ChannelStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  stopped: { label: 'Disconnected', variant: 'outline' },
  connecting: { label: 'Connecting…', variant: 'secondary' },
  qr: { label: 'Scan QR to link', variant: 'secondary' },
  connected: { label: 'Connected', variant: 'default' },
  error: { label: 'Error', variant: 'destructive' },
}

function channelHelpText(channel: ChannelInfo): string {
  if (channel.id === 'whatsapp') {
    return 'Link your WhatsApp so the assistant can reply to messages. Scan the QR with WhatsApp Linked devices.'
  }
  if (channel.id === 'msteams') {
    return 'Connect a Microsoft Teams bot so the assistant can reply to Teams conversations.'
  }
  return 'Connect this messaging channel so the assistant can reply through it.'
}

function ChannelCard({ token, channel, onChanged }: { token: string | null; channel: ChannelInfo; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(channel.qr)
  const [status, setStatus] = useState<ChannelStatus>(channel.status)
  const [statusError, setStatusError] = useState<string | undefined>()
  const [allowed, setAllowed] = useState((channel.config.allowedSenders ?? []).join(', '))
  const [respondToAll, setRespondToAll] = useState(Boolean(channel.config.respondToAll))
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  // Poll status/QR while linking.
  useEffect(() => {
    if (status !== 'qr' && status !== 'connecting') { stopPolling(); return }
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/channels/${channel.id}/status`, { headers: authHeaders(token) })
        if (!res.ok) return
        const data = await res.json() as { status: ChannelStatus; qr: string | null; error?: string }
        setStatus(data.status)
        setQr(data.qr)
        setStatusError(data.error)
        if (data.status === 'connected') { stopPolling(); onChanged() }
        if (data.status === 'error') stopPolling()
      } catch { /* keep polling */ }
    }, 2000)
    return stopPolling
  }, [status, channel.id, token, stopPolling, onChanged])

  useEffect(() => () => stopPolling(), [stopPolling])

  const start = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API_URL}/api/channels/${channel.id}/start`, { method: 'POST', headers: authHeaders(token) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed to start (HTTP ${res.status})`)
      setStatus((data as { status?: ChannelStatus }).status ?? 'connecting')
      setQr((data as { qr?: string | null }).qr ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally { setBusy(false) }
  }, [channel.id, token])

  const stop = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API_URL}/api/channels/${channel.id}/stop`, { method: 'POST', headers: authHeaders(token) })
      if (!res.ok) throw new Error(`Failed to stop (HTTP ${res.status})`)
      setStatus('stopped'); setQr(null); stopPolling()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop')
    } finally { setBusy(false) }
  }, [channel.id, token, stopPolling])

  const saveConfig = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const allowedSenders = allowed.split(',').map((s) => s.trim()).filter(Boolean)
      const res = await fetch(`${API_URL}/api/channels/${channel.id}/config`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedSenders, respondToAll }),
      })
      if (!res.ok) throw new Error(`Failed to save (HTTP ${res.status})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setBusy(false) }
  }, [allowed, respondToAll, channel.id, token])

  const badge = STATUS_BADGE[status]
  const linking = status === 'qr'

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{channel.label}</span>
            <Badge variant={badge.variant} className="text-2xs">{badge.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {channelHelpText(channel)}
          </p>
        </div>
        <div className="shrink-0">
          {status === 'connected' ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void stop()} className="h-8 text-xs">
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Power className="mr-1 h-3.5 w-3.5" />}
              Disconnect
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void start()} className="h-8 text-xs">
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-1 h-3.5 w-3.5" />}
              {status === 'qr' || status === 'connecting' ? 'Restart' : 'Connect'}
            </Button>
          )}
        </div>
      </div>

      {(error || statusError) && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? statusError}</span>
        </div>
      )}

      {linking && (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-5">
          {qr ? (
            <img src={qr} alt={`${channel.label} link QR code`} className="h-56 w-56 rounded bg-white p-2" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" /> QR refreshes automatically — scan it with your phone.
          </p>
        </div>
      )}

      {status === 'connected' && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Linked. The assistant will reply based on the rules below.
        </div>
      )}

      {/* Reply rules */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Respond to everyone</p>
            <p className="text-xs text-muted-foreground">When off, replies only to your self-chat and the allowed numbers below.</p>
          </div>
          <Switch checked={respondToAll} onCheckedChange={setRespondToAll} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Allowed senders</label>
          <Input
            value={allowed}
            onChange={(e) => setAllowed(e.target.value)}
            placeholder="e.g. +49170…, +1202…  (comma-separated, blank = self-chat only)"
          />
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveConfig()} className="h-8 text-xs">
          Save rules
        </Button>
      </div>
    </Card>
  )
}

export function ChannelSettings({ token }: { token: string | null }) {
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_URL}/api/channels`, { headers: authHeaders(token) })
      if (!res.ok) throw new Error(`Failed to load channels (HTTP ${res.status})`)
      setChannels(await res.json() as ChannelInfo[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels')
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-4">
      <Card className="space-y-1 p-5">
        <h2 className="text-base font-medium">Channels</h2>
        <p className="text-sm text-muted-foreground">
          Connect external messaging apps so your assistant can chat through them.
        </p>
      </Card>

      {error && (
        <Card className="flex items-start gap-2 border-destructive/50 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {loading && channels.length === 0 ? (
        <Card className="p-5"><p className="text-sm text-muted-foreground">Loading channels…</p></Card>
      ) : channels.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            No channel extensions are enabled. Enable one in Extensions, then connect it here.
          </p>
        </Card>
      ) : (
        channels.map((c) => <ChannelCard key={c.id} token={token} channel={c} onChanged={load} />)
      )}
    </div>
  )
}
