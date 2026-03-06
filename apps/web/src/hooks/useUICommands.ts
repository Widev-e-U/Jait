import { useEffect, useRef, useCallback } from 'react'
import type {
  UICommandType,
  UICommandPayload,
  UIStateKey,
  WorkspaceOpenData,
  WorkspaceCloseData,
  TerminalFocusData,
  FileHighlightData,
} from '@jait/shared'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000'

// ── Listener map ────────────────────────────────────────────────────
type CommandDataMap = {
  'workspace.open': WorkspaceOpenData
  'workspace.close': WorkspaceCloseData
  'terminal.focus': TerminalFocusData
  'file.highlight': FileHighlightData
}

type UICommandListener<T extends UICommandType = UICommandType> =
  T extends keyof CommandDataMap ? (data: CommandDataMap[T]) => void : (data: Record<string, unknown>) => void

interface Listeners {
  'workspace.open'?: UICommandListener<'workspace.open'>
  'workspace.close'?: UICommandListener<'workspace.close'>
  'terminal.focus'?: UICommandListener<'terminal.focus'>
  'file.highlight'?: UICommandListener<'file.highlight'>
  'screen-share.open'?: (data: Record<string, unknown>) => void
  'screen-share.close'?: (data: Record<string, unknown>) => void
}

/**
 * Callback for `ui.state-sync` events from other clients / the gateway.
 * `key` is the state key (e.g. "workspace.panel", "todo_list", "file_changed").
 */
export type StateSyncHandler = (key: string, value: unknown) => void

/**
 * Callback for `ui.full-state` — the complete session state pushed on subscribe.
 */
export type FullStateHandler = (state: Record<string, unknown>) => void

interface UseUICommandsOptions {
  /** Listeners for UI commands pushed by the gateway (server → client). */
  listeners: Listeners
  /** Active session ID — used to subscribe to session-scoped broadcasts. */
  sessionId?: string | null
  /** Token for WS authentication. */
  token?: string | null
  /** Called when another client (or the gateway) broadcasts a state change. */
  onStateSync?: StateSyncHandler
  /** Called when the gateway pushes the full session state on subscribe/reconnect. */
  onFullState?: FullStateHandler
}

/**
 * Subscribe to backend-pushed UI commands over WebSocket,
 * and expose a `sendUIState` function for client → server state sync.
 *
 * The gateway sends `{ type: "ui.command", payload: { command, data } }`
 * and this hook dispatches to the matching listener callback.
 *
 * On subscribe, the gateway pushes `{ type: "ui.full-state", payload: Record<string, unknown> }`
 * with the complete session state from the DB — this is the authoritative state.
 *
 * `sendUIState(key, value, sessionId)` pushes a `ui.state` message to the
 * gateway which persists it in the session_state DB table and relays
 * to other clients via `ui.state-sync`.
 */
export function useUICommands(opts: UseUICommandsOptions) {
  const { listeners, sessionId, token, onStateSync, onFullState } = opts
  const listenersRef = useRef(listeners)
  listenersRef.current = listeners
  const onStateSyncRef = useRef(onStateSync)
  onStateSyncRef.current = onStateSync
  const onFullStateRef = useRef(onFullState)
  onFullStateRef.current = onFullState
  const wsRef = useRef<WebSocket | null>(null)
  const currentSessionRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const tokenRef = useRef(token)
  tokenRef.current = token
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  // Queue for messages that couldn't be sent because WS was not open
  const outgoingQueueRef = useRef<string[]>([])

  // Flush queued messages when WS becomes ready
  const flushQueue = useCallback((ws: WebSocket) => {
    while (outgoingQueueRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
      const msg = outgoingQueueRef.current.shift()!
      ws.send(msg)
    }
  }, [])

  // Subscribe (or re-subscribe) the WS to a session
  const subscribeToSession = useCallback((ws: WebSocket, sid: string | null) => {
    if (!sid || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: sid }))
    currentSessionRef.current = sid
  }, [])

  // Handle incoming messages — extracted so it's stable across reconnects
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as { type: string; payload: unknown }

      if (msg.type === 'ui.command') {
        const payload = msg.payload as UICommandPayload
        const handler = listenersRef.current[payload.command as keyof Listeners]
        if (handler) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(handler as (data: any) => void)(payload.data)
        }
      } else if (msg.type === 'ui.state-sync') {
        // Cross-client state sync from another client or the gateway
        const payload = msg.payload as { key?: string; value?: unknown }
        if (payload?.key && onStateSyncRef.current) {
          onStateSyncRef.current(payload.key, payload.value ?? null)
        }
      } else if (msg.type === 'ui.full-state') {
        // Full session state pushed by the gateway on subscribe — authoritative
        const state = msg.payload as Record<string, unknown> | null
        if (state && onFullStateRef.current) {
          onFullStateRef.current(state)
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  // ── Single, stable WS connection — only depends on token ──────────
  // Session changes are handled by re-subscribing, NOT by reconnecting.
  useEffect(() => {
    mountedRef.current = true
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (!mountedRef.current) return
      const ws = new WebSocket(`${WS_URL}?token=${tokenRef.current ?? 'dev'}`)
      wsRef.current = ws

      ws.onopen = () => {
        // Subscribe to current session on connect
        const sid = sessionIdRef.current
        if (sid) subscribeToSession(ws, sid)
        // Flush any queued outgoing messages
        flushQueue(ws)
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        wsRef.current = null
        currentSessionRef.current = null
        // Auto-reconnect after 1s
        if (mountedRef.current) {
          reconnectTimer = setTimeout(connect, 1000)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null // prevent reconnect on intentional close
        ws.close()
        wsRef.current = null
      }
    }
  // Only reconnect the WS when the auth token changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Re-subscribe when sessionId changes (no WS reconnection needed)
  useEffect(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN && sessionId !== currentSessionRef.current) {
      subscribeToSession(ws, sessionId ?? null)
    }
    // Also update the ref so reconnects use the latest sessionId
    sessionIdRef.current = sessionId ?? null
  }, [sessionId, subscribeToSession])

  /**
   * Send a UI state update to the gateway for DB persistence + cross-client broadcast.
   * Call this whenever the user opens/closes an agent-controllable panel.
   * Messages are queued if the WS is not currently connected.
   */
  const sendUIState = useCallback((key: UIStateKey, value: unknown | null, sid?: string | null) => {
    const msg = JSON.stringify({
      type: 'ui.state',
      payload: { sessionId: sid ?? '', key, value },
    })
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    } else {
      // Queue for delivery when WS reconnects
      outgoingQueueRef.current.push(msg)
    }
  }, [])

  return { sendUIState }
}
