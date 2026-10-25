import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Hand, Loader2, Minimize2, RotateCcw, Settings2 } from 'lucide-react'
import { BrowserViewLayout } from '@/components/remote/browser-view-layout'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'
import { apiFetch } from '@/lib/api-fetch'
import { readBrowserCollapsed, rememberBrowserCollapsed } from '@/lib/browser-panel-state'
import { getApiUrl } from '@/lib/gateway-url'

interface BrowserState { sessionId: string; browserId?: string; url: string | null; sharedWithAgent: boolean; verified: boolean; currentUrl?: string | null }

// Fast enough to feel instant, slow enough to read as a deliberate grow/shrink.
// Kept as a class, not an inline style: an inline `transition` shorthand would
// outrank `motion-reduce:transition-none` and animate for users who asked not to.
// `[transition-*:…]` instead of `duration-*`/`ease-*`: those shorthands are ambiguous
// between transition and animation utilities in this project's Tailwind config.
const PANEL_TRANSITION = 'transition-[left,top,width,height,border-radius,box-shadow] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none'
const PANEL_INSET = 12
const PANEL_COLLAPSED = { width: 160, height: 90 }

// Measurement is cosmetic, so it must not warn when rendered on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// The panel floats above the transcript, so its frame follows the conversation column.
function panelBox(expanded: boolean, frame: { width: number; height: number; top: number }, keyboardOpen = false) {
  if (!expanded) return { left: PANEL_INSET, top: frame.top, ...PANEL_COLLAPSED }
  const width = Math.min(768, Math.max(PANEL_COLLAPSED.width, frame.width - PANEL_INSET * 2))
  const availableHeight = frame.height - frame.top - PANEL_INSET
  const desiredHeight = keyboardOpen && frame.width < 768 ? availableHeight : Math.min(Math.round(frame.height * 0.55), availableHeight)
  const height = Math.min(480, Math.max(PANEL_COLLAPSED.height, desiredHeight))
  return { left: Math.max(0, Math.round((frame.width - width) / 2)), top: frame.top, width, height }
}

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
  const id = sessionId ?? (typeof record?.sessionId === 'string' ? record.sessionId : undefined)
  const browserId = typeof data?.browserId === 'string' ? data.browserId : undefined
  const [expanded, setExpandedState] = useState(() => {
    // Remembered per chat: leaving a chat collapsed and coming back must not
    // re-expand it. The panel unmounts both on chat switches and when the user
    // sends their next message, so a fresh mount is the normal case.
    const collapsed = readBrowserCollapsed(id)
    return collapsed === undefined ? autoOpen : !collapsed
  })
  const setExpanded = useCallback((next: boolean) => {
    setExpandedState(next)
    rememberBrowserCollapsed(id, !next)
  }, [id])
  const [controlsContainer, setControlsContainer] = useState<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [frame, setFrame] = useState({ width: 768, height: 468, top: PANEL_INSET })
  const [fullscreen, setFullscreen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const optionsRef = useRef<HTMLDetailsElement>(null)
  const [state, setState] = useState<BrowserState | null>(() => id && liveViewUrl(record?.previewUrl) ? {
    sessionId: id, browserId, url: liveViewUrl(record?.previewUrl), sharedWithAgent: record?.controller === 'agent', verified: false,
  } : null)
  const [busyAction, setBusyAction] = useState<'control' | 'restart' | null>(null)
  const busy = busyAction !== null
  const [error, setError] = useState('')
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined

  // The panel is an overlay, so it sizes itself from the positioned ancestor it floats over.
  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current
    const parent = panel?.offsetParent
    if (!panel || !(parent instanceof HTMLElement)) return
    const header = document.querySelector<HTMLElement>('[data-app-header]')
    const measure = () => {
      const parentBounds = parent.getBoundingClientRect()
      const headerBounds = header?.getBoundingClientRect()
      // The phone app header floats over the transcript. Keep browser controls below it.
      const top = headerBounds && headerBounds.left < parentBounds.right && headerBounds.right > parentBounds.left
        ? Math.max(PANEL_INSET, headerBounds.bottom - parentBounds.top + 8) : PANEL_INSET
      const width = parent.clientWidth
      const height = parent.clientHeight
      setFrame((current) => (current.width === width && current.height === height && current.top === top ? current : { width, height, top }))
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(parent)
    if (header) observer?.observe(header)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [id])

  // Inline geometry would win over the fullscreen sizing, so drop it while fullscreen.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const update = () => {
      const element = document.fullscreenElement
      setFullscreen(!!element && (element === panel || panel.contains(element)))
    }
    update()
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const response = await apiFetch(`${getApiUrl()}/api/preview/session/${encodeURIComponent(id)}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, signal: controller.signal })
        if (!response.ok) { if (!cancelled) setState(null); return }
        const { session } = await response.json()
        if (!cancelled) setState(session?.status === 'ready' ? {
          sessionId: id, browserId: session.browserId, url: liveViewUrl(session.url), sharedWithAgent: session.sharedWithAgent === true, verified: true, currentUrl: session.metrics?.url ?? session.target,
        } : null)
      } catch { /* Leave the last live view available during a temporary disconnect. */ }
      finally { if (!cancelled) { clearTimeout(timer); timer = setTimeout(load, 3000) } }
    }
    const handoff = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string; pending: boolean }>).detail
      if (detail?.sessionId !== id) return
      if (detail.pending) setExpanded(true)
      clearTimeout(timer)
      void load()
    }
    window.addEventListener('jait-browser-handoff', handoff)
    void load()
    return () => {
      cancelled = true; clearTimeout(timer); controller.abort()
      window.removeEventListener('jait-browser-handoff', handoff)
    }
  }, [id, authToken, setExpanded])

  const setShared = async () => {
    if (!state?.verified || busy) return
    setBusyAction('control'); setError('')
    try {
      const response = await apiFetch(`${getApiUrl()}/api/preview/share`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, sharedWithAgent: !state.sharedWithAgent }),
      })
      if (!response.ok) throw new Error('Could not change browser control. Try again.')
      const { session } = await response.json()
      setState((previous) => previous ? { ...previous, sharedWithAgent: session.sharedWithAgent === true } : null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change browser control.') }
    finally { setBusyAction(null) }
  }
  const restartBrowser = async () => {
    if (!id || busy) return
    setBusyAction('restart'); setError('')
    try {
      const response = await apiFetch(`${getApiUrl()}/api/preview/restart`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      })
      if (!response.ok) throw new Error('Could not restart the browser. Try again.')
      const { session } = await response.json()
      setState(session?.status === 'ready' ? {
        sessionId: id, browserId: session.browserId, url: liveViewUrl(session.url),
        sharedWithAgent: session.sharedWithAgent === true, verified: true,
      } : null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not restart the browser.') }
    finally { setBusyAction(null) }
  }
  if (!id) return null
  const agentInControl = state?.verified === true && state.sharedWithAgent
  const controlLabel = state?.sharedWithAgent ? 'Take control' : 'Share with agent'
  const controls = <>
    <button type="button" aria-label={controlLabel} aria-busy={busyAction === 'control'}
      title={`${state?.sharedWithAgent ? 'Agent is controlling' : 'You are controlling'} · ${controlLabel}`}
      disabled={busy || !state?.verified} onClick={() => void setShared()}
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded border sm:w-auto sm:px-2 hover:bg-muted disabled:opacity-50 ${agentInControl ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}>
      <span className={`flex items-center justify-center ${busyAction === 'control' ? 'invisible' : ''}`}>
        {state?.sharedWithAgent ? <Hand className="h-4 w-4 sm:hidden" /> : <Bot className="h-4 w-4 sm:hidden" />}
        <span className="hidden sm:inline">{controlLabel}</span>
      </span>
      {busyAction === 'control' && <Loader2 aria-hidden="true" className="absolute h-4 w-4 animate-spin motion-reduce:animate-none" />}
    </button>
    <details ref={optionsRef} className="relative shrink-0" onKeyDown={event => {
      if (event.key === 'Escape' && optionsRef.current) { optionsRef.current.open = false; optionsRef.current.querySelector('summary')?.focus() }
    }}>
      <summary aria-label="Browser view options" title="Browser view options"
        className="flex h-8 w-8 justify-center sm:w-auto cursor-pointer list-none items-center rounded border sm:px-2 hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 top-10 z-50 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl">
        <div className="text-xs font-medium">Browser view</div>
        <div ref={setControlsContainer} className="space-y-2" />
        <button type="button" disabled={busy} onClick={() => void restartBrowser()}
          className="flex w-full items-center gap-2 rounded border px-2 py-2 text-xs hover:bg-muted disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" />Restart browser
        </button>
      </div>
    </details>
    <button type="button" aria-label="Minimize browser" title="Minimize browser" aria-expanded={expanded}
      onClick={() => { if (optionsRef.current) optionsRef.current.open = false; setExpanded(false) }}
      className="flex h-8 w-8 justify-center sm:w-auto shrink-0 items-center rounded border sm:px-2 hover:bg-muted">
      <Minimize2 className="h-4 w-4" />
    </button>
  </>
  return (
    <section ref={panelRef} aria-label="Chat browser" data-browser-panel data-browser-controller={agentInControl ? 'agent' : 'user'} data-browser-minimized={!expanded} data-browser-keyboard-open={expanded && keyboardOpen}
      style={fullscreen ? undefined : panelBox(expanded, frame, keyboardOpen)}
      className={`absolute z-30 border ${agentInControl ? 'border-blue-500 ring-1 ring-blue-500' : 'border-border'} bg-background text-xs shadow-lg ${PANEL_TRANSITION} ${expanded
        ? 'flex flex-col rounded-xl [&:fullscreen]:fixed [&:fullscreen]:inset-0 [&:fullscreen]:m-0 [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:rounded-none'
        : 'overflow-hidden rounded-lg'}`}>
      <div className={expanded ? 'min-h-0 flex-1 [&_[data-browser-layout]]:rounded-xl' : 'h-full w-full pointer-events-none'} inert={!expanded ? true : undefined}>
        <BrowserViewLayout compact={!expanded} addressBar={{ sessionId: id, authToken, currentUrl: state?.currentUrl, sharedWithAgent: state?.sharedWithAgent === true, disabled: busy || !state?.verified, controls }}>
          {state?.url ? <NoVncSessionView source={state.url} title="Agent browser" controlsContainer={controlsContainer}
            hideControls={!expanded} onKeyboardOpenChange={setKeyboardOpen} viewOnly={state.sharedWithAgent || busy || !state.verified} className={`h-full w-full border-0 bg-white ${expanded ? 'rounded-b-xl' : 'rounded-lg'}`} />
            : <p className="p-3 text-muted-foreground">No live browser is available for this chat.</p>}
        </BrowserViewLayout>
      </div>
      {expanded && error && <p role="alert" className="absolute bottom-0 inset-x-0 rounded-b-xl bg-background/95 px-3 py-2 text-destructive">{error}</p>}
      {!expanded && <button type="button" aria-label="Expand browser" aria-expanded={false} onClick={() => setExpanded(true)} className="absolute inset-0 z-50 cursor-pointer rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />}
    </section>
  )
}
