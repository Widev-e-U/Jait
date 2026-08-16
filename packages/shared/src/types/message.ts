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
  | "surface.connected"
  | "surface.disconnected"
  | "surface.registry"
  | "surface.updated"
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
