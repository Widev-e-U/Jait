import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'
import { TooltipHint } from '@/components/ui/tooltip'

export function BrowserToolsPanel({ sessionId, authToken }: { sessionId: string; authToken?: string | null }) {
  const [revision, setRevision] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let grantId: string | undefined
    const base = getApiUrl()
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined
    const release = () => {
      if (grantId) void apiFetch(`${base}/api/preview/devtools/${grantId}`, {
        method: 'DELETE', headers,
      }).catch(() => {})
    }
    setUrl(null)
    setError('')
    void (async () => {
      try {
        const response = await apiFetch(`${base}/api/preview/devtools`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not open Chrome DevTools.')
        grantId = data.id
        if (cancelled) { release(); return }
        const frontend = new URL(data.url, base + '/')
        const socket = new URL(data.socketUrl, base + '/')
        frontend.searchParams.set(socket.protocol === 'https:' ? 'wss' : 'ws', socket.host + socket.pathname)
        setUrl(frontend.href)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not open Chrome DevTools.')
      }
    })()
    return () => { cancelled = true; release() }
  }, [sessionId, authToken, revision])

  return (
    <section aria-label="Browser tools" className="flex h-full min-h-0 w-[min(32rem,50%)] shrink-0 flex-col overflow-hidden border-l bg-background text-xs">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="font-medium">Chrome DevTools</span>
        <TooltipHint content="Reconnect Chrome DevTools">
          <button type="button" aria-label="Reconnect Chrome DevTools"
            className="rounded p-1.5 hover:bg-muted" onClick={() => setRevision(value => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </TooltipHint>
      </div>
      {error ? <p role="alert" className="p-3 text-destructive">{error}</p>
        : url ? <iframe title="Chrome DevTools" src={url} className="min-h-0 w-full flex-1 border-0" referrerPolicy="no-referrer" />
        : <p className="p-3 text-muted-foreground">Connecting Chrome DevTools…</p>}
    </section>
  )
}
