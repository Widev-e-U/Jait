import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8000'
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000'

export interface TerminalInfo {
  id: string
  type: string
  state: string
  sessionId: string
  metadata: Record<string, unknown>
}

export function useTerminals() {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/api/terminals`)
      const data = (await res.json()) as { terminals: TerminalInfo[] }
      setTerminals(data.terminals)
      return data.terminals
    } catch {
      // gateway down
      return []
    }
  }, [])

  const createTerminal = useCallback(
    async (sessionId: string, workspaceRoot?: string) => {
      const res = await fetch(`${GATEWAY}/api/terminals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, workspaceRoot }),
      })
      const info = (await res.json()) as TerminalInfo
      setTerminals((prev) => [...prev, info])
      setActiveTerminalId(info.id)
      return info
    },
    [],
  )

  const killTerminal = useCallback(async (id: string) => {
    await fetch(`${GATEWAY}/api/terminals/${id}`, { method: 'DELETE' })
    setTerminals((prev) => prev.filter((t) => t.id !== id))
    setActiveTerminalId((prev) => (prev === id ? null : prev))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal, refresh }
}

interface TerminalViewProps {
  terminalId: string
  className?: string
}

export function TerminalView({ terminalId, className }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        selectionBackground: '#27272a',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.open(containerRef.current)

    // Initial fit + focus so the terminal can receive keyboard input
    requestAnimationFrame(() => {
      fitAddon.fit()
      term.focus()
    })

    termRef.current = term
    fitRef.current = fitAddon

    // --- WebSocket with auto-reconnect ---
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    function connect() {
      if (disposed) return
      ws = new WebSocket(`${WS_URL}?token=dev`)
      wsRef.current = ws

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: 'terminal.subscribe', terminalId }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { payload?: { type?: string; data?: string; terminalId?: string } }
          if (msg.payload?.type === 'terminal.output' && msg.payload.terminalId === terminalId) {
            term.write(msg.payload.data ?? '')
          }
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 1000)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror, which triggers reconnect
      }
    }

    connect()

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      })
    })

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit())
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      resizeObserver.disconnect()
      if (ws) ws.close()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      wsRef.current = null
    }
  }, [terminalId])

  return (
    <div className={`w-full overflow-hidden ${className ?? ''}`} onClick={() => termRef.current?.focus()}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}

interface TerminalTabsProps {
  terminals: TerminalInfo[]
  activeTerminalId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onKill: (id: string) => void
}

export function TerminalTabs({ terminals, activeTerminalId, onSelect, onCreate, onKill }: TerminalTabsProps) {
  return (
    <div className="flex items-center gap-1 px-2 h-8 border-b bg-muted/50 shrink-0 overflow-x-auto">
      {terminals.map((t) => (
        <div
          key={t.id}
          role="tab"
          tabIndex={0}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(t.id) }}
          className={`group flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-sm transition-colors cursor-pointer ${
            activeTerminalId === t.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${t.state === 'running' ? 'bg-green-500' : 'bg-zinc-500'}`} />
          <span className="truncate max-w-[100px]">{t.id.replace(/^term-/, '').slice(0, 8)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onKill(t.id)
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive ml-0.5"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onCreate}
        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        +
      </button>
    </div>
  )
}
