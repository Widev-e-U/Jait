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
export type WsEventType = "session.created" | "session.closed" | "message.delta" | "message.complete" | "tool.call" | "tool.result" | "consent.required" | "consent.resolved" | "surface.connected" | "surface.disconnected" | "ui.command" | "ui.state-sync" | "ui.full-state" | "thread.created" | "thread.updated" | "thread.deleted" | "thread.status" | "thread.activity" | "repo.created" | "repo.updated" | "repo.deleted" | "error";
export interface WsEvent<T = unknown> {
    type: WsEventType;
    sessionId: string;
    timestamp: string;
    payload: T;
}
export type UICommandType = "workspace.open" | "workspace.close" | "terminal.focus" | "file.highlight" | "screen-share.open" | "screen-share.close";
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
    reason?: "interactive-input-required" | string;
    message?: string;
}
export interface FileHighlightData {
    path: string;
    line?: number;
}
export interface ScreenShareOpenData {
    sessionId: string;
    targetDeviceId: string;
}
/**
 * Keys for UI component state that can be synced between client and server.
 * Each key maps to a specific panel/component that the agent can control.
 */
export type UIStateKey = "workspace.panel" | "screen-share.panel" | "terminal.panel" | "todo_list" | "changed_files";
/** Payload sent inside a `ui.state` client→server WS message */
export interface UIStateUpdate {
    sessionId: string;
    key: UIStateKey;
    value: unknown | null;
}
//# sourceMappingURL=message.d.ts.map