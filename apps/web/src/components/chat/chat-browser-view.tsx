import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Bot, GripHorizontal, Hand, Loader2, Maximize2, Minimize2, Minus, RotateCcw, Square } from 'lucide-react'
import { BrowserViewLayout } from '@/components/remote/browser-view-layout'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'
import { apiFetch } from '@/lib/api-fetch'
import { readBrowserCollapsed, rememberBrowserCollapsed } from '@/lib/browser-panel-state'
import { constrainBrowserWindow, resizeBrowserWindow, type BrowserWindowBox } from '@/lib/browser-window'
import { getApiUrl } from '@/lib/gateway-url'
import { TooltipHint } from '@/components/ui/tooltip'

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
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null)
  const [sidebarInset, setSidebarInset] = useState(0)
  const [mainSidebarInset, setMainSidebarInset] = useState(0)
  const [frame, setFrame] = useState({ width: 768, height: 468, top: PANEL_INSET })
  const [fullscreen, setFullscreen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [windowBox, setWindowBox] = useState<BrowserWindowBox | null>(null)
  const [manipulating, setManipulating] = useState(false)
  const gesture = useRef<{ x: number; y: number; box: BrowserWindowBox; edge?: string } | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [state, setState] = useState<BrowserState | null>(() => id && liveViewUrl(record?.previewUrl) ? {
    sessionId: id, browserId, url: liveViewUrl(record?.previewUrl), sharedWithAgent: record?.controller === 'agent', verified: false,
  } : null)
  const [busyAction, setBusyAction] = useState<'control' | 'restart' | null>(null)
  const busy = busyAction !== null
  const [error, setError] = useState('')
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined

  // Fine-pointer desktop windows float over the whole workspace; on phones the
  // browser stays in its chat so the remote keyboard remains scoped correctly.
  useIsomorphicLayoutEffect(() => {
    const root = panelRef.current?.closest<HTMLElement>('[data-browser-workspace]')
    if (!root) return
    const desktop = window.matchMedia('(min-width: 768px) and (pointer: fine)')
    const update = () => setWorkspace(desktop.matches ? root : null)
    update()
    desktop.addEventListener('change', update)
    return () => desktop.removeEventListener('change', update)
  }, [id])

  useIsomorphicLayoutEffect(() => {
    if (!workspace) return
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    function measure() {
      const bounds = workspace!.getBoundingClientRect()
      const sidebars = [...workspace!.querySelectorAll<HTMLElement>('[data-browser-sidebar]')]
      const right = sidebars.reduce((edge, sidebar) => {
        const rect = sidebar.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 ? Math.max(edge, rect.right - bounds.left) : edge
      }, 0)
      setSidebarInset(Math.min(bounds.width, Math.max(0, right)))
      const main = workspace!.querySelector<HTMLElement>('[aria-label="Workspace sidebar"]')
      const mainRect = main?.getBoundingClientRect()
      setMainSidebarInset(mainRect && mainRect.width > 0 && mainRect.height > 0 ? Math.min(bounds.width, Math.max(0, mainRect.right - bounds.left)) : 0)
    }
    function observeSidebars() {
      observer?.disconnect()
      observer?.observe(workspace!)
      workspace!.querySelectorAll<HTMLElement>('[data-browser-sidebar]').forEach(sidebar => observer?.observe(sidebar))
      measure()
    }
    observeSidebars()
    const mutations = new MutationObserver(records => {
      const changed = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches('[data-browser-sidebar]') || node.querySelector('[data-browser-sidebar]'))))
      if (changed) observeSidebars()
    })
    mutations.observe(workspace, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    return () => { mutations.disconnect(); observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [workspace])

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
  }, [id, workspace])

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
    let recoveryAttempted = false
    const load = async () => {
      try {
        const response = await apiFetch(`${getApiUrl()}/api/preview/session/${encodeURIComponent(id)}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, signal: controller.signal })
        if (!response.ok) { if (!cancelled) setState(null); return }
        let { session } = await response.json()
        if (!cancelled && !recoveryAttempted && session?.status === 'stopped' && session?.origin === 'agent' && session?.target) {
          recoveryAttempted = true
          const recovered = await apiFetch(`${getApiUrl()}/api/preview/restart`, {
            method: 'POST', headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: id }), signal: controller.signal,
          })
          if (recovered.ok) ({ session } = await recovered.json())
        }
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
  const defaultFrame = workspace ? { ...frame, width: Math.max(0, frame.width - sidebarInset) } : frame
  const initialBox = panelBox(true, defaultFrame, keyboardOpen)
  const defaultBox = { ...initialBox, left: initialBox.left + (workspace ? sidebarInset : 0) }
  const minimizedBox = { ...panelBox(false, defaultFrame), left: PANEL_INSET + (workspace ? sidebarInset : 0) }
  const floatingBox = constrainBrowserWindow(windowBox ?? defaultBox, frame)
  const beginGesture = (event: ReactPointerEvent<HTMLElement>, edge?: string) => {
    if (event.button !== 0 || maximized || fullscreen || !window.matchMedia('(min-width: 768px) and (pointer: fine)').matches) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { x: event.clientX, y: event.clientY, box: floatingBox, edge }
    setManipulating(true)
  }
  const moveGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const start = gesture.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    setWindowBox(start.edge
      ? resizeBrowserWindow(start.box, start.edge, dx, dy, frame)
      : constrainBrowserWindow({ ...start.box, left: start.box.left + dx, top: start.box.top + dy }, frame))
  }
  const endGesture = () => { gesture.current = null; setManipulating(false) }
  const gestureEvents = { onPointerMove: moveGesture, onPointerUp: endGesture, onPointerCancel: endGesture, onLostPointerCapture: endGesture }
  useEffect(() => {
    if (!maximized) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMaximized(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [maximized])

  if (!id) return null
  const agentInControl = state?.verified === true && state.sharedWithAgent
  const controlLabel = state?.sharedWithAgent ? 'Take control' : 'Share with agent'
  // One control, three positions: thumbnail dock, floating window, workspace fill.
  const size = !expanded ? 'minimized' : maximized ? 'workspace' : 'windowed'
  const setSize = (next: 'minimized' | 'windowed' | 'workspace') => {
    setMaximized(next === 'workspace')
    setExpanded(next !== 'minimized')
  }
  const menuControls = <>
    <button type="button" data-browser-close-menu aria-label={controlLabel} aria-busy={busyAction === 'control'}
      disabled={busy || !state?.verified} onClick={() => void setShared()}
      className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-50 ${agentInControl ? 'text-blue-500' : ''}`}>
      {busyAction === 'control' ? <Loader2 className="h-4 w-4 animate-spin" /> : state?.sharedWithAgent ? <Hand className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      {controlLabel}
    </button>
    <div className="border-t pt-2 text-xs font-medium">Browser view</div>
    <div ref={setControlsContainer} className="space-y-2" />
    <button type="button" disabled={busy} onClick={() => void restartBrowser()}
      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-50">
      <RotateCcw className="h-4 w-4" /> Restart browser
    </button>
  </>
  const controls = <>
    <div role="group" aria-label="Browser size" data-browser-size={size}
      className="hidden h-8 shrink-0 items-center overflow-hidden rounded border sm:flex">
      {([
        ['minimized', Minus, 'Minimize browser'],
        ['windowed', Square, 'Windowed browser'],
        ['workspace', Maximize2, 'Fill workspace'],
      ] as const).map(([value, Icon, label]) => (
        <TooltipHint key={value} content={label}>
          <button type="button" aria-label={label} aria-pressed={size === value} onClick={() => setSize(value)}
            className={`flex h-full w-7 items-center justify-center border-l first:border-l-0 hover:bg-muted ${size === value ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>
            <Icon className="h-3.5 w-3.5" />
          </button>
        </TooltipHint>
      ))}
    </div>
    <TooltipHint content={`Browser size: ${size}`}>
      <button type="button" aria-label={size === 'workspace' ? 'Minimize browser' : size === 'windowed' ? 'Fill workspace' : 'Windowed browser'}
        onClick={() => setSize(size === 'workspace' ? 'minimized' : size === 'windowed' ? 'workspace' : 'windowed')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border hover:bg-muted sm:hidden">
        {size === 'workspace' ? <Minimize2 className="h-4 w-4" /> : size === 'windowed' ? <Maximize2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>
    </TooltipHint>
  </>
  const panel = (
    <section ref={panelRef} aria-label="Chat browser" data-browser-panel data-browser-controller={agentInControl ? 'agent' : 'user'} data-browser-minimized={!expanded} data-browser-keyboard-open={expanded && keyboardOpen}
      data-browser-maximized={maximized && expanded}
      style={fullscreen ? undefined : !expanded ? minimizedBox : maximized
        ? { left: workspace ? mainSidebarInset : 0, top: Math.max(0, frame.top - PANEL_INSET), width: frame.width - (workspace ? mainSidebarInset : 0), height: frame.height - Math.max(0, frame.top - PANEL_INSET) }
        : floatingBox}
      className={`absolute z-30 pointer-events-auto border ${agentInControl ? 'border-blue-500' : 'border-border'} bg-background text-xs shadow-lg ${manipulating ? 'transition-none select-none' : PANEL_TRANSITION} ${expanded
        ? 'flex flex-col rounded-xl [&:fullscreen]:fixed [&:fullscreen]:inset-0 [&:fullscreen]:m-0 [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:rounded-none'
        : 'overflow-hidden rounded-lg'}`}>
      <div aria-hidden="true" data-browser-border className={`pointer-events-none absolute inset-0 z-50 rounded-[inherit] ${agentInControl ? 'border-2 border-blue-500' : 'border border-border'}`} />
      {expanded && !maximized && !fullscreen && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(edge => (
        <div key={edge} data-browser-resize={edge} aria-hidden="true"
          className="absolute z-50 hidden touch-none md:block" style={{
            cursor: `${edge}-resize`,
            ...(edge.includes('n') ? { top: 0, height: 8 } : edge.includes('s') ? { bottom: 0, height: 8 } : { top: 8, bottom: 8 }),
            ...(edge.includes('w') ? { left: 0, width: 8 } : edge.includes('e') ? { right: 0, width: 8 } : { left: 8, right: 8 }),
          }} onPointerDown={event => beginGesture(event, edge)} {...gestureEvents} />
      ))}
      {manipulating && <div className="absolute inset-0 z-40" />}
      <div className={expanded ? 'min-h-0 flex-1 rounded-b-xl [&_[data-browser-layout]]:rounded-b-xl' : 'h-full w-full pointer-events-none'} inert={!expanded ? true : undefined}>
        <BrowserViewLayout compact={!expanded} addressBar={{ sessionId: id, authToken, currentUrl: state?.currentUrl, sharedWithAgent: state?.sharedWithAgent === true, disabled: busy || !state?.verified, controls, menuControls, leading: (<TooltipHint content="Drag to move · Arrow keys to move">
          <button type="button" aria-label="Move browser"
            className="hidden h-8 shrink-0 touch-none items-center text-muted-foreground md:flex md:cursor-move"
            onPointerDown={event => beginGesture(event)} {...gestureEvents}
            onDoubleClick={() => setMaximized(value => !value)}
            onKeyDown={event => {
              if (maximized || fullscreen || !event.key.startsWith('Arrow') || !window.matchMedia('(min-width: 768px) and (pointer: fine)').matches) return
              event.preventDefault()
              const step = event.shiftKey ? 40 : 10
              setWindowBox(constrainBrowserWindow({ ...floatingBox,
                left: floatingBox.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                top: floatingBox.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
              }, frame))
            }}><GripHorizontal className="hidden h-4 w-4 md:block" /></button>
        </TooltipHint>) }}>
          <div className="h-full overflow-hidden rounded-b-xl">{state?.url ? <NoVncSessionView source={state.url} title="Agent browser" controlsContainer={controlsContainer}
            hideControls={!expanded} onKeyboardOpenChange={setKeyboardOpen} viewOnly={busy || !state.verified} className={`h-full w-full border-0 bg-white ${expanded ? 'rounded-b-xl' : 'rounded-lg'}`} />
            : <p className="p-3 text-muted-foreground">No live browser is available for this chat.</p>}</div>
        </BrowserViewLayout>
      </div>
      {expanded && error && <p role="alert" className="absolute bottom-0 inset-x-0 rounded-b-xl bg-background/95 px-3 py-2 text-destructive">{error}</p>}
      {!expanded && <button type="button" aria-label="Expand browser" aria-expanded={false} onClick={() => setExpanded(true)} className="absolute inset-0 z-50 cursor-pointer rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />}
    </section>
  )
  return workspace ? createPortal(
    <div data-browser-workspace-overlay className="pointer-events-none absolute inset-0 z-40">{panel}</div>,
    workspace,
  ) : panel
}
