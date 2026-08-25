// @jait/shared — Message types for WS and chat
export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  sessionId: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "approved" | "executing" | "completed" | "failed" | "rejected";
}

/**
 * Kinds of blocking interaction that raise a cross-device attention item.
 */
export type AttentionKind = "consent" | "question";

/**
 * The shared notification identity for one open request. Every platform reuses
 * this string as its *native* notification key — Android notification id,
 * Electron notification map key, web `tag`, Wear data path — so a single
 * `attention.cleared` event can revoke the same card on every device.
 *
 * Both the gateway (raising) and the clients (revoking) must derive the key the
 * same way, which is why it lives in shared rather than in either one.
 */
export function attentionKey(kind: AttentionKind, requestId: string): string {
  return `${kind}:${requestId}`;
}

// WebSocket event types
export type WsEventType =
  | "session.created"
  | "session.closed"
  | "node.registry"
  | "node.updated"
  | "node.disconnected"
  | "nodes.list"
  | "nodes.get"
  | "nodes.update-permissions"
  | "nodes.permissions"
  | "message.delta"
  | "message.started"
  | "message.complete"
  | "session.streaming"
  | "session.streaming-snapshot"
  | "tool.call"
  | "tool.result"
  | "consent.required"
  | "consent.resolved"
  | "secret.requested"
  | "secret.resolved"
  | "user-question.requested"
  | "user-question.resolved"
  // Cross-device attention layer: one item per "a chat needs the user", with a
  // stable key every platform reuses as its native notification identity so a
  // single "cleared" event revokes the toast on phone, watch, desktop and web.
  | "attention.raised"
  | "attention.cleared"
  | "surface.connected"
  | "surface.disconnected"
  | "surface.registry"
  | "surface.updated"
  // A terminal tool call binding itself to the terminal it runs in. Pushed the
  // instant the command is written to the PTY (and again when it finishes), so
  // a running tool card can attach its live terminal without discovering the
  // terminal by polling /api/terminals.
  | "terminal.execution"
  | "ui.command"
  | "ui.state-sync"
  | "ui.full-state"
  | "thread.created"
  | "thread.updated"
  | "thread.deleted"
  | "thread.status"
  | "thread.activity"
  // Browser collaboration live updates
  | "browser.updated"        // snapshot of sessions + interventions
  | "browser.session"        // single session upsert/update
  | "browser.intervention"   // single intervention upsert/update
  | "repo.created"
  | "repo.updated"
  | "repo.deleted"
  | "plan.created"
  | "plan.updated"
  | "plan.deleted"
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "project.restored"
  | "chat.created"
  | "chat.updated"
  | "chat.archived"
  | "chat.deleted"
  | "chat.moved"
  | "notification"
  | "fs.changes"
  | "error";

export interface WsEvent<T = unknown> {
  type: WsEventType;
  sessionId: string;
  timestamp: string;
  payload: T;
}

// ── UI command channel (server → client) ────────────────────────────
export type UICommandType =
  | "project.open"
  | "project.close"
  | "project.editor.open"
  | "terminal.focus"
  | "file.highlight"
  | "dev-preview.open"
  | "screen-share.open"
  | "screen-share.close"
  | "architecture.update"
  | "email.control";

/** Payload sent inside a `ui.command` WsEvent */
export interface UICommandPayload<T = Record<string, unknown>> {
  command: UICommandType;
  data: T;
}

export interface ProjectOpenData {
  surfaceId: string;
  projectRoot: string;
  nodeId?: string;
  panelOpen?: boolean;
}

export interface ProjectCloseData {
  surfaceId: string;
}

export interface ProjectEditorOpenData {
  projectRoot?: string;
}

/** Payload for a `session.streaming` WsEvent — broadcast to every client of a
 * user (not just those subscribed to the session) so the sidebar can show a
 * loading indicator for sessions running in the background. */
export interface SessionStreamingData {
  sessionId: string;
  streaming: boolean;
}

/** Authoritative streaming state sent when a client connects or reconnects. */
export interface SessionStreamingSnapshotData {
  sessionIds: string[];
}

export interface TerminalFocusData {
  terminalId: string;
  reason?: "interactive-input-required" | string;
  message?: string;
}

/**
 * One terminal tool call's claim on a terminal, pushed on `terminal.execution`.
 *
 * `outputOffset` is where the command's output starts in the terminal's output
 * stream, so a tool card can replay exactly this command's slice; the matching
 * `outputEndOffset` arrives with the completion event. `execution: null` means
 * the call released the terminal without producing a retainable slice.
 */
export interface TerminalExecutionPayload {
  terminalId: string;
  execution: {
    command: string;
    actionId: string;
    startedAt: string;
    completedAt: string | null;
    outputOffset: number;
    outputEndOffset: number | null;
    isBackground: boolean;
    watched: boolean | null;
  } | null;
}

export interface FileHighlightData {
  path: string;
  line?: number;
}

export interface DevPreviewOpenData {
  target?: string | null;
  projectRoot?: string | null;
}

export interface ScreenShareOpenData {
  sessionId: string;
  targetDeviceId: string;
}

export interface ArchitectureUpdateData {
  /** Mermaid diagram source code */
  diagram: string;
  /** Correlates the browser render result with the originating tool call */
  requestId?: string;
  /** Project the diagram belongs to */
  projectRoot?: string;
  /** Absolute path to the persisted Mermaid file, when available */
  filePath?: string;
}

/**
 * Agent-driven control of the Email page UI. Lets agents navigate folders,
 * open a message, prefill a compose/reply draft, or refresh the live page the
 * user is looking at.
 */
export interface EmailControlData {
  action: "navigate" | "open" | "compose" | "refresh";
  /** Connected account to act on (defaults to the page's active account). */
  accountId?: string;
  /** For `navigate`: folder/label name or id (e.g. "inbox", "sent"). */
  folder?: string;
  /** For `open`: the message id to open in the reading pane. */
  messageId?: string;
  /** For `compose`: prefilled draft fields. */
  to?: string;
  subject?: string;
  body?: string;
  replyToMessageId?: string;
}

// ── Filesystem change events (server → client) ──────────────────────
export type FsChangeType = "created" | "updated" | "deleted";

export interface FsChangeEvent {
  /** Project-relative path (forward slashes) */
  path: string;
  type: FsChangeType;
}

export interface FsChangesPayload {
  surfaceId: string;
  changes: FsChangeEvent[];
}

// ── UI state sync (client → server → other clients) ─────────────────

/**
 * Keys for UI component state that can be synced between client and server.
 * Each key maps to a specific panel/component that the agent can control.
 */
export type UIStateKey =
  | "project.panel"
  | "dev-preview.panel"
  | "project.tabs"
  | "project.layout"
  | "screen-share.panel"
  | "terminal.panel"
  | "footer.menu"
  | "chat.mode"
  | "chat.responseStyle"
  | "chat.providerRuntimeMode"
  | "chat.provider"
  | "chat.reasoningEffort"
  | "chat.cliModels"
  | "chat.view"
  | "todo_list"
  | "changed_files"
  | "queued_messages"
  | "queued_thread_messages";

export type ResponseStyle = "normal" | "simple" | "caveman" | "caveman-ultra";

/** Payload sent inside a `ui.state` client→server WS message */
export interface UIStateUpdate {
  sessionId: string;
  key: UIStateKey;
  value: unknown | null;  // null = delete / panel closed
}

export interface DevPreviewPanelState {
  open: boolean;
  target?: string | null;
  projectRoot?: string | null;
  displayState?: "hidden" | "blank" | "connected";
  displayTarget?: string | null;
}

/**
 * Unified project UI state — single DB row per project.
 * Stored under key `project.ui` in the project_state table.
 */
export interface ProjectUIState {
  /** Project editor panel */
  panel: {
    open: boolean;
    remotePath: string;
    surfaceId?: string;
    nodeId?: string;
  } | null;
  /** Open file tabs + active tab */
  tabs: {
    remoteRoot: string;
    tabs: Array<{ path: string; label: string }>;
    activePath: string | null;
  } | null;
  /** Tree/editor visibility and per-project desktop resize state */
  layout: {
    tree: boolean;
    editor: boolean;
    panelSize?: number;
    treeSize?: number;
    terminalHeight?: number;
    terminalColumnWidth?: number;
  } | null;
  /** Terminal panel */
  terminal: { open: boolean; activeTerminalId?: string | null } | null;
  /** Dev preview / VNC browser panel */
  preview: DevPreviewPanelState | null;
}
