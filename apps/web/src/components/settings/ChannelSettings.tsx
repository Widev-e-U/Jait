import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy, ExternalLink, Loader2, MessageCircle, Plug, Power, QrCode, RefreshCw, CheckCircle2 } from 'lucide-react'
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
  /** Deliver gateway notifications and routine output to this channel. */
  notifications?: boolean
  /** Agent decides tool use itself instead of asking in the chat. */
  autoApprove?: boolean
  /** Show tool calls in a live-updating message while the agent works. */
  progress?: boolean
  /** Per-channel model override, set in-chat with /model. */
  model?: string
  /** Whether a channel credential (Telegram bot token) is stored. Never the token itself. */
  tokenSet?: boolean
}

interface ChannelInfo {
  id: string
  label: string
  status: ChannelStatus
  enabled: boolean
  qr: string | null
  /** Deep link behind the QR, when the channel links via a link (Telegram). */
  link?: string | null
  /** ISO timestamp at which the shown pairing code stops working. */
  expiresAt?: string | null
  config: ChannelConfig
}

/** Instructions for creating the messenger account this channel talks through. */
interface SetupGuide {
  link: string
  qr: string | null
  suggestedName: string
  suggestedUsername: string
}

/**
 * Same shape the gateway accepts — lets the UI recognise a usable token inside
 * a pasted BotFather message and connect without waiting for a click.
 */
const BOT_TOKEN_RE = /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/

/** Seconds as m:ss — a bare seconds count reads badly past a minute. */
function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/** Whole seconds until `iso`, floored at 0. Null when there is no deadline. */
function useSecondsLeft(iso: string | null): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!iso) { setSeconds(0); return }
    const tick = () => setSeconds(Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [iso])
  return seconds
}

/** Small copy-to-clipboard button for the suggested bot name / username. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 shrink-0 text-xs"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
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
  if (channel.id === 'telegram') {
    return 'Create a bot with @BotFather, paste its token, then scan the QR to link your Telegram account.'
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
  const [link, setLink] = useState<string | null>(channel.link ?? null)
  const [expiresAt, setExpiresAt] = useState<string | null>(channel.expiresAt ?? null)
  const [status, setStatus] = useState<ChannelStatus>(channel.status)
  const [statusError, setStatusError] = useState<string | undefined>()
  const [allowed, setAllowed] = useState((channel.config.allowedSenders ?? []).join(', '))
  const [respondToAll, setRespondToAll] = useState(Boolean(channel.config.respondToAll))
  const [notifications, setNotifications] = useState(Boolean(channel.config.notifications))
  // Defaults to on — an assistant that asks before every step is unusable on a phone.
  const [autoApprove, setAutoApprove] = useState(channel.config.autoApprove !== false)
  const [progress, setProgress] = useState(channel.config.progress !== false)
  // Set in-chat with /model — displayed here, not editable, so both ends agree.
  const [modelOverride, setModelOverride] = useState(channel.config.model ?? '')
  const [tokenSet, setTokenSet] = useState(Boolean(channel.config.tokenSet))
  const [tokenInput, setTokenInput] = useState('')
  const [setup, setSetup] = useState<SetupGuide | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const secondsLeft = useSecondsLeft(expiresAt)

  /** Telegram authenticates with a bot token instead of a device link. */
  const needsToken = channel.id === 'telegram'
  const canRepair = channel.id === 'telegram'

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
        const data = await res.json() as {
          status: ChannelStatus
          qr: string | null
          link?: string | null
          expiresAt?: string | null
          error?: string
          config?: ChannelConfig
        }
        setStatus(data.status)
        setQr(data.qr)
        setLink(data.link ?? null)
        setExpiresAt(data.expiresAt ?? null)
        setStatusError(data.error)
        if (data.status === 'connected') {
          // Pairing writes the linked account into the allowlist server-side —
          // pull it in so the field doesn't overwrite it on the next save.
          if (data.config?.allowedSenders) setAllowed(data.config.allowedSenders.join(', '))
          stopPolling()
          onChanged()
        }
        if (data.status === 'error') stopPolling()
      } catch { /* keep polling */ }
    }, 2000)
    return stopPolling
  }, [status, channel.id, token, stopPolling, onChanged])

  useEffect(() => () => stopPolling(), [stopPolling])

  // /model and /notifications also change these server-side, so mirror whatever
  // the last list refresh brought back instead of keeping a stale local copy.
  useEffect(() => {
    setModelOverride(channel.config.model ?? '')
    setNotifications(Boolean(channel.config.notifications))
    setAutoApprove(channel.config.autoApprove !== false)
    setProgress(channel.config.progress !== false)
  }, [channel.config.model, channel.config.notifications, channel.config.autoApprove, channel.config.progress])

  // Fetch the "create the bot" guide while there is no credential yet.
  useEffect(() => {
    if (!needsToken || tokenSet || status === 'connected') { setSetup(null); return }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/channels/${channel.id}/setup`, { headers: authHeaders(token) })
        if (!res.ok) return
        const data = await res.json() as SetupGuide
        if (!cancelled) setSetup(data)
      } catch { /* the manual instructions below still work */ }
    })()
    return () => { cancelled = true }
  }, [needsToken, tokenSet, status, channel.id, token])

  const start = useCallback(async (pastedToken?: string) => {
    setBusy(true); setError(null)
    try {
      // Persist a freshly pasted bot token first — the connector reads it on start.
      const pending = (pastedToken ?? tokenInput).trim()
      if (needsToken && pending) {
        const saved = await fetch(`${API_URL}/api/channels/${channel.id}/config`, {
          method: 'PATCH',
          headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: pending }),
        })
        if (!saved.ok) throw new Error(`Failed to save token (HTTP ${saved.status})`)
        setTokenSet(true); setTokenInput('')
      }
      const res = await fetch(`${API_URL}/api/channels/${channel.id}/start`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        // Scanning happens on a phone — the confirmation message links back here.
        body: JSON.stringify({ returnUrl: window.location.href }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed to start (HTTP ${res.status})`)
      setStatus((data as { status?: ChannelStatus }).status ?? 'connecting')
      setQr((data as { qr?: string | null }).qr ?? null)
      setLink((data as { link?: string | null }).link ?? null)
      setExpiresAt((data as { expiresAt?: string | null }).expiresAt ?? null)
      setStatusError((data as { error?: string }).error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally { setBusy(false) }
  }, [channel.id, token, needsToken, tokenInput])

  /**
   * BotFather replies with the token inside a sentence. Pull it out of whatever
   * was pasted and connect straight away — no extra click.
   */
  const onTokenInput = useCallback((value: string) => {
    const match = BOT_TOKEN_RE.exec(value)
    setTokenInput(match ? match[0] : value)
    if (match) void start(match[0])
  }, [start])

  /** Re-enter pairing mode to link an additional account. */
  const pair = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API_URL}/api/channels/${channel.id}/pair`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed to start pairing (HTTP ${res.status})`)
      setStatus((data as { status?: ChannelStatus }).status ?? 'qr')
      setQr((data as { qr?: string | null }).qr ?? null)
      setLink((data as { link?: string | null }).link ?? null)
      setExpiresAt((data as { expiresAt?: string | null }).expiresAt ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pairing')
    } finally { setBusy(false) }
  }, [channel.id, token])

  const stop = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API_URL}/api/channels/${channel.id}/stop`, { method: 'POST', headers: authHeaders(token) })
      if (!res.ok) throw new Error(`Failed to stop (HTTP ${res.status})`)
      setStatus('stopped'); setQr(null); setLink(null); setExpiresAt(null); stopPolling()
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
        body: JSON.stringify({ allowedSenders, respondToAll, notifications, autoApprove, progress }),
      })
      if (!res.ok) throw new Error(`Failed to save (HTTP ${res.status})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setBusy(false) }
  }, [allowed, respondToAll, notifications, autoApprove, progress, channel.id, token])

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
        <div className="flex shrink-0 items-center gap-2">
          {status === 'connected' && canRepair && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void pair()} className="h-8 text-xs">
              <QrCode className="mr-1 h-3.5 w-3.5" /> Link account
            </Button>
          )}
          {status === 'connected' ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void stop()} className="h-8 text-xs">
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Power className="mr-1 h-3.5 w-3.5" />}
              Disconnect
            </Button>
          ) : (
            <Button size="sm" disabled={busy || (needsToken && !tokenSet && !tokenInput.trim())} onClick={() => void start()} className="h-8 text-xs">
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-1 h-3.5 w-3.5" />}
              {status === 'qr' || status === 'connecting' ? 'Restart' : 'Connect'}
            </Button>
          )}
        </div>
      </div>

      {/* Step 1 — create the bot in BotFather. Only while there is no token. */}
      {needsToken && !tokenSet && status !== 'connected' && setup && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">1. Create the bot</p>
            <p className="text-xs text-muted-foreground">
              Scan to open <span className="font-mono">@BotFather</span> with <span className="font-mono">/newbot</span> ready to send,
              then answer with the two suggestions below.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {setup.qr && (
              <img
                src={setup.qr}
                alt="QR code opening BotFather in Telegram"
                className="h-44 w-44 shrink-0 self-center rounded bg-white p-2 [image-rendering:pixelated]"
              />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Name (first answer)</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={setup.suggestedName} className="h-8 font-mono text-xs" />
                  <CopyButton value={setup.suggestedName} label="bot name" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Username (second answer)</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={setup.suggestedUsername} className="h-8 font-mono text-xs" />
                  <CopyButton value={setup.suggestedUsername} label="bot username" />
                </div>
              </div>
              <Button size="sm" variant="outline" asChild className="h-8 text-xs">
                <a href={setup.link} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open BotFather
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — the bot token. Pasting a valid one connects immediately. */}
      {needsToken && status !== 'connected' && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <label className="block text-sm font-medium">
            {tokenSet ? 'Bot token' : '2. Paste BotFather’s reply'}
          </label>
          <Input
            type={tokenSet ? 'password' : 'text'}
            value={tokenInput}
            onChange={(e) => onTokenInput(e.target.value)}
            placeholder={tokenSet ? 'Token stored — paste a new one to replace it' : 'Paste the whole message — the token is picked out for you'}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Telegram has no API for creating bots, so this one paste stays manual. Everything after it is automatic:
            the connection starts as soon as a token is recognised.
          </p>
        </div>
      )}

      {(error || statusError) && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? statusError}</span>
        </div>
      )}

      {linking && (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-5">
          {qr ? (
            <img
              src={qr}
              alt={`${channel.label} link QR code`}
              className="h-72 w-72 rounded bg-white p-2 [image-rendering:pixelated]"
            />
          ) : (
            <div className="flex h-72 w-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
          {link ? (
            <>
              <p className="text-center text-xs text-muted-foreground">
                {needsToken ? '3. ' : ''}Scan with your phone, then tap <span className="font-medium">Start</span> — your user id is
                filled in and saved automatically, and the bot sends you a link back here.
              </p>
              <Button size="sm" variant="outline" asChild className="h-8 text-xs">
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open in Telegram
                </a>
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" /> QR refreshes automatically — scan it with your phone.
            </p>
          )}
          {expiresAt && (
            secondsLeft > 0 ? (
              <p className="text-xs text-muted-foreground">
                Code expires in <span className="font-mono font-medium text-foreground">{formatCountdown(secondsLeft)}</span>
              </p>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">This code has expired.</p>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void pair()} className="h-8 text-xs">
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> New code
                </Button>
              </div>
            )
          )}
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
            placeholder={needsToken
              ? 'e.g. 123456789  (Telegram user ids, comma-separated — filled in by pairing)'
              : 'e.g. +49170…, +1202…  (comma-separated, blank = self-chat only)'}
          />
          {needsToken && (
            <p className="mt-1 text-xs text-muted-foreground">
              Scanning the QR adds and saves your user id here — no need to press Save for that.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <div>
            <p className="text-sm font-medium">Decide about tools automatically</p>
            <p className="text-xs text-muted-foreground">
              When off, the assistant asks in the chat before running each tool. Irreversible
              commands ask either way.
            </p>
          </div>
          <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <div>
            <p className="text-sm font-medium">Show progress while working</p>
            <p className="text-xs text-muted-foreground">
              Mirrors tool calls into a message that updates as the reply is worked out.
            </p>
          </div>
          <Switch checked={progress} onCheckedChange={setProgress} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <div>
            <p className="text-sm font-medium">Notifications & routines</p>
            <p className="text-xs text-muted-foreground">
              Send gateway alerts and scheduled routine output to the linked accounts here.
            </p>
          </div>
          <Switch checked={notifications} onCheckedChange={setNotifications} />
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveConfig()} className="h-8 text-xs">
          Save rules
        </Button>
        {status === 'connected' && (
          <p className="text-xs text-muted-foreground">
            In the chat: <span className="font-mono">/model</span> switches the model{modelOverride ? ` (currently ${modelOverride})` : ''},
            {' '}<span className="font-mono">/approvals ask|auto</span>, <span className="font-mono">/progress on|off</span>, <span className="font-mono">/notifications on|off</span>,
            {' '}<span className="font-mono">/status</span>, <span className="font-mono">/help</span>.
          </p>
        )}
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
        <h2 className="text-base font-medium">Connectors</h2>
        <p className="text-sm text-muted-foreground">
          Connect external messaging apps so your assistant can chat through them.
          Telegram is built in — paste a bot token and scan the code.
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
            No connectors available. Telegram ships with the gateway — if it is missing here,
            the gateway needs a restart. Additional channels come from Extensions.
          </p>
        </Card>
      ) : (
        channels.map((c) => <ChannelCard key={c.id} token={token} channel={c} onChanged={load} />)
      )}
    </div>
  )
}
