import type { UICommandType, UIStateKey, WorkspaceOpenData, WorkspaceCloseData, TerminalFocusData, FileHighlightData } from '@jait/shared';
type CommandDataMap = {
    'workspace.open': WorkspaceOpenData;
    'workspace.close': WorkspaceCloseData;
    'terminal.focus': TerminalFocusData;
    'file.highlight': FileHighlightData;
};
type UICommandListener<T extends UICommandType = UICommandType> = T extends keyof CommandDataMap ? (data: CommandDataMap[T]) => void : (data: Record<string, unknown>) => void;
interface Listeners {
    'workspace.open'?: UICommandListener<'workspace.open'>;
    'workspace.close'?: UICommandListener<'workspace.close'>;
    'terminal.focus'?: UICommandListener<'terminal.focus'>;
    'file.highlight'?: UICommandListener<'file.highlight'>;
    'screen-share.open'?: (data: Record<string, unknown>) => void;
    'screen-share.close'?: (data: Record<string, unknown>) => void;
}
/**
 * Callback for `ui.state-sync` events from other clients / the gateway.
 * `key` is the state key (e.g. "workspace.panel", "todo_list", "file_changed").
 */
export type StateSyncHandler = (key: string, value: unknown) => void;
/**
 * Callback for `ui.full-state` — the complete session state pushed on subscribe.
 */
export type FullStateHandler = (state: Record<string, unknown>) => void;
/**
 * Callback for thread-related WS events (thread.created, thread.updated, etc.).
 * `eventType` is the full WS event type (e.g. "thread.created").
 * `payload` is the event payload (e.g. { threadId, thread }).
 */
export type ThreadEventHandler = (eventType: string, payload: Record<string, unknown>) => void;
interface UseUICommandsOptions {
    /** Listeners for UI commands pushed by the gateway (server → client). */
    listeners: Listeners;
    /** Active session ID — used to subscribe to session-scoped broadcasts. */
    sessionId?: string | null;
    /** Token for WS authentication. */
    token?: string | null;
    /** Called when another client (or the gateway) broadcasts a state change. */
    onStateSync?: StateSyncHandler;
    /** Called when the gateway pushes the full session state on subscribe/reconnect. */
    onFullState?: FullStateHandler;
    /** Called when the gateway broadcasts that an assistant message has completed. */
    onMessageComplete?: () => void;
    /** Called when the gateway broadcasts a thread lifecycle event. */
    onThreadEvent?: ThreadEventHandler;
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
export declare function useUICommands(opts: UseUICommandsOptions): {
    sendUIState: (key: UIStateKey, value: unknown | null, sid?: string | null) => void;
};
export {};
//# sourceMappingURL=useUICommands.d.ts.map