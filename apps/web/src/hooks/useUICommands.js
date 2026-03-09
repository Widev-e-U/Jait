import { useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '@/lib/gateway-url';
const WS_URL = getWsUrl();
// ── Device / platform helpers (shared with useScreenShare) ──────────
function detectPlatform() {
    if (typeof window !== 'undefined' && window.jaitDesktop)
        return 'electron';
    if (typeof window !== 'undefined' && 'Capacitor' in window)
        return 'capacitor';
    return 'web';
}
function generateDeviceId() {
    const platform = detectPlatform();
    const storageKey = `jait-device-id-${platform}`;
    const stored = localStorage.getItem(storageKey);
    if (stored)
        return stored;
    const id = `${platform}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, id);
    return id;
}
function getDeviceName() {
    const platform = detectPlatform();
    const ua = navigator.userAgent;
    if (platform === 'electron')
        return `Desktop (${navigator.platform})`;
    if (platform === 'capacitor')
        return 'Mobile';
    if (ua.includes('Chrome'))
        return `Chrome (${navigator.platform})`;
    if (ua.includes('Firefox'))
        return `Firefox (${navigator.platform})`;
    if (ua.includes('Safari'))
        return `Safari (${navigator.platform})`;
    return `Browser (${navigator.platform})`;
}
function detectFsNodePlatform() {
    const p = detectPlatform();
    if (p === 'capacitor')
        return 'android'; // or ios, but we'll keep it simple
    if (p === 'electron') {
        const plat = navigator.platform?.toLowerCase() ?? '';
        if (plat.includes('win'))
            return 'windows';
        if (plat.includes('mac'))
            return 'macos';
        return 'linux';
    }
    return 'web';
}
/**
 * Whether this client can act as a filesystem node (browse local files).
 * Browser clients served from a local dev server can't really expose files,
 * but Electron and Capacitor can.
 */
function canActAsFsNode() {
    const p = detectPlatform();
    return p === 'electron' || p === 'capacitor';
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
export function useUICommands(opts) {
    const { listeners, sessionId, token, onStateSync, onFullState, onMessageComplete, onThreadEvent } = opts;
    const listenersRef = useRef(listeners);
    listenersRef.current = listeners;
    const onStateSyncRef = useRef(onStateSync);
    onStateSyncRef.current = onStateSync;
    const onFullStateRef = useRef(onFullState);
    onFullStateRef.current = onFullState;
    const onMessageCompleteRef = useRef(onMessageComplete);
    onMessageCompleteRef.current = onMessageComplete;
    const onThreadEventRef = useRef(onThreadEvent);
    onThreadEventRef.current = onThreadEvent;
    const wsRef = useRef(null);
    const currentSessionRef = useRef(null);
    const mountedRef = useRef(true);
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const sessionIdRef = useRef(sessionId);
    sessionIdRef.current = sessionId;
    // Queue for messages that couldn't be sent because WS was not open
    const outgoingQueueRef = useRef([]);
    // Flush queued messages when WS becomes ready
    const flushQueue = useCallback((ws) => {
        while (outgoingQueueRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
            const msg = outgoingQueueRef.current.shift();
            ws.send(msg);
        }
    }, []);
    // Subscribe (or re-subscribe) the WS to a session
    const subscribeToSession = useCallback((ws, sid) => {
        if (!sid || ws.readyState !== WebSocket.OPEN)
            return;
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: sid }));
        currentSessionRef.current = sid;
    }, []);
    // Handle incoming messages — extracted so it's stable across reconnects
    const handleMessage = useCallback((event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'ui.command') {
                const payload = msg.payload;
                const handler = listenersRef.current[payload.command];
                if (handler) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ;
                    handler(payload.data);
                }
            }
            else if (msg.type === 'ui.state-sync') {
                // Cross-client state sync from another client or the gateway
                const payload = msg.payload;
                if (payload?.key && onStateSyncRef.current) {
                    onStateSyncRef.current(payload.key, payload.value ?? null);
                }
            }
            else if (msg.type === 'ui.full-state') {
                // Full session state pushed by the gateway on subscribe — authoritative
                const state = msg.payload;
                if (state && onFullStateRef.current) {
                    onFullStateRef.current(state);
                }
            }
            else if (msg.type === 'message.complete') {
                // Assistant message finished on another device — refresh chat
                onMessageCompleteRef.current?.();
            }
            else if (msg.type === 'fs.browse-request') {
                // Gateway is asking us to browse a local directory
                void handleFsBrowseRequest(msg.payload);
            }
            else if (msg.type === 'fs.roots-request') {
                // Gateway is asking for our root directories
                void handleFsRootsRequest(msg.payload);
            }
            else if (msg.type.startsWith('thread.') || msg.type.startsWith('repo.')) {
                // Thread & repo lifecycle events — forward to automation hook
                onThreadEventRef.current?.(msg.type, msg.payload);
            }
        }
        catch {
            // ignore parse errors
        }
    }, []);
    // ── Filesystem node request handlers ──────────────────────────────
    /** Browse a local directory using Capacitor Filesystem API */
    const capacitorBrowse = useCallback(async (dirPath) => {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        // Determine the base directory and relative path
        let directory;
        let path = dirPath;
        if (dirPath === '~' || dirPath === '/storage' || dirPath === '/') {
            // Root request — list the external storage root
            directory = Directory.ExternalStorage;
            path = '';
        }
        else if (dirPath.startsWith('/storage/emulated/0')) {
            directory = Directory.ExternalStorage;
            path = dirPath.replace('/storage/emulated/0', '').replace(/^\//, '');
        }
        const result = await Filesystem.readdir({
            path: path || '',
            ...(directory ? { directory } : {}),
        });
        const basePath = directory === Directory.ExternalStorage
            ? '/storage/emulated/0' + (path ? '/' + path : '')
            : dirPath;
        const entries = [];
        for (const f of result.files) {
            if (f.name.startsWith('.'))
                continue;
            entries.push({
                name: f.name,
                path: basePath + '/' + f.name,
                type: f.type === 'directory' ? 'dir' : 'file',
            });
        }
        entries.sort((a, b) => {
            if (a.type !== b.type)
                return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        // Compute parent
        const parts = basePath.replace(/\/+$/, '').split('/');
        const parent = parts.length > 3 ? parts.slice(0, -1).join('/') : null;
        return { path: basePath, parent, entries };
    }, []);
    /** Get root directories on Capacitor (Android) */
    const capacitorRoots = useCallback(async () => {
        return [
            { name: 'Internal Storage', path: '/storage/emulated/0', type: 'dir' },
            { name: 'Documents', path: '/storage/emulated/0/Documents', type: 'dir' },
            { name: 'Downloads', path: '/storage/emulated/0/Download', type: 'dir' },
            { name: 'Home', path: '/storage/emulated/0', type: 'dir' },
        ];
    }, []);
    /** Respond to a remote browse request from the gateway */
    const handleFsBrowseRequest = useCallback(async (payload) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN)
            return;
        const { requestId, path } = payload;
        try {
            let result;
            const platform = detectPlatform();
            if (platform === 'electron' && window.jaitDesktop?.browsePath) {
                result = await window.jaitDesktop.browsePath(path);
            }
            else if (platform === 'capacitor') {
                result = await capacitorBrowse(path);
            }
            else {
                throw new Error('Local filesystem browsing not supported on this platform');
            }
            ws.send(JSON.stringify({
                type: 'fs.browse-response',
                payload: {
                    requestId,
                    path: result.path,
                    parent: result.parent,
                    entries: result.entries,
                },
            }));
        }
        catch (err) {
            ws.send(JSON.stringify({
                type: 'fs.browse-response',
                payload: {
                    requestId,
                    error: err instanceof Error ? err.message : 'Browse failed',
                },
            }));
        }
    }, [capacitorBrowse]);
    /** Respond to a remote roots request from the gateway */
    const handleFsRootsRequest = useCallback(async (payload) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN)
            return;
        const { requestId } = payload;
        try {
            let roots;
            const platform = detectPlatform();
            if (platform === 'electron' && window.jaitDesktop?.getRoots) {
                const result = await window.jaitDesktop.getRoots();
                roots = result.roots;
            }
            else if (platform === 'capacitor') {
                roots = await capacitorRoots();
            }
            else {
                throw new Error('Local filesystem browsing not supported on this platform');
            }
            ws.send(JSON.stringify({
                type: 'fs.roots-response',
                payload: { requestId, roots },
            }));
        }
        catch (err) {
            ws.send(JSON.stringify({
                type: 'fs.roots-response',
                payload: {
                    requestId,
                    error: err instanceof Error ? err.message : 'Roots request failed',
                },
            }));
        }
    }, [capacitorRoots]);
    // ── Single, stable WS connection — only depends on token ──────────
    // Session changes are handled by re-subscribing, NOT by reconnecting.
    useEffect(() => {
        mountedRef.current = true;
        let reconnectTimer = null;
        const connect = () => {
            if (!mountedRef.current)
                return;
            const ws = new WebSocket(`${WS_URL}?token=${tokenRef.current ?? 'dev'}`);
            wsRef.current = ws;
            ws.onopen = () => {
                // Subscribe to current session on connect
                const sid = sessionIdRef.current;
                if (sid)
                    subscribeToSession(ws, sid);
                // Flush any queued outgoing messages
                flushQueue(ws);
                // Register as a filesystem node if this client can browse files locally
                if (canActAsFsNode()) {
                    const nodeMsg = JSON.stringify({
                        type: 'fs.register-node',
                        payload: {
                            id: generateDeviceId(),
                            name: getDeviceName(),
                            platform: detectFsNodePlatform(),
                        },
                    });
                    ws.send(nodeMsg);
                }
            };
            ws.onmessage = handleMessage;
            ws.onclose = () => {
                wsRef.current = null;
                currentSessionRef.current = null;
                // Auto-reconnect after 1s
                if (mountedRef.current) {
                    reconnectTimer = setTimeout(connect, 1000);
                }
            };
            ws.onerror = () => {
                // onclose will fire after onerror, triggering reconnect
            };
        };
        connect();
        return () => {
            mountedRef.current = false;
            if (reconnectTimer)
                clearTimeout(reconnectTimer);
            const ws = wsRef.current;
            if (ws) {
                ws.onclose = null; // prevent reconnect on intentional close
                ws.close();
                wsRef.current = null;
            }
        };
        // Only reconnect the WS when the auth token changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);
    // Re-subscribe when sessionId changes (no WS reconnection needed)
    useEffect(() => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && sessionId !== currentSessionRef.current) {
            subscribeToSession(ws, sessionId ?? null);
        }
        // Also update the ref so reconnects use the latest sessionId
        sessionIdRef.current = sessionId ?? null;
    }, [sessionId, subscribeToSession]);
    /**
     * Send a UI state update to the gateway for DB persistence + cross-client broadcast.
     * Call this whenever the user opens/closes an agent-controllable panel.
     * Messages are queued if the WS is not currently connected.
     */
    const sendUIState = useCallback((key, value, sid) => {
        const msg = JSON.stringify({
            type: 'ui.state',
            payload: { sessionId: sid ?? '', key, value },
        });
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
        }
        else {
            // Queue for delivery when WS reconnects
            outgoingQueueRef.current.push(msg);
        }
    }, []);
    return { sendUIState };
}
//# sourceMappingURL=useUICommands.js.map