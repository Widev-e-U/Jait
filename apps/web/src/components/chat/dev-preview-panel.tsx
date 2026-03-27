import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertCircle, Camera, ExternalLink, Globe, MessageSquare, Play, RefreshCw, Square, TerminalSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiUrl } from '@/lib/gateway-url'
import { isSamePreviewSession } from '@/lib/preview-session'
import type { BrowserSession } from '@/lib/browser-collaboration-api'

interface DevPreviewPanelProps {
  onClose: () => void
  initialTarget?: string | null
  autoOpenKey?: number
  sessionId?: string | null
  token?: string | null
  workspaceRoot?: string | null
}

interface ResolvedPreviewTarget {
  iframeSrc: string
  label: string
}

function isRemoteGatewayUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return !isLoopbackHost(parsed.hostname)
  } catch {
    return false
  }
}

interface PreviewBrowserEvent {
  id: number
  timestamp: string
  type: 'console' | 'pageerror' | 'requestfailed' | 'response'
  level?: string
  text?: string
  url?: string
  method?: string
  status?: number
}

interface PreviewLogEntry {
  id: number
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  timestamp: string
}

interface PreviewSessionState {
  id: string
  sessionId: string
  workspaceRoot: string | null
  mode: 'local' | 'docker' | 'url'
  status: 'starting' | 'ready' | 'error' | 'stopped'
  target: string | null
  command: string | null
  port: number | null
  url: string | null
  browserId: string | null
  processId: number | null
  containerId: string | null
  logs: PreviewLogEntry[]
  browserEvents: PreviewBrowserEvent[]
  lastError: string | null
  createdAt: string
  updatedAt: string
}

interface PreviewSessionResponse {
  session: PreviewSessionState | null
  browserSession?: BrowserSession | null
}

function authHeaders(token?: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

function encodePreviewFilePath(path: string): string {
  return btoa(unescape(encodeURIComponent(path)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function isHtmlFilePath(input: string): boolean {
  return /\.(?:html?)$/i.test(input.trim())
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === '[::1]'
}

export function resolvePreviewTarget(input: string): ResolvedPreviewTarget | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/')) {
    return {
      iframeSrc: `${getApiUrl()}${trimmed}`,
      label: trimmed,
    }
  }

  if (!/^[a-z]+:\/\//i.test(trimmed) && isHtmlFilePath(trimmed)) {
    return {
      iframeSrc: `${getApiUrl()}/api/dev-file/${encodePreviewFilePath(trimmed)}`,
      label: trimmed,
    }
  }

  if (/^\d+$/.test(trimmed)) {
    const port = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(port) || port < 1 || port > 65535) return null
    return {
      iframeSrc: `${getApiUrl()}/api/dev-proxy/${port}/`,
      label: `localhost:${port}`,
    }
  }

  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  if (!isLoopbackHost(url.hostname)) return null

  const port = Number.parseInt(url.port, 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null

  const path = `${url.pathname || '/'}${url.search}${url.hash}`
  return {
    iframeSrc: `${getApiUrl()}/api/dev-proxy/${port}${path.startsWith('/') ? path : `/${path}`}`,
    label: `${url.hostname}:${port}${url.pathname || '/'}`,
  }
}

export function getPreviewTargetWarning(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const isLoopbackPort = /^\d+$/.test(trimmed)
  const isLoopbackUrl = (() => {
    if (!/^[a-z]+:\/\//i.test(trimmed)) return false
    try {
      return isLoopbackHost(new URL(trimmed).hostname)
    } catch {
      return false
    }
  })()

  if (!isLoopbackPort && !isLoopbackUrl) return null

  const apiUrl = getApiUrl()
  if (!isRemoteGatewayUrl(apiUrl)) return null

  return `Preview proxy requests go through ${apiUrl}, so localhost resolves on that gateway host, not this browser device. Use a workspace-backed managed preview or connect to a local gateway to preview local ports.`
}

export function DevPreviewPanel({
  onClose,
  initialTarget = null,
  autoOpenKey = 0,
  sessionId = null,
  token = null,
  workspaceRoot = null,
}: DevPreviewPanelProps) {
  const [input, setInput] = useState(initialTarget?.trim() || '')
  const [command, setCommand] = useState('')
  const [port, setPort] = useState('')
  const [managedSession, setManagedSession] = useState<PreviewSessionState | null>(null)
  const [managedBrowserSession, setManagedBrowserSession] = useState<BrowserSession | null>(null)
  const [rawSrc, setRawSrc] = useState<string | null>(null)
  const [rawLabel, setRawLabel] = useState<string | null>(null)
  const [frameKey, setFrameKey] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [panelWarning, setPanelWarning] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'preview' | 'logs' | 'console' | 'issues' | 'network'>('preview')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [isFrameLoading, setIsFrameLoading] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const consoleEndRef = useRef<HTMLDivElement>(null)
  const networkEndRef = useRef<HTMLDivElement>(null)
  const loadedPreviewSrcRef = useRef<string | null>(null)

  const resolved = useMemo(() => resolvePreviewTarget(input), [input])
  const managedResolved = useMemo(
    () => (managedSession?.url ? resolvePreviewTarget(managedSession.url) : null),
    [managedSession?.url],
  )
  const previewSrc = managedResolved?.iframeSrc ?? rawSrc
  const previewLabel = managedResolved?.label ?? rawLabel ?? managedSession?.url ?? null
  const showLoadingBar = isFrameLoading && activeTab === 'preview' && !screenshotUrl && previewSrc !== loadedPreviewSrcRef.current

  const fetchManagedSession = useCallback(async () => {
    if (!sessionId || !token) return null
    const response = await fetch(`${getApiUrl()}/api/preview/session/${sessionId}`, {
      headers: authHeaders(token),
    })
    if (!response.ok) return null
    const data = await response.json() as PreviewSessionResponse
    setManagedSession((current) => isSamePreviewSession(current, data.session) ? current : data.session)
    setManagedBrowserSession(data.browserSession ?? null)
    return data.session
  }, [sessionId, token])

  useEffect(() => {
    void fetchManagedSession()
  }, [fetchManagedSession])

  useEffect(() => {
    if (!sessionId || !token || (!managedSession && !previewSrc)) return
    const id = window.setInterval(() => {
      void fetchManagedSession()
    }, 2000)
    return () => window.clearInterval(id)
  }, [sessionId, token, fetchManagedSession, managedSession, previewSrc])

  useEffect(() => {
    const next = initialTarget?.trim()
    if (!next) return
    setInput(next)
  }, [initialTarget])

  useEffect(() => {
    if (!previewSrc || screenshotUrl) {
      setIsFrameLoading(false)
    }
  }, [frameKey, previewSrc, screenshotUrl])

  const startManagedPreview = useCallback(async () => {
    if (!sessionId || !token) {
      setPanelError('Login is required to start a managed preview session.')
      return
    }
    setIsBusy(true)
    setPanelError(null)
    setRawSrc(null)
    setRawLabel(null)
    try {
      const response = await fetch(`${getApiUrl()}/api/preview/start`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          sessionId,
          workspaceRoot,
          target: input.trim() || null,
          command: command.trim() || null,
          port: port.trim() ? Number.parseInt(port.trim(), 10) : null,
        }),
      })
      const data = await response.json().catch(() => ({})) as { session?: PreviewSessionState; error?: string }
      if (!response.ok || !data.session) {
        throw new Error(data.error || 'Failed to start preview')
      }
      setManagedSession((current) => isSamePreviewSession(current, data.session ?? null) ? current : (data.session ?? null))
      setFrameKey((prev) => prev + 1)
      setActiveTab('preview')
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'Failed to start preview')
    } finally {
      setIsBusy(false)
    }
  }, [command, input, port, sessionId, token, workspaceRoot])

  const openRawPreview = useCallback(() => {
    if (!resolved) return
    setPanelWarning(getPreviewTargetWarning(input))
    setManagedSession(null)
    setRawSrc(resolved.iframeSrc)
    setRawLabel(resolved.label)
    setFrameKey((prev) => prev + 1)
    setActiveTab('preview')
    setPanelError(null)
  }, [resolved])

  const handleOpenPreview = useCallback(() => {
    setIsFrameLoading(true)
    if (workspaceRoot && !isHtmlFilePath(input)) {
      void startManagedPreview()
      return
    }
    openRawPreview()
  }, [input, openRawPreview, startManagedPreview, workspaceRoot])

  const handleRestart = useCallback(async () => {
    if (!sessionId || !token) return
    setIsBusy(true)
    setIsFrameLoading(true)
    setPanelError(null)
    try {
      const response = await fetch(`${getApiUrl()}/api/preview/restart`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ sessionId }),
      })
      const data = await response.json().catch(() => ({})) as { session?: PreviewSessionState; error?: string }
      if (!response.ok || !data.session) {
        throw new Error(data.error || 'Failed to restart preview')
      }
      setManagedSession((current) => isSamePreviewSession(current, data.session ?? null) ? current : (data.session ?? null))
      setManagedBrowserSession(null)
      setFrameKey((prev) => prev + 1)
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'Failed to restart preview')
    } finally {
      setIsBusy(false)
    }
  }, [sessionId, token])

  const handleStop = useCallback(async () => {
    if (!sessionId || !token) {
      setManagedSession(null)
      return
    }
    setIsBusy(true)
    setPanelError(null)
    try {
      await fetch(`${getApiUrl()}/api/preview/stop`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ sessionId }),
      })
      setManagedSession(null)
      setManagedBrowserSession(null)
      setRawSrc(null)
      setRawLabel(null)
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'Failed to stop preview')
    } finally {
      setIsBusy(false)
    }
  }, [sessionId, token])

  useEffect(() => {
    if (!initialTarget?.trim()) return
    if (workspaceRoot && !isHtmlFilePath(initialTarget)) {
      setIsFrameLoading(true)
      void startManagedPreview()
      return
    }
    const nextResolved = resolvePreviewTarget(initialTarget)
    if (!nextResolved) return
    setPanelWarning(getPreviewTargetWarning(initialTarget))
    setRawSrc(nextResolved.iframeSrc)
    setRawLabel(nextResolved.label)
    setIsFrameLoading(true)
    setFrameKey((prev) => prev + 1)
  }, [autoOpenKey, initialTarget, startManagedPreview, workspaceRoot])

  const issueEvents = useMemo(
    () => managedSession?.browserEvents.filter((event) =>
      event.type === 'pageerror' || event.type === 'requestfailed' || (event.type === 'response' && (event.status ?? 0) >= 400),
    ) ?? [],
    [managedSession?.browserEvents],
  )

  const consoleEvents = useMemo(
    () => managedSession?.browserEvents.filter((event) => event.type === 'console') ?? [],
    [managedSession?.browserEvents],
  )

  const networkEvents = useMemo(
    () => managedSession?.browserEvents.filter((event) => event.type === 'response' || event.type === 'requestfailed') ?? [],
    [managedSession?.browserEvents],
  )

  const handleScreenshot = useCallback(async () => {
    if (!sessionId || !token) return
    try {
      const response = await fetch(`${getApiUrl()}/api/preview/screenshot/${sessionId}`, {
        headers: authHeaders(token),
      })
      if (!response.ok) return
      const data = await response.json() as { screenshot: string | null; suppressed?: boolean; reason?: string }
      if (data.suppressed) {
        setPanelWarning(data.reason || 'Preview capture is currently suppressed for this session.')
        return
      }
      if (data.screenshot) {
        setScreenshotUrl(`data:image/png;base64,${data.screenshot}`)
        setActiveTab('preview')
      }
    } catch {
      // ignore
    }
  }, [sessionId, token])

  const secretSafeWarning = managedBrowserSession?.secretSafe
    ? 'Secret-safe mode is active. Preview screenshots and browser inspection capture are suppressed until the session is returned to normal agent flow.'
    : null

  // Auto-scroll logs and console
  useEffect(() => {
    if (activeTab === 'logs') logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [managedSession?.logs.length, activeTab])
  useEffect(() => {
    if (activeTab === 'console') consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [consoleEvents.length, activeTab])
  useEffect(() => {
    if (activeTab === 'network') networkEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [networkEvents.length, activeTab])

  const closePanel = useCallback(async () => {
    if (managedSession) {
      await handleStop()
    }
    onClose()
  }, [handleStop, managedSession, onClose])

  return (
    <section className="shrink-0 border-b bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Managed Preview</span>
          {managedSession ? (
            <>
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {managedSession.status}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {managedSession.mode}
              </span>
              {managedBrowserSession?.origin ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {managedBrowserSession.origin}
                </span>
              ) : null}
              {managedBrowserSession?.secretSafe ? (
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
                  secret-safe
                </span>
              ) : null}
            </>
          ) : null}
          {previewLabel ? (
            <span className="truncate text-xs text-muted-foreground" title={previewLabel}>
              {previewLabel}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {managedSession ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => { void handleScreenshot() }}
                disabled={isBusy || managedBrowserSession?.secretSafe}
              >
                <Camera className="mr-1 h-3 w-3" />
                Screenshot
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={handleRestart} disabled={isBusy}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Restart
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setActiveTab('console')}>
                <MessageSquare className="mr-1 h-3 w-3" />
                Console
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={handleStop} disabled={isBusy}>
                <Square className="mr-1 h-3 w-3" />
                Stop
              </Button>
            </>
          ) : null}
          {previewSrc ? (
            <a href={previewSrc} target="_blank" rel="noreferrer" className="inline-flex">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                <ExternalLink className="mr-1 h-3 w-3" />
                Open
              </Button>
            </a>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { void closePanel() }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-b bg-muted/10 px-3 py-2">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(200px,0.6fr)_110px_auto]">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={workspaceRoot ? 'Optional target override such as 3000 or http://127.0.0.1:3000/' : '3000, http://localhost:3000, or docs/site/index.html'}
            className="h-8"
          />
          <Input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder={workspaceRoot ? 'Optional command override' : 'Command override unavailable without workspace'}
            className="h-8"
            disabled={!workspaceRoot}
          />
          <Input
            value={port}
            onChange={(event) => setPort(event.target.value)}
            placeholder="Port"
            className="h-8"
            disabled={!workspaceRoot}
          />
          <Button type="button" size="sm" className="h-8 shrink-0" onClick={handleOpenPreview} disabled={isBusy || (!workspaceRoot && !resolved)}>
            <Play className="mr-1 h-3 w-3" />
            {workspaceRoot && !isHtmlFilePath(input) ? 'Start Preview' : 'Open Preview'}
          </Button>
        </div>
        {workspaceRoot ? (
          <p className="text-[11px] text-muted-foreground">
            Workspace: <code>{workspaceRoot}</code>
          </p>
        ) : null}
        {managedBrowserSession ? (
          <p className="text-[11px] text-muted-foreground">
            Browser session: <code>{managedBrowserSession.id}</code> · controller <code>{managedBrowserSession.controller}</code>
          </p>
        ) : null}
        {secretSafeWarning ? (
          <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{secretSafeWarning}</span>
          </div>
        ) : null}
        {panelError ? (
          <div className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {panelError}
          </div>
        ) : null}
        {panelWarning ? (
          <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{panelWarning}</span>
          </div>
        ) : null}
      </div>

      <div className="border-b px-3 py-1.5">
        <div className="flex items-center gap-1 text-[11px]">
          <Button type="button" variant={activeTab === 'preview' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setActiveTab('preview')}>Preview</Button>
          <Button type="button" variant={activeTab === 'logs' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setActiveTab('logs')}>
            <TerminalSquare className="mr-1 h-3 w-3" />
            Logs
          </Button>
          <Button type="button" variant={activeTab === 'console' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setActiveTab('console')}>
            <MessageSquare className="mr-1 h-3 w-3" />
            Console{consoleEvents.length > 0 ? ` (${consoleEvents.length})` : ''}
          </Button>
          <Button type="button" variant={activeTab === 'issues' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setActiveTab('issues')}>
            <AlertCircle className="mr-1 h-3 w-3" />
            Issues{issueEvents.length > 0 ? ` (${issueEvents.length})` : ''}
          </Button>
          <Button type="button" variant={activeTab === 'network' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setActiveTab('network')}>
            <Activity className="mr-1 h-3 w-3" />
            Network{networkEvents.length > 0 ? ` (${networkEvents.length})` : ''}
          </Button>
        </div>
      </div>

      <div className="h-[420px] bg-muted/5">
        {activeTab === 'preview' ? (
          screenshotUrl ? (
            <div className="relative h-full">
              <img src={screenshotUrl} alt="Preview screenshot" className="h-full w-full object-contain bg-white" />
              <Button type="button" variant="secondary" size="sm" className="absolute top-2 right-2 h-7 px-2 text-[11px]" onClick={() => setScreenshotUrl(null)}>
                Back to live
              </Button>
            </div>
          ) : previewSrc ? (
            <div className="relative h-full">
              {showLoadingBar ? (
                <div className="absolute inset-x-0 top-0 z-10 h-1 overflow-hidden bg-transparent">
                  <div className="h-full w-full animate-pulse bg-primary/80" />
                </div>
              ) : null}
              <iframe
                key={frameKey}
                src={previewSrc}
                title="Managed preview"
                className="h-full w-full bg-white"
                sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
                onLoad={() => {
                  loadedPreviewSrcRef.current = previewSrc
                  setIsFrameLoading(false)
                }}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Start a managed preview from the active workspace or open a raw loopback/static preview target.
            </div>
          )
        ) : activeTab === 'logs' ? (
          <div className="h-full overflow-auto bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-100">
            {managedSession?.logs.length ? managedSession.logs.map((entry) => (
              <div key={entry.id} className="mb-1 whitespace-pre-wrap break-words">
                <span className={entry.stream === 'stderr' ? 'text-red-400' : entry.stream === 'system' ? 'text-sky-300' : 'text-zinc-100'}>
                  [{entry.stream}]
                </span>{' '}
                {entry.text}
              </div>
            )) : (
              <div className="text-zinc-400">No preview logs yet.</div>
            )}
            <div ref={logsEndRef} />
          </div>
        ) : activeTab === 'console' ? (
          <div className="h-full overflow-auto bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-100">
            {consoleEvents.length > 0 ? consoleEvents.map((event) => (
              <div key={event.id} className="mb-1 whitespace-pre-wrap break-words">
                <span className={
                  event.level === 'error' ? 'text-red-400'
                    : event.level === 'warning' || event.level === 'warn' ? 'text-yellow-400'
                    : event.level === 'info' ? 'text-sky-300'
                    : 'text-zinc-300'
                }>
                  [{event.level ?? 'log'}]
                </span>{' '}
                {event.text}
              </div>
            )) : (
              <div className="text-zinc-400">No console messages yet.</div>
            )}
            <div ref={consoleEndRef} />
          </div>
        ) : activeTab === 'network' ? (
          <div className="h-full overflow-auto bg-zinc-950 font-mono text-[11px] text-zinc-100">
            {networkEvents.length > 0 ? networkEvents.map((event) => {
              const isError = event.type === 'requestfailed' || (event.status ?? 0) >= 500
              const isWarn = !isError && (event.status ?? 0) >= 400
              const statusColor = isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-green-400'
              return (
                <div key={event.id} className="flex items-baseline gap-2 border-b border-zinc-800 px-3 py-1 hover:bg-zinc-900">
                  <span className="w-10 shrink-0 text-right">
                    {event.type === 'requestfailed'
                      ? <span className="text-red-400">ERR</span>
                      : <span className={statusColor}>{event.status}</span>}
                  </span>
                  <span className="w-12 shrink-0 text-zinc-400">{event.method ?? ''}</span>
                  <span className="min-w-0 break-all text-zinc-200">{event.url ?? event.text ?? ''}</span>
                </div>
              )
            }) : (
              <div className="flex h-full items-center justify-center text-zinc-400">No network requests captured yet.</div>
            )}
            <div ref={networkEndRef} />
          </div>
        ) : (
          <div className="h-full overflow-auto px-3 py-2 text-[12px]">
            {issueEvents.length > 0 ? issueEvents.map((event) => (
              <div key={event.id} className="mb-2 rounded border bg-background px-2 py-1.5">
                <div className="font-medium">
                  {event.type}
                  {event.status ? ` (${event.status})` : ''}
                  {event.level ? ` · ${event.level}` : ''}
                </div>
                {event.text ? <div className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{event.text}</div> : null}
                {event.url ? <div className="mt-0.5 break-all text-[11px] text-muted-foreground">{event.method ? `${event.method} ` : ''}{event.url}</div> : null}
              </div>
            )) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No browser issues captured yet.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
