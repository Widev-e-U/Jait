import { useEffect, useRef, useCallback } from 'react'
import type {
  UICommandType,
  UICommandPayload,
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
}

/**
 * Subscribe to backend-pushed UI commands over WebSocket.
 *
 * The gateway sends `{ type: "ui.command", payload: { command, data } }`
 * and this hook dispatches to the matching listener callback.
 */
export function useUICommands(listeners: Listeners) {
  const listenersRef = useRef(listeners)
  listenersRef.current = listeners

  // Stable connect function
  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}?token=dev`)

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: unknown }
        if (msg.type !== 'ui.command') return

        const payload = msg.payload as UICommandPayload
        const handler = listenersRef.current[payload.command as keyof Listeners]
        if (handler) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(handler as (data: any) => void)(payload.data)
        }
      } catch {
        // ignore parse errors
      }
    }

    // Auto-reconnect on close (1s backoff)
    ws.onclose = () => {
      setTimeout(() => {
        // Only reconnect if the component is still mounted — checked by cleanup
      }, 1000)
    }

    return ws
  }, [])

  useEffect(() => {
    let ws = connect()
    let mounted = true

    // Auto-reconnect loop
    const reconnect = () => {
      if (!mounted) return
      ws = connect()
      ws.onclose = () => {
        setTimeout(reconnect, 1000)
      }
    }

    ws.onclose = () => {
      setTimeout(reconnect, 1000)
    }

    return () => {
      mounted = false
      ws.close()
    }
  }, [connect])
}
