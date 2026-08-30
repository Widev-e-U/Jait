import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { getApiUrl, getWsUrl } from '@/lib/gateway-url'
import { shouldAcceptTerminalOutput, type TerminalOutputPayload } from './terminal-stream'
import { buildTerminalDragPayload, JAIT_TERMINAL_REF_MIME } from '@/lib/jait-dnd'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { detectTouchDevice } from '@/lib/device-layout'
import { subscribeSoftKeyboardOpen } from './soft-keyboard'
import { TerminalSoftKeyBar } from './terminal-soft-key-bar'
import { ChevronDown, Copy, ClipboardPaste } from 'lucide-react'

const GATEWAY = getApiUrl()
const WS_URL = getWsUrl()
const TERMINAL_CONTEXT_MENU_WIDTH = 140
const TERMINAL_CONTEXT_MENU_HEIGHT = 72
const TERMINAL_CONTEXT_MENU_MARGIN = 8
const PASTE_SHORTCUT_SUPPRESS_MS = 250

export interface TerminalInfo {
  id: string
  type: string
  state: string
  sessionId: string
  projectRoot: string | null
  metadata: Record<string, unknown>
}

export interface ToolTerminalExecutionMetadata {
  command: string
  actionId: string
  startedAt: string
  completedAt: string | null
  outputOffset: number | null
  outputEndOffset: number | null
  output: string | null
  isBackground: boolean
  watched: boolean | null
}

function parseToolTerminalExecution(value: unknown): ToolTerminalExecutionMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.command !== 'string' || typeof record.actionId !== 'string') return null
  return {
    command: record.command,
    actionId: record.actionId,
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : '',
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
    outputOffset: typeof record.outputOffset === 'number' && Number.isFinite(record.outputOffset)
      ? Math.max(0, Math.trunc(record.outputOffset))
      : null,
    outputEndOffset: typeof record.outputEndOffset === 'number' && Number.isFinite(record.outputEndOffset)
      ? Math.max(0, Math.trunc(record.outputEndOffset))
      : null,
    output: typeof record.output === 'string' ? record.output : null,
    isBackground: record.isBackground === true,
    watched: typeof record.watched === 'boolean' ? record.watched : null,
  }
}

export function getToolTerminalExecution(terminal: TerminalInfo | null | undefined): ToolTerminalExecutionMetadata | null {
  return parseToolTerminalExecution(terminal?.metadata?.toolExecution)
}

export function getToolTerminalExecutions(terminal: TerminalInfo | null | undefined): ToolTerminalExecutionMetadata[] {
  const values = terminal?.metadata?.toolExecutions
  if (!Array.isArray(values)) return []
  return values
    .map(parseToolTerminalExecution)
    .filter((execution): execution is ToolTerminalExecutionMetadata => execution !== null)
}

export function findToolTerminalExecution(
  terminal: TerminalInfo | null | undefined,
  options: { actionId?: string | null; command?: string | null; outputOffset?: number | null },
): ToolTerminalExecutionMetadata | null {
  const executions = getToolTerminalExecutions(terminal)
  const byAction = options.actionId
    ? executions.find((execution) => execution.actionId === options.actionId)
    : null
  if (byAction) return byAction
  return executions.find((execution) => (
    execution.command === options.command
    && execution.outputOffset === options.outputOffset
  )) ?? null
}

export function isTerminalBackgroundWaiting(terminal: TerminalInfo | null | undefined): boolean {
  const execution = getToolTerminalExecution(terminal)
  return execution?.isBackground === true && execution.watched === true
}

export function findToolTerminal(
  terminals: TerminalInfo[],
  options: { terminalId?: string | null; sessionId?: string | null; command?: string | null },
): TerminalInfo | null {
  if (options.terminalId) {
    const exact = terminals.find((terminal) => terminal.id === options.terminalId)
    if (exact) return exact
  }
  if (!options.sessionId) return null

  const sessionTerminals = terminals
    .filter((terminal) => terminal.sessionId === options.sessionId)
    .sort((left, right) => {
      const leftStarted = Date.parse(getToolTerminalExecution(left)?.startedAt ?? '') || 0
      const rightStarted = Date.parse(getToolTerminalExecution(right)?.startedAt ?? '') || 0
      return rightStarted - leftStarted
    })
  const matchingCommand = options.command
    ? sessionTerminals.find((terminal) => getToolTerminalExecution(terminal)?.command === options.command)
    : null
  return matchingCommand
    ?? sessionTerminals.find((terminal) => getToolTerminalExecution(terminal) !== null)
    ?? null
}

export function buildTerminalSubscribeMessage(
  terminalId: string,
  outputOffset?: number | null,
  outputEndOffset?: number | null,
) {
  return {
    type: 'terminal.subscribe',
    terminalId,
    ...(typeof outputOffset === 'number' && Number.isFinite(outputOffset) && outputOffset >= 0
      ? { outputOffset: Math.trunc(outputOffset) }
      : {}),
    ...(typeof outputEndOffset === 'number' && Number.isFinite(outputEndOffset) && outputEndOffset >= 0
      ? { outputEndOffset: Math.trunc(outputEndOffset) }
      : {}),
  }
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function enrichTerminal(raw: TerminalInfo): TerminalInfo {
  return { ...raw, projectRoot: (raw.metadata?.cwd as string) ?? raw.projectRoot ?? null }
}

function getCssVarColor(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim()
  return value ? `hsl(${value})` : fallback
}

function getTerminalTheme(): {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
} {
  const styles = getComputedStyle(document.documentElement)
  return {
    background: getCssVarColor(styles, '--background', '#0a0a0a'),
    foreground: getCssVarColor(styles, '--foreground', '#e4e4e7'),
    cursor: getCssVarColor(styles, '--foreground', '#e4e4e7'),
    cursorAccent: getCssVarColor(styles, '--background', '#0a0a0a'),
    selectionBackground: getCssVarColor(styles, '--primary', '#2563eb'),
  }
}

function getTerminalNodeId(terminal: TerminalInfo): string {
  return typeof terminal.metadata?.nodeId === 'string' && terminal.metadata.nodeId
    ? terminal.metadata.nodeId
    : 'gateway'
}

export function terminalBelongsToProject(terminal: TerminalInfo, projectRoot: string, nodeId?: string | null): boolean {
  if (!terminal.projectRoot) return false
  const terminalRoot = terminal.projectRoot.replace(/\\/g, '/').toLowerCase()
  const activeRoot = projectRoot.replace(/\\/g, '/').toLowerCase()
  const activeNodeId = nodeId && nodeId !== 'gateway' ? nodeId : 'gateway'
  return terminalRoot === activeRoot && getTerminalNodeId(terminal) === activeNodeId
}

export async function pasteClipboardTextIntoTerminal(
  clipboard: Pick<Clipboard, 'readText'> | null | undefined,
  sendInput: (text: string) => void,
): Promise<boolean> {
  const desktopClipboard = typeof window !== 'undefined' ? window.jaitDesktop?.readClipboardText : undefined
  if (!desktopClipboard && !clipboard?.readText) return false
  try {
    const text = desktopClipboard ? await desktopClipboard() : await clipboard!.readText()
    if (!text) return false
    sendInput(text)
    return true
  } catch {
    if (!clipboard?.readText) return false
    try {
      const text = await clipboard.readText()
      if (!text) return false
      sendInput(text)
      return true
    } catch {
      return false
    }
  }
}

export async function handleTerminalContextMenuAction(
  clipboard: Pick<Clipboard, 'readText' | 'writeText'> | null | undefined,
  selection: string,
  sendInput: (text: string) => void,
): Promise<'copied' | 'pasted' | 'noop'> {
  if (selection.trim()) {
    if (!clipboard?.writeText) return 'noop'
    try {
      await clipboard.writeText(selection)
      return 'copied'
    } catch {
      return 'noop'
    }
  }

  return await pasteClipboardTextIntoTerminal(clipboard, sendInput) ? 'pasted' : 'noop'
}

export function getTerminalContextMenuPosition(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
  menuWidth = TERMINAL_CONTEXT_MENU_WIDTH,
  menuHeight = TERMINAL_CONTEXT_MENU_HEIGHT,
): { left: number; top: number } {
  const maxLeft = Math.max(TERMINAL_CONTEXT_MENU_MARGIN, viewportWidth - menuWidth - TERMINAL_CONTEXT_MENU_MARGIN)
  const left = Math.min(Math.max(clientX, TERMINAL_CONTEXT_MENU_MARGIN), maxLeft)
  const fitsBelow = clientY + menuHeight + TERMINAL_CONTEXT_MENU_MARGIN <= viewportHeight
  const preferredTop = fitsBelow ? clientY : clientY - menuHeight
  const maxTop = Math.max(TERMINAL_CONTEXT_MENU_MARGIN, viewportHeight - menuHeight - TERMINAL_CONTEXT_MENU_MARGIN)
  const top = Math.min(Math.max(preferredTop, TERMINAL_CONTEXT_MENU_MARGIN), maxTop)
  return { left, top }
}

export function pasteClipboardEventTextIntoTerminal(
  event: Pick<ClipboardEvent, 'clipboardData' | 'preventDefault'>,
  sendInput: (text: string) => void,
): boolean {
  const text = event.clipboardData?.getData('text/plain') || event.clipboardData?.getData('text')
  if (!text) return false
  event.preventDefault()
  sendInput(text)
  return true
}

export function isTerminalPasteShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'type'>): boolean {
  if (event.type !== 'keydown') return false
  if (event.altKey || event.shiftKey) return false
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v'
}

export function shouldSuppressTerminalPasteControlData(data: string, pasteShortcutAt: number, now: number): boolean {
  return data === '\x16' && now - pasteShortcutAt >= 0 && now - pasteShortcutAt <= PASTE_SHORTCUT_SUPPRESS_MS
}

export function shouldUseTerminalCustomContextMenu(_hasDesktopBridge: boolean): boolean {
  return true
}

export function resolveProjectActiveTerminalId<T extends { id: string }>(activeTerminalId: string | null, projectTerminals: T[]): string | null {
  if (!activeTerminalId) return null
  return projectTerminals.some((terminal) => terminal.id === activeTerminalId) ? activeTerminalId : null
}

export function resolveProjectTerminalSelection<T extends { id: string }>(
  activeTerminalId: string | null,
  savedTerminalId: string | null,
  projectTerminals: T[],
): string | null {
  const activeProjectTerminalId = resolveProjectActiveTerminalId(activeTerminalId, projectTerminals)
  if (activeProjectTerminalId) return activeProjectTerminalId
  if (savedTerminalId && projectTerminals.some((terminal) => terminal.id === savedTerminalId)) {
    return savedTerminalId
  }
  return null
}

export function useTerminals(token?: string | null) {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/api/terminals`, {
        headers: authHeaders(token),
      })
      const data = (await res.json()) as { terminals: TerminalInfo[] }
      const enriched = data.terminals.map(enrichTerminal)
      setTerminals(enriched)
      return enriched
    } catch {
      // gateway down
      return []
    }
  }, [token])

  const creatingRef = useRef(false)
  const createTerminal = useCallback(
    async (sessionId: string, projectRoot?: string, shell?: string, nodeId?: string | null) => {
      if (creatingRef.current) {
        // A creation is already in flight — reuse the most recent project terminal
        // rather than returning a placeholder with an empty id (which would render
        // the "+ New Terminal" empty state and make the panel appear stuck).
        const existing = terminals.find((t) => t.id)
        if (existing) return existing
        throw new Error('A terminal is already being created')
      }
      creatingRef.current = true
      try {
        // A remote node that advertises a "terminal" surface but never answers
        // terminal.op-request (e.g. an older desktop build) makes the gateway
        // hang until its op timeout. Bound the client fetch so the user gets a
        // clear error toast instead of an indefinitely stuck terminal panel.
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20_000)
        let res: Response
        try {
          res = await fetch(`${GATEWAY}/api/terminals`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(token),
            },
            body: JSON.stringify({
              sessionId,
              projectRoot,
              ...(shell ? { shell } : {}),
              ...(nodeId && nodeId !== 'gateway' ? { nodeId } : {}),
            }),
            signal: controller.signal,
          })
        } catch (err) {
          if (controller.signal.aborted) {
            throw new Error(
              'The remote node did not respond in time — it may be running an older desktop app. Update it and try again.',
            )
          }
          throw new Error(err instanceof Error ? err.message : 'Failed to create terminal')
        } finally {
          clearTimeout(timeoutId)
        }
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string; details?: string } | null
          const reason = errBody?.details ?? errBody?.error ?? `HTTP ${res.status}`
          throw new Error(reason)
        }
        const raw = (await res.json()) as TerminalInfo
        if (!raw || typeof raw.id !== 'string' || !raw.id) {
          throw new Error('Gateway returned an invalid terminal')
        }
        const info = enrichTerminal(raw)
        setTerminals((prev) => [...prev, info])
        setActiveTerminalId(info.id)
        return info
      } finally {
        creatingRef.current = false
      }
    },
    [token, terminals],
  )

  const killTerminal = useCallback(async (id: string) => {
    await fetch(`${GATEWAY}/api/terminals/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
    setTerminals((prev) => prev.filter((t) => t.id !== id))
    setActiveTerminalId((prev) => (prev === id ? null : prev))
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const hasWaitingBackgroundTerminal = terminals.some(isTerminalBackgroundWaiting)
  useEffect(() => {
    if (!hasWaitingBackgroundTerminal) return
    const timer = window.setInterval(() => {
      void refresh()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [hasWaitingBackgroundTerminal, refresh])

  return { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal, refresh }
}

export interface ShellOption {
  shell: string
  label: string
}

export function useAvailableShells(token?: string | null) {
  const [shells, setShells] = useState<ShellOption[]>([])
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    void (async () => {
      try {
        const res = await fetch(`${GATEWAY}/api/terminals/shells`, {
          headers: authHeaders(token),
        })
        const data = (await res.json()) as { shells: ShellOption[] }
        setShells(data.shells ?? [])
      } catch {
        // gateway unavailable
      }
    })()
  }, [token])

  return shells
}

/** Fallback row height when the renderer has not measured a row yet. */
const TERMINAL_FALLBACK_ROW_HEIGHT = 17

interface TerminalBufferLike {
  readonly length: number
  getLine(y: number): { translateToString(trimRight?: boolean): string } | undefined
}

/**
 * Rows of actual content in a buffer, ignoring the blank rows xterm keeps to
 * fill its viewport. Used to size a terminal to what it is showing rather than
 * to a fixed box — a one-line command should render as one line.
 */
export function countTerminalContentRows(buffer: TerminalBufferLike): number {
  for (let y = buffer.length - 1; y >= 0; y--) {
    if (buffer.getLine(y)?.translateToString(true).trim()) return y + 1
  }
  return 0
}

export function clampTerminalRows(contentRows: number, minRows: number, maxRows: number): number {
  const upper = Math.max(minRows, maxRows)
  return Math.min(Math.max(contentRows, minRows), upper)
}

interface TerminalViewProps {
  terminalId: string
  className?: string
  token?: string | null
  projectRoot?: string | null
  readOnly?: boolean
  outputOffset?: number | null
  outputEndOffset?: number | null
  /**
   * Grow the terminal with its content between these row counts instead of
   * filling the container. Both must be set to take effect.
   */
  minRows?: number
  maxRows?: number
  onReferenceSelection?: (terminalId: string, selection: string, projectRoot?: string | null, startLine?: number, endLine?: number) => void
}

export interface TerminalViewHandle {
  focus(): void
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView({ terminalId, className, token, projectRoot, readOnly = false, outputOffset, outputEndOffset, minRows, maxRows, onReferenceSelection }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const lastSelectionKeyRef = useRef<string | null>(null)
  const rightClickSelectionRef = useRef<string>('')
  const resolvedTheme = useResolvedTheme()
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number; hasSelection: boolean } | null>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const autoHeight = minRows != null && maxRows != null
  // Mobile soft-keyboard accessory bar (arrow keys, Ctrl/C, copy/paste, …).
  const sendInputRef = useRef<((data: string) => void) | null>(null)
  const [touchDevice] = useState(() => (typeof window === 'undefined' ? false : detectTouchDevice()))
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [keyBarCollapsed, setKeyBarCollapsed] = useState(false)
  const showSoftKeyBar = !readOnly && touchDevice && !autoHeight && keyboardOpen && !keyBarCollapsed

  // Track soft-keyboard visibility (visualViewport heuristics on mobile).
  useEffect(() => {
    if (!touchDevice || readOnly || autoHeight) return
    const unsubscribe = subscribeSoftKeyboardOpen((open) => {
      setKeyboardOpen(open)
      // Re-show the bar next time the keyboard opens after a manual collapse.
      if (!open) setKeyBarCollapsed(false)
    })
    return unsubscribe
  }, [touchDevice, readOnly, autoHeight])

  useImperativeHandle(ref, () => ({
    focus() {
      termRef.current?.focus()
    },
  }), [])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: !readOnly,
      disableStdin: readOnly,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: getTerminalTheme(),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    if (!readOnly) term.loadAddon(linksAddon)
    term.open(containerRef.current)

    const pendingInput: string[] = []
    const flushPendingInput = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      while (pendingInput.length > 0) {
        const data = pendingInput.shift()
        if (data != null) ws.send(JSON.stringify({ type: 'terminal.input', terminalId, data }))
      }
    }
    const sendTerminalInput = (data: string) => {
      if (readOnly) return
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal.input', terminalId, data }))
        return
      }
      pendingInput.push(data)
    }
    sendInputRef.current = sendTerminalInput
    let pasteShortcutAt = 0
    let pasteEventAt = 0
    let pasteFallbackTimer: ReturnType<typeof setTimeout> | null = null

    const schedulePasteFallback = () => {
      if (pasteFallbackTimer) clearTimeout(pasteFallbackTimer)
      pasteFallbackTimer = setTimeout(() => {
        pasteFallbackTimer = null
        if (pasteEventAt >= pasteShortcutAt) return
        void pasteClipboardTextIntoTerminal(navigator.clipboard, sendTerminalInput)
      }, 30)
    }

    if (!readOnly) term.attachCustomKeyEventHandler((event) => {
      if (!isTerminalPasteShortcut(event)) return true
      pasteShortcutAt = Date.now()
      schedulePasteFallback()
      return true
    })

    const emitSelectionReference = () => {
      const selection = term.getSelection().trim()
      if (!selection) {
        lastSelectionKeyRef.current = null
        return
      }
      const selectionKey = `${terminalId}:${selection}`
      if (lastSelectionKeyRef.current === selectionKey) return
      lastSelectionKeyRef.current = selectionKey
      const range = term.getSelectionPosition()
      onReferenceSelection?.(terminalId, selection, projectRoot, range?.start.y, range?.end.y)
    }

    // Size the box to the output rather than the other way round. The row
    // count is derived from the buffer's *content*, not from `term.rows`, so
    // growing the container (which grows `term.rows`, which appends blank
    // rows) cannot feed back into another growth step.
    let measureFrame: number | null = null
    const measureContentHeight = () => {
      measureFrame = null
      if (minRows == null || maxRows == null) return
      const rowsEl = term.element?.querySelector('.xterm-rows')
      const measuredRowHeight = rowsEl && term.rows > 0
        ? rowsEl.getBoundingClientRect().height / term.rows
        : 0
      const rowHeight = measuredRowHeight > 0 ? measuredRowHeight : TERMINAL_FALLBACK_ROW_HEIGHT
      const rows = clampTerminalRows(countTerminalContentRows(term.buffer.active), minRows, maxRows)
      setContentHeight(Math.ceil(rows * rowHeight))
    }
    const scheduleContentMeasure = () => {
      if (minRows == null || maxRows == null || measureFrame !== null) return
      measureFrame = requestAnimationFrame(measureContentHeight)
    }
    const writeParsedListener = minRows != null && maxRows != null
      ? term.onWriteParsed(scheduleContentMeasure)
      : null

    // Initial fit + focus so the terminal can receive keyboard input
    requestAnimationFrame(() => {
      fitAddon.fit()
      if (!readOnly) term.focus()
      scheduleContentMeasure()
    })
    // Retry focus after layout settles (some browsers need a longer delay)
    const focusRetryId = setTimeout(() => {
      fitAddon.fit()
      if (!readOnly) term.focus()
      scheduleContentMeasure()
    }, 150)

    termRef.current = term
    fitRef.current = fitAddon

    // --- WebSocket with auto-reconnect (exponential backoff) ---
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false
    let reconnectDelay = 1000
    let pausedForHiddenDocument = false
    const MAX_RECONNECT_DELAY = 30000
    const lastSeqByStream = new Map<string, number>()

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    function closeSocket() {
      if (!ws) return
      ws.onclose = null
      ws.close()
      ws = null
      wsRef.current = null
    }

    function connect() {
      if (disposed) return
      if (typeof document !== 'undefined' && document.hidden) return
      const query = token ? `?token=${encodeURIComponent(token)}` : ''
      ws = new WebSocket(`${WS_URL}${query}`)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelay = 1000 // reset on successful connect
        ws!.send(JSON.stringify(buildTerminalSubscribeMessage(terminalId, outputOffset, outputEndOffset)))
        flushPendingInput()
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { type?: string; payload?: TerminalOutputPayload }
          if (shouldAcceptTerminalOutput(lastSeqByStream, terminalId, msg.payload, outputEndOffset)) {
            term.write(msg.payload.data ?? '')
          }
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        if (!disposed && !pausedForHiddenDocument) {
          reconnectTimer = setTimeout(connect, reconnectDelay)
          reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror, which triggers reconnect
      }
    }

    const handleVisibilityChange = () => {
      const hidden = typeof document !== 'undefined' && document.hidden
      pausedForHiddenDocument = hidden
      if (hidden) {
        clearReconnectTimer()
        closeSocket()
        return
      }
      reconnectDelay = 1000
      if (!ws) connect()
    }

    connect()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    // Forward user input to the terminal via WS
    term.onData((data) => {
      if (shouldSuppressTerminalPasteControlData(data, pasteShortcutAt, Date.now())) return
      sendTerminalInput(data)
    })

    // Forward resize events
    term.onResize(({ cols, rows }) => {
      if (readOnly) return
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal.resize', terminalId, cols, rows }))
      }
      void fetch(`${GATEWAY}/api/terminals/${terminalId}/resize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({ cols, rows }),
      })
    })

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit())
    })
    resizeObserver.observe(containerRef.current)

    const rootEl = containerRef.current
    const handleMouseUp = () => {
      window.setTimeout(emitSelectionReference, 0)
    }
    const handleKeyUp = () => {
      window.setTimeout(emitSelectionReference, 0)
    }
    // Snapshot selection on right-click mousedown (capture phase) before xterm.js
    // can clear it or swallow the event (e.g. when mouse tracking is active in bash).
    const handleRightMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return
      rightClickSelectionRef.current = term.getSelection()
      // Prevent xterm.js from processing the right-click (which can clear
      // selection or consume the event when mouse tracking is enabled).
      event.stopPropagation()
    }
    const handleContextMenu = (event: MouseEvent) => {
      if (!shouldUseTerminalCustomContextMenu(!!window.jaitDesktop)) {
        term.focus()
        setContextMenu(null)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const selection = rightClickSelectionRef.current || term.getSelection()
      const pos = getTerminalContextMenuPosition(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
      setContextMenu({
        left: pos.left,
        top: pos.top,
        hasSelection: !!selection.trim(),
      })
    }
    const handlePaste = (event: ClipboardEvent) => {
      if (pasteClipboardEventTextIntoTerminal(event, sendTerminalInput)) {
        pasteEventAt = Date.now()
      }
    }
    rootEl.addEventListener('mousedown', handleRightMouseDown, { capture: true })
    rootEl.addEventListener('mouseup', handleMouseUp)
    rootEl.addEventListener('keyup', handleKeyUp)
    rootEl.addEventListener('contextmenu', handleContextMenu, { capture: true })
    if (!readOnly) rootEl.addEventListener('paste', handlePaste, { capture: true })

    return () => {
      disposed = true
      clearTimeout(focusRetryId)
      if (measureFrame !== null) cancelAnimationFrame(measureFrame)
      writeParsedListener?.dispose()
      if (pasteFallbackTimer) clearTimeout(pasteFallbackTimer)
      clearReconnectTimer()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      resizeObserver.disconnect()
      rootEl.removeEventListener('mousedown', handleRightMouseDown, { capture: true })
      rootEl.removeEventListener('mouseup', handleMouseUp)
      rootEl.removeEventListener('keyup', handleKeyUp)
      rootEl.removeEventListener('contextmenu', handleContextMenu, { capture: true })
      if (!readOnly) rootEl.removeEventListener('paste', handlePaste, { capture: true })
      closeSocket()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      wsRef.current = null
    }
  }, [terminalId, token, projectRoot, readOnly, outputOffset, outputEndOffset, minRows, maxRows, onReferenceSelection])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = getTerminalTheme()
  }, [resolvedTheme])

  const handleCopy = useCallback(() => {
    const term = termRef.current
    if (!term) return
    const selection = (rightClickSelectionRef.current || term.getSelection()).trim()
    if (selection && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(selection)
    }
    rightClickSelectionRef.current = ''
    setContextMenu(null)
    term.focus()
  }, [])

  const handlePaste = useCallback(() => {
    const term = termRef.current
    const ws = wsRef.current
    if (!term) return
    void pasteClipboardTextIntoTerminal(navigator.clipboard, (text) => {
      term.focus()
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal.input', terminalId, data: text }))
      }
    })
    rightClickSelectionRef.current = ''
    setContextMenu(null)
    term.focus()
  }, [terminalId])

  const handleSoftKeyData = useCallback((data: string) => {
    const send = sendInputRef.current
    if (send) send(data)
    // Keep focus (and therefore the soft keyboard) attached to the terminal.
    requestAnimationFrame(() => termRef.current?.focus())
  }, [])

  const handleSoftKeyScroll = useCallback((rows: number) => {
    termRef.current?.scrollLines(rows)
  }, [])

  return (
    <div
      className={`relative w-full overflow-hidden ${className ?? ''}`}
      style={autoHeight
        ? { height: contentHeight ?? (minRows ?? 1) * TERMINAL_FALLBACK_ROW_HEIGHT }
        : undefined}
      tabIndex={-1}
      onMouseDown={(e) => {
        // Close context menu on any click outside it
        if (contextMenu) {
          rightClickSelectionRef.current = ''
          setContextMenu(null)
        }
        // Only focus terminal if user clicked directly on the terminal area
        if (!readOnly && (e.target === e.currentTarget || containerRef.current?.contains(e.target as Node))) {
          requestAnimationFrame(() => termRef.current?.focus())
        }
      }}
    >
      <div className="flex h-full w-full flex-col">
        <div ref={containerRef} className="min-h-0 w-full flex-1" style={{ minHeight: 0 }} />
        {showSoftKeyBar && (
          <TerminalSoftKeyBar
            onData={handleSoftKeyData}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onCollapse={() => setKeyBarCollapsed(true)}
            scrollByRows={handleSoftKeyScroll}
          />
        )}
      </div>
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-md border border-border bg-popover py-1 shadow-md"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none"
            disabled={!contextMenu.hasSelection}
            onClick={handleCopy}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          {!readOnly && <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={handlePaste}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            Paste
          </button>}
        </div>
      )}
    </div>
  )
})

const TAB_POPOUT_VIEWPORT_MARGIN = 16

interface TerminalTabsProps {
  terminals: TerminalInfo[]
  activeTerminalId: string | null
  onSelect: (id: string) => void
  onCreate: (shell?: string) => void
  onKill: (id: string) => void
  onDetach?: (id: string) => void
  availableShells?: ShellOption[]
}

export function TerminalTabs({ terminals, activeTerminalId, onSelect, onCreate, onKill, onDetach, availableShells }: TerminalTabsProps) {
  const [showShellMenu, setShowShellMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!showShellMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setShowShellMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showShellMenu])

  const hasMultipleShells = availableShells && availableShells.length > 1
  return (
    <div className="flex items-center gap-1 px-2 h-9 border-b bg-background shrink-0 overflow-x-auto">
      {terminals.map((t) => (
        <div
          key={t.id}
          role="tab"
          tabIndex={0}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'copy'
            e.dataTransfer.setData(
              JAIT_TERMINAL_REF_MIME,
              JSON.stringify(buildTerminalDragPayload(
                t.id,
                t.id.replace(/^term-/, '').slice(0, 8),
                t.projectRoot,
              )),
            )
          }}
          onDragEnd={(e) => {
            if (!onDetach) return
            const outsideViewport =
              e.clientX <= TAB_POPOUT_VIEWPORT_MARGIN ||
              e.clientY <= TAB_POPOUT_VIEWPORT_MARGIN ||
              e.clientX >= window.innerWidth - TAB_POPOUT_VIEWPORT_MARGIN ||
              e.clientY >= window.innerHeight - TAB_POPOUT_VIEWPORT_MARGIN
            const droppedOutsideWindow =
              e.dataTransfer.dropEffect === 'none' &&
              (e.clientX === 0 || e.clientY === 0)
            if (outsideViewport || droppedOutsideWindow) onDetach(t.id)
          }}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(t.id) }}
          className={`group flex items-center gap-1.5 h-6 px-2.5 text-xs rounded-sm border cursor-pointer ${
            activeTerminalId === t.id
              ? 'bg-background text-foreground border-border shadow-sm'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-background/50 hover:border-border'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${t.state === 'running' ? 'bg-green-500' : 'bg-zinc-500'}`} />
          <span className="truncate max-w-[100px]">{t.id.replace(/^term-/, '').slice(0, 8)}</span>
          {isTerminalBackgroundWaiting(t) && (
            <span className="rounded bg-amber-500/15 px-1 text-2xs font-medium text-amber-500" title="Background command is being watched">
              waiting
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onKill(t.id)
            }}
            className="text-muted-foreground hover:text-destructive ml-0.5 text-sm leading-none"
            aria-label="Close terminal"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center">
        <button
          onClick={() => onCreate()}
          className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          aria-label="New terminal"
        >
          +
        </button>
        {hasMultipleShells && (
          <button
            ref={triggerRef}
            onClick={() => {
              if (showShellMenu) {
                setShowShellMenu(false)
                return
              }
              const rect = triggerRef.current?.getBoundingClientRect()
              if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
              setShowShellMenu(true)
            }}
            className="px-0.5 py-1 text-muted-foreground hover:text-foreground"
            aria-label="Select shell type"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>
      {showShellMenu && hasMultipleShells && menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[120px] rounded-md border bg-popover p-1 shadow-md"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {availableShells.map((s) => (
            <button
              key={s.shell}
              onClick={() => {
                onCreate(s.shell)
                setShowShellMenu(false)
              }}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
