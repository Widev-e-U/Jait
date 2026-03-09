/**
 * Provider Contracts — CLI agent provider abstraction.
 *
 * Supports three provider types:
 *  1. "jait"        — Jait's own runAgentLoop (OpenAI-compatible API)
 *  2. "codex"       — OpenAI Codex CLI via stdio JSON-RPC
 *  3. "claude-code" — Anthropic Claude Code CLI via stdio
 *
 * Each CLI provider can optionally connect to Jait's MCP server
 * to access custom tools (memory, cron, web, todo, etc.).
 */
export type ProviderId = "jait" | "codex" | "claude-code";
export interface ProviderInfo {
    id: ProviderId;
    name: string;
    description: string;
    /** Whether this provider is available (binary found, API key set, etc.) */
    available: boolean;
    /** Why it's unavailable */
    unavailableReason?: string;
    /** Supported runtime modes */
    modes: RuntimeMode[];
}
export type RuntimeMode = "full-access" | "supervised";
export type ProviderSessionStatus = "idle" | "starting" | "running" | "completed" | "interrupted" | "error";
export interface ProviderSession {
    id: string;
    providerId: ProviderId;
    threadId: string;
    status: ProviderSessionStatus;
    runtimeMode: RuntimeMode;
    error?: string;
    startedAt?: string;
    completedAt?: string;
}
export type ProviderEvent = {
    type: "session.started";
    sessionId: string;
} | {
    type: "session.completed";
    sessionId: string;
} | {
    type: "session.error";
    sessionId: string;
    error: string;
} | {
    type: "turn.completed";
    sessionId: string;
} | {
    type: "token";
    sessionId: string;
    content: string;
} | {
    type: "tool.start";
    sessionId: string;
    tool: string;
    args: unknown;
    callId?: string;
} | {
    type: "tool.output";
    sessionId: string;
    callId: string;
    content: string;
} | {
    type: "tool.result";
    sessionId: string;
    tool: string;
    ok: boolean;
    message: string;
    callId?: string;
    data?: unknown;
} | {
    type: "tool.approval-required";
    sessionId: string;
    tool: string;
    args: unknown;
    requestId: string;
} | {
    type: "message";
    sessionId: string;
    role: "assistant" | "user";
    content: string;
} | {
    type: "activity";
    sessionId: string;
    kind: string;
    summary: string;
    payload?: unknown;
};
export interface ProviderModelInfo {
    /** Model identifier / slug */
    id: string;
    /** Human-readable model name */
    name: string;
    /** Optional description */
    description?: string;
    /** Whether this is the provider's current/default model */
    isDefault?: boolean;
}
export interface CliProviderAdapter {
    readonly id: ProviderId;
    readonly info: ProviderInfo;
    /**
     * Check if the provider binary/service is available.
     * Updates `info.available` and returns the result.
     */
    checkAvailability(): Promise<boolean>;
    /**
     * List models available for this provider.
     * Returns an empty array if listing is not supported.
     */
    listModels?(): Promise<ProviderModelInfo[]>;
    /**
     * Start a provider session for a given thread.
     * The provider should spawn its CLI process and begin listening.
     */
    startSession(options: StartSessionOptions): Promise<ProviderSession>;
    /**
     * Send a user message / turn to an active session.
     */
    sendTurn(sessionId: string, message: string, attachments?: string[]): Promise<void>;
    /**
     * Interrupt the current turn in a session.
     */
    interruptTurn(sessionId: string): Promise<void>;
    /**
     * Respond to an approval request (supervised mode).
     */
    respondToApproval(sessionId: string, requestId: string, approved: boolean): Promise<void>;
    /**
     * Stop a session and kill the provider process.
     */
    stopSession(sessionId: string): Promise<void>;
    /**
     * Subscribe to events from this provider.
     * Returns an unsubscribe function.
     */
    onEvent(handler: (event: ProviderEvent) => void): () => void;
}
export interface StartSessionOptions {
    threadId: string;
    /** Working directory for the agent */
    workingDirectory: string;
    /** Runtime mode */
    mode: RuntimeMode;
    /** Model to use (provider-specific) */
    model?: string;
    /** Environment variables to pass to the CLI process */
    env?: Record<string, string>;
    /** MCP server configs the CLI should connect to */
    mcpServers?: McpServerRef[];
}
/** Reference to an MCP server the CLI provider should connect to */
export interface McpServerRef {
    /** Server name */
    name: string;
    /** Transport: stdio command or SSE URL */
    transport: "stdio" | "sse";
    /** For stdio: command to run */
    command?: string;
    args?: string[];
    /** For SSE: URL to connect to */
    url?: string;
    /** Env vars for the MCP server process */
    env?: Record<string, string>;
}
//# sourceMappingURL=contracts.d.ts.map