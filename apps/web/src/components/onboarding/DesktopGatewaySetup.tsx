import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { DesktopGatewayConfig, DesktopGatewayStatus } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clearAuthTokenForGatewayChange } from '@/lib/auth-token'
import { getApiUrl, getStoredGatewayUrl, setStoredGatewayUrl } from '@/lib/gateway-url'

export function DesktopGatewaySetup({ onReady }: { onReady?: () => void }) {
  const id = useId()
  const [config, setConfig] = useState<DesktopGatewayConfig>(() => {
    const boot = window.__JAIT_DESKTOP_BOOT__
    return {
      mode: 'remote', port: 18000, allowNetwork: false,
      ...boot?.gatewayConfig,
      remoteUrl: boot?.gatewayConfig?.remoteUrl ?? getStoredGatewayUrl() ?? (boot?.gatewayConfigured ? boot.gatewayUrl ?? null : null),
    }
  })
  const [status, setStatus] = useState<DesktopGatewayStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = useRef(onReady)
  ready.current = onReady
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const next = await window.jaitDesktop!.getGatewayStatus!()
        if (cancelled) return
        setStatus(next)
        if (next.state === 'running' && next.url === getApiUrl()) ready.current?.()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
      if (!cancelled) timer = setTimeout(() => { void refresh() }, 2000)
    }
    void refresh()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  async function apply(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = { ...config, remoteUrl: config.remoteUrl?.trim().replace(/\/+$/, '') || null }
      if (next.mode === 'remote') {
        const url = new URL(next.remoteUrl ?? '')
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter an HTTP(S) gateway URL without credentials, query, or fragment.')
        const response = await fetch(`${next.remoteUrl}/health`, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) throw new Error(`Gateway returned ${response.status}`)
      }
      if (!Number.isInteger(next.port) || next.port < 1024 || next.port > 65535) throw new Error('Choose a port between 1024 and 65535.')
      // Clear the credential before changing native configuration: even if
      // startup fails and the user quits, the next launch cannot send the old
      // gateway's bearer token to a newly selected server.
      const target = next.mode === 'local' ? `http://127.0.0.1:${next.port}` : next.remoteUrl
      if (target !== getApiUrl()) await clearAuthTokenForGatewayChange()
      const result = await window.jaitDesktop!.configureGateway!(next)
      setStatus(result)
      setStoredGatewayUrl(next.mode === 'remote' ? next.remoteUrl : null)
      await window.jaitDesktop!.restartGatewayApp!()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => { void apply(event) }} className="w-full space-y-4 text-left">
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-base font-medium">Choose your gateway</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name={`${id}-mode`} checked={config.mode === 'local'} onChange={() => setConfig({ ...config, mode: 'local' })} />
          Host on this computer
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name={`${id}-mode`} checked={config.mode === 'remote'} onChange={() => setConfig({ ...config, mode: 'remote' })} />
          Connect to an existing gateway
        </label>
        {config.mode === 'local' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Jait runs in the background while this computer is awake. Closing the window keeps it in the tray; quitting Jait stops the gateway.</p>
            <Label htmlFor={`${id}-port`}>Gateway port</Label>
            <Input id={`${id}-port`} type="number" min={1024} max={65535} value={config.port || ''} onChange={e => setConfig({ ...config, port: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.allowNetwork} onChange={e => setConfig({ ...config, allowNetwork: e.target.checked })} />
              Allow other devices to connect
            </label>
            {config.allowNetwork && <p className="text-xs text-muted-foreground">After creating your account, connect other devices using this computer’s network address and port {config.port}. They must sign in and receive node permissions. Your firewall must allow this port.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`${id}-url`}>Gateway URL</Label>
            <Input id={`${id}-url`} type="url" required placeholder="https://jait.example.com" value={config.remoteUrl ?? ''} onChange={e => setConfig({ ...config, remoteUrl: e.target.value })} />
          </div>
        )}
      </fieldset>
      {status && <p role="status" className="text-xs text-muted-foreground">Local gateway: {status.state}{status.config.mode === 'local' && status.url ? ` · ${status.url}` : ''}</p>}
      {(error || status?.error) && <p role="alert" className="text-sm text-destructive">{error || status?.error}</p>}
      {status?.logs.length ? <details className="text-xs"><summary>Gateway log</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{status.logs.join('\n')}</pre></details> : null}
      <p className="text-xs text-muted-foreground">Each gateway has its own chats and settings. Applying this choice restarts the desktop app.</p>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Applying gateway…' : 'Apply and restart'}</Button>
    </form>
  )
}
