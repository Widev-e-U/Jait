import { useEffect, useState } from 'react'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

interface BrowserState { sessionId: string; browserId?: string; url: string | null; sharedWithAgent: boolean; verified: boolean }

// Only gateway live views can be embedded. Page URLs remain ordinary links.
function liveViewUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/noVNC/')) return null
  try {
    const url = new URL(value, 'http://gateway')
    return url.origin === 'http://gateway' && /^\/?api\/live-view\/\d+\/websockify$/.test(url.searchParams.get('path') ?? '') ? value : null
  } catch { return null }
}

export function ChatBrowserView({ data, sessionId, authToken, autoOpen }: {
  data?: Record<string, unknown>; sessionId?: string | null; authToken?: string | null; autoOpen: boolean
}) {
  const record = (data?.browserSession ?? (liveViewUrl(data?.url) ? { ...data, previewUrl: data?.url, controller: data?.sharedWithAgent ? 'agent' : 'user' } : undefined)) as Record<string, unknown> | undefined
  const id = typeof record?.sessionId === 'string' ? record.sessionId : sessionId
  const browserId = typeof data?.browserId === 'string' ? data.browserId : undefined
  const [expanded, setExpanded] = useState(autoOpen)
  const [state, setState] = useState<BrowserState | null>(() => id && liveViewUrl(record?.previewUrl) ? {
    sessionId: id, browserId, url: liveViewUrl(record?.previewUrl), sharedWithAgent: record?.controller === 'agent', verified: false,
  } : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined

  useEffect(() => {
    if (!id || !expanded) return
    let cancelled = false
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const response = await apiFetch(`${getApiUrl()}/api/preview/session/${encodeURIComponent(id)}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, signal: controller.signal })
        if (!response.ok) { if (!cancelled) setState(null); return }
        const { session } = await response.json()
        if (!cancelled) setState(session?.status === 'ready' && (!browserId || session.browserId === browserId) ? {
          sessionId: id, browserId: session.browserId, url: liveViewUrl(session.url), sharedWithAgent: session.sharedWithAgent === true, verified: true,
        } : null)
      } catch { /* Leave the last live view available during a temporary disconnect. */ }
      finally { if (!cancelled) timer = setTimeout(load, 3000) }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [id, browserId, authToken, expanded])

  const setShared = async () => {
    if (!state?.verified || busy) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch(`${getApiUrl()}/api/preview/share`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, sharedWithAgent: !state.sharedWithAgent }),
      })
      if (!response.ok) throw new Error('Could not change browser control. Try again.')
      const { session } = await response.json()
      setState((previous) => previous ? { ...previous, sharedWithAgent: session.sharedWithAgent === true } : null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change browser control.') }
    finally { setBusy(false) }
  }
  if (!id) return null
  return (
    <div className="border-b border-border/40">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="font-medium text-cyan-600 hover:underline">{expanded ? 'Hide browser' : 'Show browser'}</button>
        {state?.url && <>
          <span className="ml-auto text-muted-foreground">{state.sharedWithAgent ? 'Agent is controlling' : 'You are controlling'}</span>
          <button type="button" disabled={busy || !state.verified} onClick={() => void setShared()} className="rounded border px-2 py-1 disabled:opacity-50">{busy ? 'Changing control…' : state.sharedWithAgent ? 'Take control' : 'Share with agent'}</button>
        </>}
      </div>
      {error && <p role="alert" className="px-3 pb-2 text-destructive">{error}</p>}
      {expanded && (state?.url ? <div className="h-[420px] min-h-64 max-h-[65vh] w-full">
        <NoVncSessionView source={state.url} title="Agent browser" viewOnly={state.sharedWithAgent || busy || !state.verified} className="h-full w-full border-0 bg-white" />
      </div> : <p className="px-3 pb-3 text-muted-foreground">No live browser is available for this chat.</p>)}
    </div>
  )
}
