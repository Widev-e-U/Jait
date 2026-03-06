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
  | "message.delta"
  | "message.complete"
  | "tool.call"
  | "tool.result"
  | "consent.required"
  | "consent.resolved"
  | "surface.connected"
  | "surface.disconnected"
  | "ui.command"
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
  | "file.highlight";

/** Payload sent inside a `ui.command` WsEvent */
export interface UICommandPayload<T = Record<string, unknown>> {
  command: UICommandType;
  data: T;
}

export interface WorkspaceOpenData {
  surfaceId: string;
  workspaceRoot: string;
}

export interface WorkspaceCloseData {
  surfaceId: string;
}

export interface TerminalFocusData {
  terminalId: string;
}

export interface FileHighlightData {
  path: string;
  line?: number;
}
