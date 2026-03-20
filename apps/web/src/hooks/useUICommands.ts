import { useEffect, useRef, useCallback } from 'react'
import {
  UICommandType,
  UICommandPayload,
  UIStateKey,
  WorkspaceOpenData,
  WorkspaceCloseData,
  TerminalFocusData,
  FileHighlightData,
  DevPreviewOpenData,
  ArchitectureUpdateData,
  FsChangesPayload,
  NODE_PROTOCOL_VERSION,
} from '@jait/shared'

import { getWsUrl } from '@/lib/gateway-url'
import { detectPlatform, initDeviceId } from '@/lib/device-id'
import { triggerSystemNotification } from '@/lib/system-notifications'

const WS_URL = getWsUrl()

// ── Device / platform helpers ───────────────────────────────────────

function getDeviceName(): string {
  const platform = detectPlatform()
  const ua = navigator.userAgent
  if (platform === 'electron') return `Desktop (${navigator.platform})`
  if (platform === 'capacitor') return 'Mobile'
  if (ua.includes('Chrome')) return `Chrome (${navigator.platform})`
  if (ua.includes('Firefox')) return `Firefox (${navigator.platform})`
  if (ua.includes('Safari')) return `Safari (${navigator.platform})`
  return `Browser (${navigator.platform})`
}

function detectFsNodePlatform(): string {
  const p = detectPlatform()
  if (p === 'capacitor') return 'android' // or ios, but we'll keep it simple
  if (p === 'electron') {
    const plat = navigator.platform?.toLowerCase() ?? ''
    if (plat.includes('win')) return 'windows'
    if (plat.includes('mac')) return 'macos'
    return 'linux'
  }
  return 'web'
}

/**
 * Whether this client can act as a filesystem node (browse local files).
 * Browser clients served from a local dev server can't really expose files,
 * but Electron and Capacitor can.
 */
function canActAsFsNode(): boolean {
  const p = detectPlatform()
  return p === 'electron' || p === 'capacitor'
}

// ── Listener map ────────────────────────────────────────────────────
type CommandDataMap = {
  'workspace.open': WorkspaceOpenData
  'workspace.close': WorkspaceCloseData
  'terminal.focus': TerminalFocusData
  'file.highlight': FileHighlightData
  'dev-preview.open': DevPreviewOpenData
  'architecture.update': ArchitectureUpdateData
}

type UICommandListener<T extends UICommandType = UICommandType> =
  T extends keyof CommandDataMap ? (data: CommandDataMap[T]) => void : (data: Record<string, unknown>) => void

interface Listeners {
  'workspace.open'?: UICommandListener<'workspace.open'>
  'workspace.close'?: UICommandListener<'workspace.close'>
  'terminal.focus'?: UICommandListener<'terminal.focus'>
  'file.highlight'?: UICommandListener<'file.highlight'>
  'dev-preview.open'?: UICommandListener<'dev-preview.open'>
  'architecture.update'?: UICommandListener<'architecture.update'>
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

/**
 * Callback for thread-related WS events (thread.created, thread.updated, etc.).
 * `eventType` is the full WS event type (e.g. "thread.created").
 * `payload` is the event payload (e.g. { threadId, thread }).
 */
export type ThreadEventHandler = (eventType: string, payload: Record<string, unknown>) => void
export type UICommandsConnectionStateHandler = (state: { connected: boolean; reconnected: boolean }) => void

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
  /** Called when the gateway broadcasts that an assistant message has completed. */
  onMessageComplete?: () => void
  /** Called when the gateway broadcasts a thread lifecycle event. */
  onThreadEvent?: ThreadEventHandler
  /** Called when the gateway pushes native filesystem change events. */
  onFsChanges?: (payload: FsChangesPayload) => void
  /** Called when the UI command WebSocket connects, disconnects, or reconnects. */
  onConnectionStateChange?: UICommandsConnectionStateHandler
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
  const {
    listeners,
    sessionId,
    token,
    onStateSync,
    onFullState,
    onMessageComplete,
    onThreadEvent,
    onFsChanges,
    onConnectionStateChange,
  } = opts
  const listenersRef = useRef(listeners)
  listenersRef.current = listeners
  const onStateSyncRef = useRef(onStateSync)
  onStateSyncRef.current = onStateSync
  const onFullStateRef = useRef(onFullState)
  onFullStateRef.current = onFullState
  const onMessageCompleteRef = useRef(onMessageComplete)
  onMessageCompleteRef.current = onMessageComplete
  const onThreadEventRef = useRef(onThreadEvent)
  onThreadEventRef.current = onThreadEvent
  const onFsChangesRef = useRef(onFsChanges)
  onFsChangesRef.current = onFsChanges
  const onConnectionStateChangeRef = useRef(onConnectionStateChange)
  onConnectionStateChangeRef.current = onConnectionStateChange
  const wsRef = useRef<WebSocket | null>(null)
  const currentSessionRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const hasConnectedRef = useRef(false)
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

  // ── Cross-platform notification handler ──────────────────────────

  const handleGatewayNotification = useCallback(async (notif: {
    id: string; title: string; body: string; level: string; link?: string
  }) => {
    await triggerSystemNotification({
      id: notif.id,
      title: notif.title,
      body: notif.body,
      level: notif.level as 'info' | 'success' | 'warning' | 'error',
      includeToast: true,
    })
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
      } else if (msg.type === 'message.complete') {
        // Assistant message finished on another device — refresh chat
        onMessageCompleteRef.current?.()
      } else if (msg.type === 'fs.changes') {
        // Native filesystem change events from the workspace watcher
        const payload = msg.payload as FsChangesPayload
        onFsChangesRef.current?.(payload)
      } else if (msg.type === 'fs.browse-request') {
        // Gateway is asking us to browse a local directory
        void handleFsBrowseRequest(msg.payload as { requestId: string; path: string })
      } else if (msg.type === 'fs.roots-request') {
        // Gateway is asking for our root directories
        void handleFsRootsRequest(msg.payload as { requestId: string })
      } else if (msg.type === 'fs.op-request') {
        // Gateway is asking us to perform a filesystem operation (stat, read, write, list, etc.)
        void handleFsOpRequest(msg.payload as { requestId: string; op: string; [key: string]: unknown })
      } else if (msg.type === 'provider.op-request') {
        // Gateway is asking us to run a provider operation (start-session, send-turn, etc.)
        void handleProviderOpRequest(msg.payload as { requestId: string; op: string; [key: string]: unknown })
      } else if (msg.type === 'tool.op-request') {
        // Gateway is asking us to execute a Jait tool locally (terminal.run, file.write, etc.)
        void handleToolOpRequest(msg.payload as { requestId: string; tool: string; args: Record<string, unknown>; sessionId?: string; workspaceRoot?: string })
      } else if (msg.type === 'notification') {
        // Cross-platform notification from the gateway
        void handleGatewayNotification(msg.payload as {
          id: string; title: string; body: string; level: string; link?: string
        })
      } else if (
        msg.type.startsWith('thread.') ||
        msg.type.startsWith('repo.') ||
        msg.type.startsWith('plan.') ||
        msg.type.startsWith('fs.node-') ||
        msg.type.startsWith('node.')
      ) {
        // Thread, repo, plan, filesystem-node and node-registry events — forward to automation hook
        onThreadEventRef.current?.(msg.type, msg.payload as Record<string, unknown>)
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  // ── Filesystem node request handlers ──────────────────────────────

  /** Browse a local directory using Capacitor Filesystem API */
  const capacitorBrowse = useCallback(async (dirPath: string) => {
    const capFsMod = '@capacitor/filesystem'
    const { Filesystem, Directory } = await import(capFsMod)
    // Determine the base directory and relative path
    let directory: typeof Directory[keyof typeof Directory] | undefined
    let path = dirPath
    if (dirPath === '~' || dirPath === '/storage' || dirPath === '/') {
      // Root request — list the external storage root
      directory = Directory.ExternalStorage
      path = ''
    } else if (dirPath.startsWith('/storage/emulated/0')) {
      directory = Directory.ExternalStorage
      path = dirPath.replace('/storage/emulated/0', '').replace(/^\//, '')
    }
    const result = await Filesystem.readdir({
      path: path || '',
      ...(directory ? { directory } : {}),
    })
    const basePath = directory === Directory.ExternalStorage
      ? '/storage/emulated/0' + (path ? '/' + path : '')
      : dirPath
    const entries: { name: string; path: string; type: 'dir' | 'file' }[] = []
    for (const f of result.files) {
      if (f.name.startsWith('.')) continue
      entries.push({
        name: f.name,
        path: basePath + '/' + f.name,
        type: f.type === 'directory' ? 'dir' : 'file',
      })
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    // Compute parent
    const parts = basePath.replace(/\/+$/, '').split('/')
    const parent = parts.length > 3 ? parts.slice(0, -1).join('/') : null
    return { path: basePath, parent, entries }
  }, [])

  /** Get root directories on Capacitor (Android) */
  const capacitorRoots = useCallback(async () => {
    return [
      { name: 'Internal Storage', path: '/storage/emulated/0', type: 'dir' as const },
      { name: 'Documents', path: '/storage/emulated/0/Documents', type: 'dir' as const },
      { name: 'Downloads', path: '/storage/emulated/0/Download', type: 'dir' as const },
      { name: 'Home', path: '/storage/emulated/0', type: 'dir' as const },
    ]
  }, [])

  /** Respond to a remote browse request from the gateway */
  const handleFsBrowseRequest = useCallback(async (payload: { requestId: string; path: string }) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { requestId, path } = payload
    try {
      let result: { path: string; parent: string | null; entries: { name: string; path: string; type: 'dir' | 'file' }[] }
      const platform = detectPlatform()
      if (platform === 'electron' && window.jaitDesktop?.browsePath) {
        result = await window.jaitDesktop.browsePath(path)
      } else if (platform === 'capacitor') {
        result = await capacitorBrowse(path)
      } else {
        throw new Error('Local filesystem browsing not supported on this platform')
      }
      ws.send(JSON.stringify({
        type: 'fs.browse-response',
        payload: {
          requestId,
          path: result.path,
          parent: result.parent,
          entries: result.entries,
        },
      }))
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'fs.browse-response',
        payload: {
          requestId,
          error: err instanceof Error ? err.message : 'Browse failed',
        },
      }))
    }
  }, [capacitorBrowse])

  /** Respond to a remote roots request from the gateway */
  const handleFsRootsRequest = useCallback(async (payload: { requestId: string }) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { requestId } = payload
    try {
      let roots: { name: string; path: string; type: 'dir' | 'file' }[]
      const platform = detectPlatform()
      if (platform === 'electron' && window.jaitDesktop?.getRoots) {
        const result = await window.jaitDesktop.getRoots()
        roots = result.roots
      } else if (platform === 'capacitor') {
        roots = await capacitorRoots()
      } else {
        throw new Error('Local filesystem browsing not supported on this platform')
      }
      ws.send(JSON.stringify({
        type: 'fs.roots-response',
        payload: { requestId, roots },
      }))
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'fs.roots-response',
        payload: {
          requestId,
          error: err instanceof Error ? err.message : 'Roots request failed',
        },
      }))
    }
  }, [capacitorRoots])

  /**
   * Handle a generic filesystem operation request from the gateway.
   * Operations: stat, read, write, list, exists, mkdir, readdir
   * Each is dispatched to the Electron IPC bridge (or Capacitor on mobile).
   */
  const handleFsOpRequest = useCallback(async (payload: { requestId: string; op: string; [key: string]: unknown }) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { requestId, op, ...params } = payload
    try {
      const platform = detectPlatform()
      if (platform === 'electron' && window.jaitDesktop?.fsOp) {
        const result = await window.jaitDesktop.fsOp(op, params)
        ws.send(JSON.stringify({
          type: 'fs.op-response',
          payload: { requestId, result },
        }))
      } else if (platform === 'capacitor') {
        // For now, capacitor doesn't support full fs operations
        throw new Error('Full filesystem operations not yet supported on mobile')
      } else {
        throw new Error('Filesystem operations not supported on this platform')
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'fs.op-response',
        payload: {
          requestId,
          error: err instanceof Error ? err.message : 'Filesystem operation failed',
        },
      }))
    }
  }, [])

  /**
   * Handle a provider operation request from the gateway.
   * Operations: start-session, send-turn, stop-session, list-models
   * Dispatches to the Electron IPC bridge.
   */
  const handleProviderOpRequest = useCallback(async (payload: { requestId: string; op: string; [key: string]: unknown }) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { requestId, op, ...params } = payload
    try {
      const platform = detectPlatform()
      if (platform === 'electron' && window.jaitDesktop?.providerOp) {
        const result = await window.jaitDesktop.providerOp(op, params)
        ws.send(JSON.stringify({
          type: 'provider.op-response',
          payload: { requestId, result },
        }))
      } else {
        throw new Error('Provider operations not supported on this platform')
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'provider.op-response',
        payload: {
          requestId,
          error: err instanceof Error ? err.message : 'Provider operation failed',
        },
      }))
    }
  }, [])

  /**
   * Handle a tool execution request from the gateway.
   * Dispatches to the Electron IPC bridge for local execution on this node.
   */
  const handleToolOpRequest = useCallback(async (payload: {
    requestId: string; tool: string; args: Record<string, unknown>;
    sessionId?: string; workspaceRoot?: string
  }) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { requestId, tool, args, sessionId, workspaceRoot } = payload
    try {
      const platform = detectPlatform()
      if (platform === 'electron' && window.jaitDesktop?.toolOp) {
        const result = await window.jaitDesktop.toolOp(
          tool,
          args,
          { sessionId, workspaceRoot },
        )
        ws.send(JSON.stringify({
          type: 'tool.op-response',
          payload: { requestId, result },
        }))
      } else {
        throw new Error('Tool execution not supported on this platform')
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'tool.op-response',
        payload: {
          requestId,
          error: err instanceof Error ? err.message : 'Tool execution failed',
        },
      }))
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
        const reconnected = hasConnectedRef.current
        hasConnectedRef.current = true
        onConnectionStateChangeRef.current?.({ connected: true, reconnected })
        ws.send(JSON.stringify({
          type: 'resource.subscribe',
          payload: { resource: 'root:/nodes' },
        }))
        ws.send(JSON.stringify({
          type: 'resource.subscribe',
          payload: { resource: 'root:/threads' },
        }))
        ws.send(JSON.stringify({
          type: 'resource.subscribe',
          payload: { resource: 'root:/surfaces' },
        }))
        // Subscribe to current session on connect
        const sid = sessionIdRef.current
        if (sid) subscribeToSession(ws, sid)
        // Flush any queued outgoing messages
        flushQueue(ws)
        // Register as a filesystem node if this client can browse files locally
        if (canActAsFsNode()) {
          // Ensure device ID is initialised from persistent storage
          void initDeviceId().then(async (deviceId) => {
            // Detect locally installed CLI providers (codex, claude-code)
            let providers: string[] = []
            if (detectPlatform() === 'electron' && window.jaitDesktop?.detectProviders) {
              try { providers = await window.jaitDesktop.detectProviders() } catch { /* */ }
            }
            const nodeMsg = JSON.stringify({
              type: 'node.hello',
              payload: {
                id: deviceId,
                name: getDeviceName(),
                platform: detectFsNodePlatform(),
                role: detectPlatform() === 'electron' ? 'desktop' : 'mobile',
                protocolVersion: NODE_PROTOCOL_VERSION,
                capabilities: {
                  providers,
                  surfaces: ['filesystem'],
                  tools: [],
                  screenShare: true,
                  voice: false,
                  preview: false,
                },
              },
            })
            if (ws.readyState === WebSocket.OPEN) ws.send(nodeMsg)
            const fsNodeMsg = JSON.stringify({
              type: 'fs.register-node',
              payload: {
                id: deviceId,
                name: getDeviceName(),
                platform: detectFsNodePlatform(),
                providers,
              },
            })
            if (ws.readyState === WebSocket.OPEN) ws.send(fsNodeMsg)
          })
        }
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        wsRef.current = null
        currentSessionRef.current = null
        onConnectionStateChangeRef.current?.({ connected: false, reconnected: false })
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

    // Set up Electron IPC listener for provider events from child processes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gatewayEventHandler = (_event: unknown, data: any) => {
      if (data?.type === 'provider.event-from-child') {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'provider.event',
            payload: {
              sessionId: data.sessionId,
              event: data.notification,
            },
          }))
        }
      }
    }
    if (detectPlatform() === 'electron' && window.jaitDesktop?.onGatewayEvent) {
      window.jaitDesktop.onGatewayEvent(gatewayEventHandler)
    }

    return () => {
      mountedRef.current = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      // Clean up Electron IPC listener
      if (detectPlatform() === 'electron' && window.jaitDesktop?.removeGatewayEventListener) {
        window.jaitDesktop.removeGatewayEventListener()
      }
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
