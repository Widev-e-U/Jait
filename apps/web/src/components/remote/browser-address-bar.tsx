import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, RefreshCw, Wrench, MoreVertical, Settings2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'
import { TooltipHint } from '@/components/ui/tooltip'

export interface BrowserAddressBarProps {
  sessionId: string
  authToken?: string | null
  currentUrl?: string | null
  sharedWithAgent: boolean
  disabled?: boolean
  menuControls?: ReactNode
  primaryControl?: ReactNode
  overflowControl?: ReactNode
  controls?: ReactNode
  leading?: ReactNode
}

export function BrowserAddressBar({ sessionId, authToken, currentUrl, sharedWithAgent, disabled = false, controls, menuControls, primaryControl, overflowControl, leading, toolsOpen, onToggleTools }: BrowserAddressBarProps & {
  toolsOpen: boolean
  onToggleTools: () => void
}) {
  const [value, setValue] = useState(currentUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [width, setWidth] = useState(0)
  const toolbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = toolbarRef.current
    if (!element) return
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const showBack = width >= 400
  const showForward = width >= 450
  const showRefresh = width >= 500
  const showTools = width >= 550
  const showPrimary = width >= 600
  const hasOverflow = !showBack || !showForward || !showRefresh || !showTools || (!!overflowControl && !showPrimary)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const editing = useRef(false)
  const latestUrl = useRef(currentUrl ?? '')

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false
    }
    const blur = () => { setTimeout(() => { if (document.activeElement instanceof HTMLIFrameElement && menuRef.current) menuRef.current.open = false }, 0) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('blur', blur)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('blur', blur) }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await apiFetch(`${getApiUrl()}/api/preview/session/${encodeURIComponent(sessionId)}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          signal: controller.signal,
        })
        if (response.ok) {
          const { session } = await response.json()
          const url = session?.metrics?.url
          if (!cancelled && typeof url === 'string') {
            latestUrl.current = url
            if (!editing.current) setValue(url)
          }
        }
      } catch { /* Keep the last URL during a temporary disconnect. */ }
      finally { if (!cancelled) timer = setTimeout(load, 3000) }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [sessionId, authToken])

  useEffect(() => {
    latestUrl.current = currentUrl ?? ''
    if (!editing.current) setValue(currentUrl ?? '')
  }, [currentUrl])

  const navigate = async (reload = false) => {
    if (busy || disabled || (!reload && !value.trim())) return
    setBusy(true)
    setError('')
    try {
      const target = reload ? latestUrl.current : value.trim()
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(target) ? target : `https://${target}`)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Enter an HTTP or HTTPS URL.')
      const response = await apiFetch(`${getApiUrl()}/api/preview/${reload ? 'reload' : 'navigate'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify(reload ? { sessionId } : { sessionId, url: url.href }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not navigate.')
      latestUrl.current = data.session?.metrics?.url ?? url.href
      setValue(latestUrl.current)
      editing.current = false
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not navigate.')
    } finally { setBusy(false) }
  }

  const history = async (direction: 'back' | 'forward') => {
    if (busy || disabled) return
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch(`${getApiUrl()}/api/preview/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ sessionId, direction }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not navigate history.')
      const url = data.session?.metrics?.url
      if (typeof url === 'string') { latestUrl.current = url; setValue(url); editing.current = false }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not navigate history.') }
    finally { setBusy(false) }
  }

  return (
    <div ref={toolbarRef} className="shrink-0 rounded-t-[inherit] border-b bg-muted/20 px-1.5 py-1.5 sm:px-3">
      <form data-browser-toolbar className="flex min-w-0 items-center gap-1 sm:gap-1.5" onSubmit={event => { event.preventDefault(); void navigate() }}>
        {leading}
        {([
          [showBack, 'Back', ArrowLeft, () => void history('back')],
          [showForward, 'Forward', ArrowRight, () => void history('forward')],
          [showRefresh, 'Refresh', RefreshCw, () => void navigate(true)],
        ] as const).map(([visible, label, Icon, action]) => visible && (
          <TooltipHint key={label} content={label}>
            <button type="button" aria-label={label} disabled={disabled || busy} onClick={action} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border hover:bg-muted disabled:opacity-50"><Icon className="h-4 w-4" /></button>
          </TooltipHint>
        ))}
        <TooltipHint content={sharedWithAgent ? 'You and the agent can navigate' : 'Enter a URL and press Enter'}>
          <input
            aria-label="Browser URL"
            aria-busy={busy}
            type="text"
            value={value}
            disabled={disabled || busy}
            spellCheck={false}
            autoComplete="off"
            placeholder="Enter a URL"
            className="h-8 w-0 min-w-0 flex-1 rounded border bg-background px-2 text-base disabled:opacity-50 sm:h-8 sm:text-sm"
            onFocus={() => { editing.current = true }}
            onBlur={() => { editing.current = false }}
            onChange={event => { setValue(event.target.value); setError('') }}
            onKeyDown={event => {
              if (event.key === 'Escape') { setValue(latestUrl.current); setError(''); event.currentTarget.blur() }
            }}
          />
        </TooltipHint>
        {showTools && <TooltipHint content="Browser tools"><button type="button" aria-label="Browser tools" aria-expanded={toolsOpen} disabled={disabled} onClick={onToggleTools} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border hover:bg-muted disabled:opacity-50"><Wrench className="h-4 w-4" /></button></TooltipHint>}
        {showPrimary && primaryControl}
        {(hasOverflow || menuControls) && <details ref={menuRef} className="relative shrink-0" onKeyDown={event => { if (event.key === 'Escape' && menuRef.current) { menuRef.current.open = false; menuRef.current.querySelector('summary')?.focus() } }}>
          <TooltipHint content={hasOverflow ? "Browser menu" : "Browser view settings"}>
            <summary aria-label={hasOverflow ? "Browser menu" : "Browser view settings"} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded border hover:bg-muted [&::-webkit-details-marker]:hidden">{hasOverflow ? <MoreVertical className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}</summary>
          </TooltipHint>
          <div className="absolute right-0 top-10 z-50 w-56 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] overflow-y-auto space-y-1 rounded-lg border bg-popover p-2 text-popover-foreground shadow-xl">
            {!showBack && <button type="button" disabled={disabled || busy} onClick={() => void history('back')} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-50"><ArrowLeft className="h-4 w-4" /> Back</button>}
            {!showForward && <button type="button" disabled={disabled || busy} onClick={() => void history('forward')} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-50"><ArrowRight className="h-4 w-4" /> Forward</button>}
            {!showRefresh && <button type="button" disabled={disabled || busy} onClick={() => void navigate(true)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Refresh</button>}
            {!showTools && <button type="button" aria-expanded={toolsOpen} disabled={disabled} onClick={onToggleTools} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-50"><Wrench className="h-4 w-4" /> Browser tools</button>}
            <div onClick={event => {
              if ((event.target as HTMLElement).closest('[data-browser-close-menu]') && menuRef.current) menuRef.current.open = false
            }}>{!showPrimary && overflowControl}{menuControls}</div>
          </div>
        </details>}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {controls}
        </div>
      </form>
      {error && <p role="alert" className="pt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
