/**
 * Provider Contracts — CLI agent provider abstraction.
 *
 * Supports Jait's native provider plus Agent Client Protocol-backed providers
 * such as "codex" and "claude-code".
 *
 * Each CLI provider can optionally connect to Jait's MCP server
 * to access custom tools (memory, cron, web, todo, etc.).
 */

import type {
  ProviderAuthStatus,
  ProviderId,
  ProviderInfo,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  RuntimeMode,
} from "@jait/shared/types";

export type {
  ProviderAuthCapabilities,
  ProviderAuthInfo,
  ProviderAuthStatus,
  ProviderId,
  ProviderInfo,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  RuntimeMode,
} from "@jait/shared/types";

// ── Session lifecycle ────────────────────────────────────────────────

export type ProviderSessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "completed"
  | "interrupted"
  | "error";

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

// ── Events emitted by CLI providers ──────────────────────────────────

export type ProviderEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "session.completed"; sessionId: string }
  | { type: "session.error"; sessionId: string; error: string }
  | { type: "turn.started"; sessionId: string }
  | { type: "turn.completed"; sessionId: string }
  | { type: "token"; sessionId: string; content: string }
  | { type: "tool.start"; sessionId: string; tool: string; args: unknown; callId?: string; parentCallId?: string }
  | { type: "tool.output"; sessionId: string; callId: string; content: string }
  | { type: "tool.result"; sessionId: string; tool: string; ok: boolean; message: string; callId?: string; parentCallId?: string; data?: unknown }
  | { type: "tool.approval-required"; sessionId: string; tool: string; args: unknown; requestId: string }
  | { type: "message"; sessionId: string; role: "assistant" | "user"; content: string }
  | { type: "activity"; sessionId: string; kind: string; summary: string; payload?: unknown };

// ── Provider interface ───────────────────────────────────────────────

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
   * Return current auth state plus supported auth actions.
   */
  getAuthStatus?(): Promise<ProviderAuthStatus>;

  /**
   * Start provider login. Device-login implementations should return the
   * verification URL and user code as soon as the CLI emits them while leaving
   * the CLI process alive to complete the login in the background.
   */
  startLogin?(): Promise<ProviderLoginResult>;

  /**
   * Log out from the provider CLI.
   */
  logout?(): Promise<ProviderLogoutResult>;

  /**
   * Forward a code entered by the user to the running login process stdin.
   * Called when a login result has `requiresCodeInput: true`.
   */
  sendLoginInput?(input: string): void;

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
  /** Transport: stdio command, Streamable HTTP URL, or legacy SSE URL */
  transport: "stdio" | "http" | "sse";
  /** For stdio: command to run */
  command?: string;
  args?: string[];
  /** For SSE: URL to connect to */
  url?: string;
  /** Env vars for the MCP server process */
  env?: Record<string, string>;
}
