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
  | "message.delta"
  | "message.complete"
  | "tool.call"
  | "tool.result"
  | "consent.required"
  | "consent.resolved"
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
  | "repo.created"
  | "repo.updated"
  | "repo.deleted"
  | "plan.created"
  | "plan.updated"
  | "plan.deleted"
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
  | "workspace.open"
  | "workspace.close"
  | "terminal.focus"
  | "file.highlight"
  | "dev-preview.open"
  | "screen-share.open"
  | "screen-share.close"
  | "architecture.update";

/** Payload sent inside a `ui.command` WsEvent */
export interface UICommandPayload<T = Record<string, unknown>> {
  command: UICommandType;
  data: T;
}

export interface WorkspaceOpenData {
  surfaceId: string;
  workspaceRoot: string;
  nodeId?: string;
}

export interface WorkspaceCloseData {
  surfaceId: string;
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
  workspaceRoot?: string | null;
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
}

// ── Filesystem change events (server → client) ──────────────────────
export type FsChangeType = "created" | "updated" | "deleted";

export interface FsChangeEvent {
  /** Workspace-relative path (forward slashes) */
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
  | "workspace.panel"
  | "dev-preview.panel"
  | "workspace.tabs"
  | "workspace.layout"
  | "screen-share.panel"
  | "terminal.panel"
  | "chat.mode"
  | "chat.providerRuntimeMode"
  | "chat.cliModels"
  | "chat.view"
  | "todo_list"
  | "changed_files"
  | "queued_messages";

/** Payload sent inside a `ui.state` client→server WS message */
export interface UIStateUpdate {
  sessionId: string;
  key: UIStateKey;
  value: unknown | null;  // null = delete / panel closed
}
