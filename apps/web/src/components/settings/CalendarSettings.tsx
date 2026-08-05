import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Copy, Eye, EyeOff, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calendarApi, type CalendarAccount } from '@/lib/calendar-api'

export function CalendarSettings({ token }: { token: string | null }) {
  const [configured, setConfigured] = useState(false)
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [redirectUri, setRedirectUri] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const [config, connectedAccounts] = await Promise.all([calendarApi.config(), calendarApi.accounts()])
      setConfigured(config.google)
      setRedirectUri(config.redirectUri || '')
      setAccounts(connectedAccounts)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load calendar settings')
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const handleOAuth = (event: MessageEvent) => {
      if (event.data?.type !== 'jait-calendar-oauth') return
      if (event.data.ok) {
        toast.success('Google Calendar connected')
        void load()
      } else {
        toast.error('Google Calendar connection failed')
      }
    }
    window.addEventListener('message', handleOAuth)
    return () => window.removeEventListener('message', handleOAuth)
  }, [load])

  const saveCredentials = useCallback(async () => {
    if (!clientId.trim() || !clientSecret.trim()) return
    setBusy(true)
    try {
      await calendarApi.saveAppCredentials(clientId.trim(), clientSecret.trim())
      setConfigured(true)
      setClientId('')
      setClientSecret('')
      toast.success('Calendar OAuth credentials saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save credentials')
    } finally {
      setBusy(false)
    }
  }, [clientId, clientSecret])

  const connect = useCallback(async () => {
    setBusy(true)
    try {
      const { authUrl, redirectUri: nextRedirect } = await calendarApi.connectUrl()
      if (nextRedirect) setRedirectUri(nextRedirect)
      const popup = window.open(authUrl, 'jait-calendar-oauth', 'width=560,height=720,noopener=false')
      if (!popup) window.location.assign(authUrl)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start Google connection')
    } finally {
      setBusy(false)
    }
  }, [])

  const copyRedirect = useCallback(async () => {
    if (!redirectUri) return
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy redirect URI')
    }
  }, [redirectUri])

  const disconnect = useCallback(async (account: CalendarAccount) => {
    setBusy(true)
    try {
      await calendarApi.disconnect(account.id)
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      toast.success(`Disconnected ${account.email}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect calendar')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-medium">
          <CalendarDays className="h-4 w-4" />
          Google Calendar
          {configured && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gives agents and scheduled jobs read-only access to upcoming events. Samsung Calendar events appear here when that Google account is enabled in Samsung Calendar sync.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        {accounts.length > 0 ? (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.email}</p>
                  <p className="text-xs text-muted-foreground">Google Calendar · read-only</p>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void disconnect(account)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Disconnect
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No calendar account connected yet.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy || !configured} onClick={() => void connect()}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Connect Google Calendar
          </Button>
          {!configured && (
            <span className="text-xs text-muted-foreground">Add Google OAuth credentials below, or configure Gmail OAuth first.</span>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-medium">OAuth credentials</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Jait automatically reuses Gmail OAuth credentials when present. Only fill this in if Calendar should use a different Google OAuth app. Add the authorized redirect URI below and enable the Google Calendar API.
          </p>
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium">Authorized redirect URI</p>
            <p className="mt-0.5 break-all text-xs text-muted-foreground">
              If Google shows &ldquo;redirect_uri not valid&rdquo;, copy the exact URI below into your Google Cloud OAuth client&apos;s <span className="font-medium">Authorized redirect URIs</span>.
            </p>
            {redirectUri ? (
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1.5 text-xs">{redirectUri}</code>
                <Button size="sm" variant="outline" onClick={() => void copyRedirect()} aria-label="Copy redirect URI">
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Sign in to load the redirect URI.</p>
            )}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open Google Cloud OAuth credentials <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="calendar-client-id" className="text-xs">Client ID</Label>
            <Input id="calendar-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Google OAuth client ID" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calendar-client-secret" className="text-xs">Client Secret</Label>
            <div className="relative">
              <Input id="calendar-client-secret" type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Google OAuth client secret" className="pr-9" />
              <button type="button" onClick={() => setShowSecret((value) => !value)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showSecret ? 'Hide value' : 'Show value'}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        <Button size="sm" disabled={busy || !clientId.trim() || !clientSecret.trim()} onClick={() => void saveCredentials()}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save Calendar credentials
        </Button>
      </Card>
    </div>
  )
}
