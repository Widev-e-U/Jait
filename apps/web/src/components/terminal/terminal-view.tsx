import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { getApiUrl, getWsUrl } from '@/lib/gateway-url'
import { shouldAcceptTerminalOutput, type TerminalOutputPayload } from './terminal-stream'
import { buildTerminalDragPayload, JAIT_TERMINAL_REF_MIME } from '@/lib/jait-dnd'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { ChevronDown } from 'lucide-react'

const GATEWAY = getApiUrl()
const WS_URL = getWsUrl()

export interface TerminalInfo {
  id: string
  type: string
  state: string
  sessionId: string
  workspaceRoot: string | null
  metadata: Record<string, unknown>
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function enrichTerminal(raw: TerminalInfo): TerminalInfo {
  return { ...raw, workspaceRoot: (raw.metadata?.cwd as string) ?? raw.workspaceRoot ?? null }
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

export async function pasteClipboardTextIntoTerminal(
  clipboard: Pick<Clipboard, 'readText'> | null | undefined,
  sendInput: (text: string) => void,
): Promise<boolean> {
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

export async function handleTerminalContextMenuAction(
  clipboard: Pick<Clipboard, 'readText' | 'writeText'> | null | undefined,
  selection: string,
  sendInput: (text: string) => void,
): Promise<'copied' | 'pasted' | 'noop'> {
  const trimmedSelection = selection.trim()
  if (trimmedSelection) {
    if (!clipboard?.writeText) return 'noop'
    try {
      await clipboard.writeText(trimmedSelection)
      return 'copied'
    } catch {
      return 'noop'
    }
  }

  return await pasteClipboardTextIntoTerminal(clipboard, sendInput) ? 'pasted' : 'noop'
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
    async (sessionId: string, workspaceRoot?: string, shell?: string) => {
      if (creatingRef.current) return terminals[0] ?? ({ id: '', type: 'terminal', state: 'idle', sessionId, workspaceRoot: workspaceRoot ?? null, metadata: {} } as TerminalInfo)
      creatingRef.current = true
      try {
        const res = await fetch(`${GATEWAY}/api/terminals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(token),
          },
          body: JSON.stringify({ sessionId, workspaceRoot, ...(shell ? { shell } : {}) }),
        })
        const info = enrichTerminal((await res.json()) as TerminalInfo)
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

interface TerminalViewProps {
  terminalId: string
  className?: string
  token?: string | null
  workspaceRoot?: string | null
  onReferenceSelection?: (terminalId: string, selection: string, workspaceRoot?: string | null, startLine?: number, endLine?: number) => void
}

export interface TerminalViewHandle {
  focus(): void
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView({ terminalId, className, token, workspaceRoot, onReferenceSelection }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const lastSelectionKeyRef = useRef<string | null>(null)
  const resolvedTheme = useResolvedTheme()

  useImperativeHandle(ref, () => ({
    focus() {
      termRef.current?.focus()
    },
  }), [])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: getTerminalTheme(),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.open(containerRef.current)

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
      onReferenceSelection?.(terminalId, selection, workspaceRoot, range?.start.y, range?.end.y)
    }

    // Initial fit + focus so the terminal can receive keyboard input
    requestAnimationFrame(() => {
      fitAddon.fit()
      term.focus()
    })
    // Retry focus after layout settles (some browsers need a longer delay)
    const focusRetryId = setTimeout(() => {
      fitAddon.fit()
      term.focus()
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
        ws!.send(JSON.stringify({ type: 'terminal.subscribe', terminalId }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { type?: string; payload?: TerminalOutputPayload }
          if (shouldAcceptTerminalOutput(lastSeqByStream, terminalId, msg.payload)) {
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
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal.input', terminalId, data }))
      }
    })

    // Forward resize events
    term.onResize(({ cols, rows }) => {
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
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      const selection = term.getSelection()
      void handleTerminalContextMenuAction(navigator.clipboard, selection, (text) => {
        term.focus()
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'terminal.input', terminalId, data: text }))
        }
      })
    }
    rootEl.addEventListener('mouseup', handleMouseUp)
    rootEl.addEventListener('keyup', handleKeyUp)
    rootEl.addEventListener('contextmenu', handleContextMenu, { capture: true })

    return () => {
      disposed = true
      clearTimeout(focusRetryId)
      clearReconnectTimer()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      resizeObserver.disconnect()
      rootEl.removeEventListener('mouseup', handleMouseUp)
      rootEl.removeEventListener('keyup', handleKeyUp)
      rootEl.removeEventListener('contextmenu', handleContextMenu, { capture: true })
      closeSocket()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      wsRef.current = null
    }
  }, [terminalId, token, workspaceRoot, onReferenceSelection])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = getTerminalTheme()
  }, [resolvedTheme])

  return (
    <div
      className={`w-full overflow-hidden ${className ?? ''}`}
      tabIndex={-1}
      onMouseDown={(e) => {
        // Only focus terminal if user clicked directly on the terminal area
        if (e.target === e.currentTarget || containerRef.current?.contains(e.target as Node)) {
          requestAnimationFrame(() => termRef.current?.focus())
        }
      }}
    >
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 0 }} />
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
                t.workspaceRoot,
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
          className={`group flex items-center gap-1.5 h-6 px-2.5 text-xs rounded-sm border transition-colors cursor-pointer ${
            activeTerminalId === t.id
              ? 'bg-background text-foreground border-border shadow-sm'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-background/50 hover:border-border'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${t.state === 'running' ? 'bg-green-500' : 'bg-zinc-500'}`} />
          <span className="truncate max-w-[100px]">{t.id.replace(/^term-/, '').slice(0, 8)}</span>
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
          className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
            className="px-0.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
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
