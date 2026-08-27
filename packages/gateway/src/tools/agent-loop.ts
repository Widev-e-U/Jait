/**
 * Agent Loop — reusable, streamable tool-calling loop.
 *
 * Extracted from chat.ts and enhanced with:
 *  - Input validation (catches bad LLM args immediately)
 *  - Parallel tool execution (independent calls run concurrently)
 *  - Retry for individual failed tool calls
 *  - Steering (inject guidance mid-loop)
 *  - Tool call queueing with priority
 *
 * Both the main chat route and the agent.spawn sub-agent tool use this.
 */

import { randomUUID } from "node:crypto";
import type { NestedAgentEvent, ToolDefinition, ToolResult } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
import { validateToolInput } from "./validate.js";
import { type ChatMode, ASK_MODE_TOOLS, MUTATING_TOOLS, SWARM_ORCHESTRATION_TOOLS, type PlannedAction } from "./chat-modes.js";
import { getReminderInstructions, type ModelEndpoint } from "./prompts/index.js";
import { computeContextUsage, estimateMessageTokens, estimateTokens } from "./token-estimator.js";
import { ToolName } from "./tool-names.js";
import { createSwarmRound, endSwarmRound } from "./swarm-mailbox.js";
import { getSessionTodos, type TodoItem } from "./core/todo.js";

/** Tool names that spawn a sub-agent — either the simplified "agent" core tool or legacy "agent.spawn". */
function isAgentSpawnToolName(name: string): boolean {
  return name === ToolName.AgentSpawn || name === ToolName.CoreAgent;
}

// ── Public types ─────────────────────────────────────────────────────

/** Wire format for a single OpenAI tool call */
export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** A chat message in the conversation history */
export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
  /**
   * Hidden reasoning emitted alongside the visible content (e.g. reasoning
   * models, or <thinking> blocks). Persisted to history so the model keeps
   * reasoning continuity across tool rounds instead of re-thinking from
   * scratch each round. Never rendered as user-visible text.
   */
  thinking?: string;
  /**
   * True for messages injected into the working context by the gateway or
   * agent loop rather than sent by the user. Synthetic messages still reach
   * the model, but callers exclude them from user-facing history, persistence,
   * and prompt counts.
   */
  synthetic?: boolean;
}

/** Segment for interleaved rendering of text and tool calls */
export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "toolGroup"; callIds: string[] }
  | { type: "error"; content: string }
  | { type: "steering"; content: string; displayContent?: string };

/** OpenAI function-calling tool schema */
export interface OpenAIToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}

/** Snapshot of an outbound model request, with credentials removed. */
export interface LlmContextFlowRound {
  round: number;
  createdAt: string;
  model: string;
  messages: ReturnType<typeof serializeMessages>;
  tools?: OpenAIToolSchema[];
  tool_choice?: "auto";
  /** Metrics captured after the round completes. */
  metrics?: RoundMetrics;
}

/** Per-round performance and token metrics. */
export interface RoundMetrics {
  /** Wall-clock duration of the LLM request in ms. */
  durationMs: number;
  /** Provider-reported token usage (when available). */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Estimated tokens/second for the completion. */
  tokensPerSecond?: number;
  /** Context budget snapshot at request time. */
  contextUsage?: {
    system: number;
    history: number;
    toolResults: number;
    tools: number;
    total: number;
    limit: number;
    ratio: number;
    pruned?: boolean;
  };
}

/** LLM connection config */
export interface LLMConfig {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  /** Max context window in tokens */
  contextWindow: number;
  /**
   * Backend kind. When "ollama", the loop talks to ollama's native
   * /api/chat endpoint so it can pass `num_ctx` — the OpenAI-compatible
   * /v1 endpoint silently ignores it and pins the model to the server's
   * default context, which truncates long conversations.
   */
  backend?: string;
  /** Requested context length (ollama num_ctx). Defaults to contextWindow. */
  numCtx?: number;
}

/** Persisted record of a tool call execution */
export interface ExecutedToolCall {
  callId: string;
  parentCallId?: string;
  tool: string;
  args: unknown;
  ok: boolean;
  message: string;
  data?: unknown;
  startedAt: number;
  completedAt: number;
  /** Number of times this call was retried */
  retryCount?: number;
}

/** Events emitted during the loop */
export type AgentLoopEvent =
  | { type: "token"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call_delta"; call_id: string; index: number; name_delta?: string; args_delta?: string }
  | { type: "tool_start"; tool: string; args: unknown; call_id: string; parent_call_id?: string }
  | { type: "tool_output"; call_id: string; content: string; channel?: "text" | "thinking" }
  | { type: "tool_result"; call_id: string; tool: string; ok: boolean; message: string; parent_call_id?: string; data?: unknown }
  | { type: "tool_retry"; call_id: string; attempt: number; maxAttempts: number }
  | { type: "tool_validation_error"; call_id: string; tool: string; errors: string[] }
  | { type: "steering"; message: string }
  | { type: "plan_action"; action: PlannedAction }
  | { type: "plan_complete"; planId: string; summary: string; actions: PlannedAction[] }
  | { type: "mode_notice"; mode: ChatMode; message: string }
  | { type: "todo_list"; items: { id: number; title: string; status: "not-started" | "in-progress" | "completed" }[] }
  | { type: "context_usage"; system: number; history: number; toolResults: number; tools: number; total: number; limit: number; ratio: number; pruned?: boolean }
  // A generation was discarded after streaming (runaway repetition, or a
  // replayed-reasoning loop) and its tokens must be removed from any live
  // accumulator that mirrors the turn, so a reload does not persist content
  // the loop itself rolled back. `contentLength` / `segments` are the
  // post-rollback lengths of the loop's own transcript.
  | { type: "content_rollback"; contentLength: number; segments: number }
  // `status` is the provider's HTTP status when the error came from the LLM
  // call. Carried alongside the prose so callers can act on *which* failure it
  // was — retrying a rejected key on another model, say — without matching on
  // wording that exists to be read by humans and translated.
  | { type: "error"; message: string; status?: number };

/** Format an LLM HTTP error into a user-friendly message, similar to VS Code Copilot. */
function formatLLMError(status: number, responseText: string): string {
  let parsed: { error?: { message?: string; type?: string; code?: string } } | undefined;
  try { parsed = JSON.parse(responseText); } catch { /* not JSON */ }
  const serverMsg = parsed?.error?.message;
  const code = parsed?.error?.code;

  switch (status) {
    case 401:
      return "Your API key is invalid or expired. Please check your settings.";
    case 403:
      return "Access denied by the model provider. Please check your API key permissions.";
    case 429:
      if (code === "insufficient_quota" || serverMsg?.includes("quota"))
        return "You've exceeded your API quota. Please check your plan and billing details.";
      return `Rate limited by the model provider. Please wait a moment and try again.${serverMsg ? `\n${serverMsg}` : ""}`;
    case 500:
    case 502:
    case 503:
      return `The model provider is experiencing issues (${status}). Please try again later.`;
    default:
      return serverMsg
        ? `Request failed (${status}): ${serverMsg}`
        : `Request failed with status ${status}. Please try again.`;
  }
}

/**
 * Turn a transport-level failure into something a user can act on.
 *
 * A backend that never answers throws from `fetch` rather than returning a
 * status, so it never reaches {@link formatLLMError} and used to surface as a
 * bare "fetch failed". That is least helpful exactly where it matters most:
 * self-hosted backends (OmniRoute, Ollama) whose usual failure mode is simply
 * not running. Name the endpoint and say what to do about it.
 *
 * Returns null for anything that is not a connection-class failure, so genuine
 * bugs keep propagating instead of being dressed up as a network hiccup.
 */
export function formatConnectionError(
  error: unknown,
  llm: { backend?: string; openaiBaseUrl: string },
): string | null {
  const err = error as {
    name?: string;
    message?: string;
    cause?: { code?: string; name?: string; message?: string };
  };
  const code = err?.cause?.code;
  // Our own AbortSignal.timeout() surfaces as TimeoutError/AbortError, but
  // undici's dispatcher enforces its own deadlines (default 300s to first
  // response byte / between body chunks) and reports them as `TypeError:
  // fetch failed` with a HeadersTimeoutError/BodyTimeoutError cause — the
  // outer error `name` never says "timeout", so the cause must be inspected.
  const isTimeout = err?.name === "TimeoutError"
    || (err?.name === "AbortError" && !err?.message?.includes("user"))
    || err?.cause?.name === "HeadersTimeoutError"
    || err?.cause?.name === "BodyTimeoutError"
    || code === "UND_ERR_HEADERS_TIMEOUT"
    || code === "UND_ERR_BODY_TIMEOUT";
  const isConnectionRefused = code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH";
  const isDnsFailure = code === "ENOTFOUND" || code === "EAI_AGAIN";
  if (!isTimeout && !isConnectionRefused && !isDnsFailure) return null;

  const where = `${llm.backend ?? "the model backend"} at ${llm.openaiBaseUrl}`;
  // Self-hosted backends are the ones the user can actually start again.
  const selfHosted = llm.backend === "omniroute" || llm.backend === "ollama";
  const hint = selfHosted
    ? llm.backend === "omniroute"
      ? "Start the OmniRoute router, or correct OMNIROUTE_BASE_URL in Settings → API keys. The \"Test connection\" button there checks it."
      : "Start Ollama, or correct OLLAMA_URL in Settings → API keys."
    : "Check your network connection and the configured base URL.";

  if (isTimeout) return `No response from ${where} in time. ${hint}`;
  if (isDnsFailure) return `Could not resolve the host for ${where}. ${hint}`;
  return `Could not connect to ${where}. ${hint}`;
}

/**
 * Whether a raw `fetch` failure is a transient transport error worth retrying
 * the same LLM round: undici dispatcher deadlines (a backend that accepted the
 * connection but then hung) and reset/hung-up sockets. Deliberately excludes
 * ECONNREFUSED/ENOTFOUND — a dead backend stays dead, and DNS/refusal failures
 * must surface immediately instead of silently looping.
 */
export function isTransientTransportError(error: unknown): boolean {
  const err = error as { name?: string; cause?: { code?: string; name?: string } } | null;
  const code = err?.cause?.code;
  return err?.cause?.name === "HeadersTimeoutError"
    || err?.cause?.name === "BodyTimeoutError"
    || code === "UND_ERR_HEADERS_TIMEOUT"
    || code === "UND_ERR_BODY_TIMEOUT"
    || code === "UND_ERR_SOCKET"
    || code === "UND_ERR_CONNECT_TIMEOUT"
    || code === "ECONNRESET"
    || code === "EPIPE"
    || code === "ETIMEDOUT";
}

/** Compact reason string for transport-retry logs, e.g. "headers timeout". */
function describeTransportError(error: unknown): string {
  const err = error as { name?: string; message?: string; cause?: { code?: string; name?: string } } | null;
  const code = err?.cause?.code;
  const causeName = err?.cause?.name;
  if (causeName === "HeadersTimeoutError" || code === "UND_ERR_HEADERS_TIMEOUT") return "headers timeout (backend hung)";
  if (causeName === "BodyTimeoutError" || code === "UND_ERR_BODY_TIMEOUT") return "body timeout (stream stalled)";
  if (code === "UND_ERR_SOCKET" || code === "ECONNRESET" || code === "EPIPE") return `connection dropped (${code ?? "undici socket error"})`;
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return "timed out";
  return err?.message || "unknown transport failure";
}

/** Detect whether an LLM error response indicates context-window overflow. */
function isContextOverflowError(status: number, responseText: string): boolean {
  if (status !== 400 && status !== 413) return false;
  const lower = responseText.toLowerCase();
  return lower.includes("context length") ||
    lower.includes("context_length") ||
    lower.includes("maximum context") ||
    lower.includes("max context") ||
    lower.includes("too long") ||
    lower.includes("too many tokens") ||
    lower.includes("prompt is too long") ||
    lower.includes("context window") ||
    lower.includes("maximum number of tokens") ||
    lower.includes("input is too long");
}

/** Priority levels for queued tool calls */
export enum ToolCallPriority {
  /** Run before anything else (e.g. abort-checks, validation) */
  Critical = 0,
  /** Normal tool calls from the LLM */
  Normal = 1,
  /** Deferred / low-priority background work */
  Low = 2,
}

/** A queued tool call entry */
export interface QueuedToolCall {
  toolCall: OpenAIToolCall;
  priority: ToolCallPriority;
  /** If true, this call can run in parallel with other parallel-safe calls */
  parallelSafe: boolean;
}

/** Options for the agent loop */
export interface AgentLoopOptions {
  /** LLM connection settings */
  llm: LLMConfig;
  /** The conversation history (mutated in place) */
  history: AgentMessage[];
  /** OpenAI tool schemas to send to the model */
  toolSchemas: OpenAIToolSchema[];
  /** Whether tools are available */
  hasTools: boolean;
  /** Session identifier (for logging / events) */
  sessionId: string;
  /** Auth context for tool execution */
  auth?: { userId?: string; apiKeys?: Record<string, string>; providerId?: string; model?: string; jaitBackend?: string; runtimeMode?: string; reasoningEffort?: string | null };
  /** Abort controller — abort to cancel the loop */
  abort: AbortController;
  /**
   * Round budget for bounded runs, or checkpoint interval for continuous runs.
   * Omitted and `0` use the default 64-round checkpoint interval.
   */
  maxRounds?: number;
  /**
   * Keep the turn alive across round-budget boundaries. Continuous runs compact
   * context and inject an internal reassessment checkpoint instead of returning
   * `hitMaxRounds`.
   */
  continuous?: boolean;
  /** Max retries per individual tool call failure (0 = no retry) */
  maxRetries?: number;
  /** Enable parallel execution of independent tool calls */
  parallel?: boolean;
  /** Tool registry for input validation (optional — skips validation if absent) */
  toolRegistry?: ToolRegistry;
  /** Optional filter: only allow these tool names (for sub-agents) */
  allowedTools?: Set<string>;
  /** User-disabled tools (never sent to LLM, never executed) */
  disabledTools?: Set<string>;
  /** Chat mode: ask (read-only), agent (full), swarm (specialist delegation), or plan (propose then execute) */
  mode?: ChatMode;
  /** Logger (defaults to console) */
  log?: Logger;
  /** Event callback — called for every stream event */
  onEvent?: (event: AgentLoopEvent) => void;
  /** Called immediately before each outbound LLM request. */
  onContext?: (round: LlmContextFlowRound) => void;
  /** Persistence callback — called when a final assistant message should be saved */
  onPersist?: (sessionId: string, role: string, content: string, toolCalls?: string, segments?: string, thinking?: string) => void;
}

export interface AgentLoopResult {
  content: string;
  executedToolCalls: ExecutedToolCall[];
  /** Interleaved text/toolGroup segments for rendering */
  segments: MessageSegment[];
  /** Total LLM rounds used */
  rounds: number;
  /** Whether the loop was stopped by abort */
  aborted: boolean;
  /** Whether the loop was stopped because it hit the max rounds limit */
  hitMaxRounds: boolean;
  /**
   * Whether the assistant message for this turn was already persisted via the
   * `onPersist` callback. Callers that have their own fallback persistence
   * should check this to avoid writing a duplicate row.
   */
  persisted: boolean;
  /** Plan data — only populated in plan mode */
  plan?: {
    id: string;
    summary: string;
    actions: PlannedAction[];
  };
}

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string | unknown, ...args: unknown[]): void;
}

// ── Steering controller ──────────────────────────────────────────────

/**
 * Steering lets the user (or system) inject guidance into the agent
 * loop while it's running. The steered message gets appended to the
 * conversation as a system message before the next LLM call.
 */
export class SteeringController {
  private queue: string[] = [];

  /** Inject a steering message into the loop */
  steer(message: string): void {
    this.queue.push(message);
  }

  /** Drain all pending steering messages (called by the loop) */
  drain(): string[] {
    const msgs = this.queue.splice(0);
    return msgs;
  }

  get hasPending(): boolean {
    return this.queue.length > 0;
  }
}

// ── Tool call queue ──────────────────────────────────────────────────

/**
 * Priority queue for tool calls. Sorts by priority (lower = first),
 * then partitions into parallel-safe batches.
 */
export class ToolCallQueue {
  private items: QueuedToolCall[] = [];

  /** Enqueue a tool call with optional priority and parallelism hint */
  enqueue(
    toolCall: OpenAIToolCall,
    priority = ToolCallPriority.Normal,
    parallelSafe = false,
  ): void {
    this.items.push({ toolCall, priority, parallelSafe });
    // Keep sorted by priority
    this.items.sort((a, b) => a.priority - b.priority);
  }

  /** Enqueue multiple tool calls at the same priority */
  enqueueAll(
    toolCalls: OpenAIToolCall[],
    priority = ToolCallPriority.Normal,
    parallelSafe = false,
  ): void {
    for (const tc of toolCalls) {
      this.enqueue(tc, priority, parallelSafe);
    }
  }

  /**
   * Dequeue the next batch. If parallel execution is enabled, returns all
   * contiguous independent (non-sequential) items at the same priority level
   * as a single batch, so they run concurrently. Otherwise (or when the head
   * is a sequential tool) returns one at a time.
   */
  dequeueBatch(allowParallel: boolean): QueuedToolCall[] {
    if (this.items.length === 0) return [];

    if (!allowParallel) {
      return [this.items.shift()!];
    }

    const first = this.items[0]!;
    if (!first.parallelSafe) {
      return [this.items.shift()!];
    }

    let contiguousParallelSafeCount = 0;
    while (
      contiguousParallelSafeCount < this.items.length &&
      this.items[contiguousParallelSafeCount]!.priority === first.priority &&
      this.items[contiguousParallelSafeCount]!.parallelSafe
    ) {
      contiguousParallelSafeCount++;
    }

    const batch: QueuedToolCall[] = [];
    for (let i = 0; i < contiguousParallelSafeCount; i++) {
      batch.push(this.items.shift()!);
    }
    return batch;
  }

  get length(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// ── Tool name conversion ─────────────────────────────────────────────

/** OpenAI requires function names to match ^[a-zA-Z0-9_-]+$ — no dots */
export function toOpenAIName(name: string): string {
  return name.replace(/\./g, "_");
}

export function fromOpenAIName(name: string): string {
  if (name === "browser_sandbox_start") return "browser.sandbox.start";
  if (name === "windows_sandbox_start") return "windows.sandbox.start";
  if (name === "windows_sandbox_stop") return "windows.sandbox.stop";
  if (name === "linux_desktop_sandbox_start") return "linux.desktop.sandbox.start";
  if (name === "linux_desktop_sandbox_stop") return "linux.desktop.sandbox.stop";
  if (name === "ssh_session_start") return "ssh.session.start";
  if (name === "ssh_session_run") return "ssh.session.run";
  if (name === "ssh_session_close") return "ssh.session.close";
  const idx = name.indexOf("_");
  if (idx === -1) return name;
  return name.slice(0, idx) + "." + name.slice(idx + 1);
}

// ── Tools that must run sequentially ─────────────────────────────────

/**
 * Tools that mutate shared state or depend on execution ordering and must
 * therefore run one-at-a-time. Every other tool is treated as independent and
 * runs concurrently with its peers, matching pi / Claude Code behaviour where
 * read-only and independent calls batch together in a single round.
 *
 * Names use the canonical internal form (dotted, or underscore for legacy
 * aliases) which is what `isParallelSafe` receives after `fromOpenAIName`.
 */
const SEQUENTIAL_TOOLS = new Set([
  // Shell / terminal — stateful, side-effect heavy
  "execute",
  "terminal.run",
  "terminal.exec",
  "terminal.stream",
  "jait.terminal",
  "elevated.run",
  "os.install",
  "os.tool",
  // File mutations — ordering matters
  "file.write",
  "file.patch",
  "edit",
  // Service / project / surface state changes
  "gateway.redeploy",
  "project.create",
  "project.move",
  "project.assign_repository",
  "surfaces.start",
  "surfaces.stop",
  "screen.share",
  "screen.capture",
  "screen.record",
  "browser.navigate",
  "browser.sandbox.start",
  "windows.sandbox.start",
  "windows.sandbox.stop",
  "linux.desktop.sandbox.start",
  "linux.desktop.sandbox.stop",
  "ssh.run",
  "ssh.session.start",
  "ssh.session.run",
  "ssh.session.close",
  "cron.add",
  "cron.remove",
  "cron.update",
  "skills.manage",
  "extensions.manage",
  "homeassistant.call_service",
  "email.send",
  "email.delete",
  "email.tag",
  "memory.save",
  "memory.update",
  "memory.forget",
  "todo",
  "jait.todos",
  "voice.speak",
  "maintenance.run",
  "preview.open",
  "preview.restart",
  "preview.stop",
]);

function isParallelSafe(toolName: string): boolean {
  return !SEQUENTIAL_TOOLS.has(toolName);
}

// ── Serialize messages for OpenAI API ────────────────────────────────

function syntheticMissingToolResult(toolCall: OpenAIToolCall): AgentMessage {
  return {
    role: "tool",
    content: JSON.stringify({
      ok: false,
      message: "Tool call did not complete before the next turn. Continue from the available context.",
    }),
    tool_call_id: toolCall.id,
    name: toolCall.function.name,
  };
}

export function repairToolCallHistory(messages: AgentMessage[]): void {
  const repaired: AgentMessage[] = [];
  let pendingToolCalls: OpenAIToolCall[] = [];

  const flushMissingToolResults = () => {
    for (const toolCall of pendingToolCalls) {
      repaired.push(syntheticMissingToolResult(toolCall));
    }
    pendingToolCalls = [];
  };

  for (const message of messages) {
    if (message.role === "tool") {
      const toolCallId = message.tool_call_id;
      const pendingIndex = pendingToolCalls.findIndex((toolCall) => toolCall.id === toolCallId);
      if (pendingIndex === -1) {
        continue;
      }
      repaired.push(message);
      pendingToolCalls.splice(pendingIndex, 1);
      continue;
    }

    if (pendingToolCalls.length > 0) {
      flushMissingToolResults();
    }

    repaired.push(message);
    pendingToolCalls = message.role === "assistant" && message.tool_calls?.length
      ? [...message.tool_calls]
      : [];
  }

  if (pendingToolCalls.length > 0) {
    flushMissingToolResults();
  }

  messages.splice(0, messages.length, ...repaired);
}

export function serializeMessages(messages: AgentMessage[]) {
  return messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.tool_calls) msg.tool_calls = m.tool_calls;
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.name) msg.name = m.name;
    if (m.thinking) msg.thinking = m.thinking;
    return msg;
  });
}

/**
 * Serialize messages for ollama's native /api/chat endpoint.
 *
 * Ollama's native format differs from OpenAI in two ways that the /v1
 * compat layer hides (and that the live endpoint rejects with HTTP 400):
 *  - assistant tool_calls carry NO `id`/`type`, and `arguments` must be a
 *    parsed object, not a JSON string.
 *  - tool result messages use `tool_name` (not `tool_call_id` + `name`).
 */
export function serializeMessagesForOllama(messages: AgentMessage[]) {
  return messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.tool_calls) {
      msg.tool_calls = m.tool_calls.map((tc) => {
        let args: unknown = tc.function.arguments;
        if (typeof args === "string") {
          try { args = JSON.parse(args); } catch { args = {}; }
        }
        return { function: { name: tc.function.name, arguments: args } };
      });
    }
    if (m.role === "tool" && m.name) {
      msg.tool_name = m.name;
    }
    // Ollama's native /api/chat format supports message.thinking.
    if (m.thinking) msg.thinking = m.thinking;
    return msg;
  });
}

// ── Runaway repetition guard ─────────────────────────────────────────
// A model can fall into a degenerate loop and emit the same sentence or
// paragraph over and over until it exhausts the output budget. Nothing
// upstream stops that: the answer streams out as a wall of duplicated text,
// and the truncation recovery further down then *resumes* the loop for
// another few thousand tokens. These helpers spot the pattern mid-stream so
// the turn can be cut short instead.

/** Don't judge anything shorter than this — short answers repeat legitimately. */
const MIN_REPETITION_SCAN_CHARS = 600;
/** Minimum verbatim back-to-back copies of a unit before it counts as a loop. */
const MIN_REPETITION_COPIES = 8;
/** …and those copies must also span at least this many characters in total. */
const MIN_REPETITION_SPAN_CHARS = 600;
/** Only the trailing window is inspected, so the scan cost stays bounded. */
const REPETITION_SCAN_WINDOW_CHARS = 16_000;
/** Tail slice used to locate the previous occurrence of the repeating unit. */
const REPETITION_PROBE_CHARS = 48;
/** Re-run the scan at most once per this many newly streamed characters. */
const REPETITION_CHECK_INTERVAL_CHARS = 256;

interface DegenerateRepetition {
  /** The repeating unit. */
  unit: string;
  /** How many consecutive verbatim copies of it end the text. */
  copies: number;
  /** Index in the text where the repeated run starts. */
  startIndex: number;
}

/**
 * Detect that `text` ends in a runaway verbatim repetition.
 *
 * The period is found by locating the previous occurrence of the final
 * {@link REPETITION_PROBE_CHARS} characters, then verifying the tail really is
 * periodic at that distance. Requiring both a copy count *and* a total span
 * keeps ordinary repetition (a bulleted list, a repeated table cell, "ha ha
 * ha") under the threshold while still catching loops that run for thousands
 * of tokens.
 */
function findDegenerateRepetition(text: string): DegenerateRepetition | null {
  if (text.length < MIN_REPETITION_SCAN_CHARS) return null;
  const window = text.length > REPETITION_SCAN_WINDOW_CHARS
    ? text.slice(-REPETITION_SCAN_WINDOW_CHARS)
    : text;
  if (window.length <= REPETITION_PROBE_CHARS) return null;

  const probeStart = window.length - REPETITION_PROBE_CHARS;
  const previous = window.lastIndexOf(window.slice(probeStart), probeStart - 1);
  if (previous < 0) return null;

  const period = probeStart - previous;
  const requiredCopies = Math.max(
    MIN_REPETITION_COPIES,
    Math.ceil(MIN_REPETITION_SPAN_CHARS / period),
  );
  const span = period * requiredCopies;
  if (window.length < span) return null;

  const unit = window.slice(window.length - span, window.length - span + period);
  for (let offset = window.length - span + period; offset < window.length; offset += period) {
    if (window.slice(offset, offset + period) !== unit) return null;
  }

  // Walk back through the full text (not just the window) so callers can trim
  // the entire repeated run, however long it has been going.
  let startIndex = text.length - span;
  while (startIndex - period >= 0 && text.slice(startIndex - period, startIndex) === unit) {
    startIndex -= period;
  }
  return { unit, copies: (text.length - startIndex) / period, startIndex };
}

/**
 * Collapse a runaway repetition to two copies. Used for the history entry so a
 * later round (or a resumed session) doesn't re-read the wall of text and
 * pattern-match its way straight back into the same loop.
 */
function trimDegenerateRepetition(text: string): string {
  const repetition = findDegenerateRepetition(text);
  if (!repetition) return text;
  return text.slice(0, repetition.startIndex)
    + repetition.unit.repeat(2)
    + `\n[… ${repetition.copies - 2} further identical repetitions removed …]`;
}

/** Tag a guard hit with the stream it came from, or drop it when there was none. */
function markRepetition(
  repetition: DegenerateRepetition | null,
  source: "content" | "thinking",
): (DegenerateRepetition & { source: "content" | "thinking" }) | undefined {
  return repetition ? { ...repetition, source } : undefined;
}

/** Stateful, throttled {@link findDegenerateRepetition} for use while streaming. */
function createRepetitionGuard(): (text: string) => DegenerateRepetition | null {
  let scannedLength = 0;
  let observedLength = 0;
  return (text) => {
    const previousLength = observedLength;
    observedLength = text.length;

    // Repeated prose usually forms complete lines. Check every newly crossed
    // line boundary so a short exact run cannot start and end entirely between
    // the throttled full-text scans below.
    let lineBreakIndex = text.indexOf("\n", previousLength);
    while (lineBreakIndex >= 0) {
      const candidateEnd = lineBreakIndex + 1;
      if (candidateEnd >= MIN_REPETITION_SCAN_CHARS) {
        const repetition = findDegenerateRepetition(text.slice(0, candidateEnd));
        if (repetition) return repetition;
      }
      lineBreakIndex = text.indexOf("\n", candidateEnd);
    }

    if (text.length - scannedLength < REPETITION_CHECK_INTERVAL_CHARS) return null;
    scannedLength = text.length;
    return findDegenerateRepetition(text);
  };
}

/**
 * Parse ollama's native /api/chat NDJSON stream into the same shape as
 * {@link parseOpenAIStream}, so the agent loop is endpoint-agnostic.
 */
export async function parseOllamaStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent?: (event: AgentLoopEvent) => void,
  signal?: AbortSignal,
): Promise<ParsedStream> {
  const decoder = new TextDecoder();
  let buffer = "";
  let contentText = "";
  let thinkingText = "";
  let finishReason: string | null = null;
  let usage: ParsedStream["usage"] | undefined;
  let sawDone = false;
  let interrupted = false;
  let repetition: ParsedStream["repetition"];
  const toolCalls: OpenAIToolCall[] = [];
  const extractThinking = createThinkingExtractor();
  const contentRepetitionGuard = createRepetitionGuard();
  const thinkingRepetitionGuard = createRepetitionGuard();

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let chunk: any;
    try {
      chunk = JSON.parse(trimmed);
    } catch {
      throw new Error("Ollama returned malformed stream data");
    }
    if (chunk.error) {
      const detail = typeof chunk.error === "string"
        ? chunk.error
        : JSON.stringify(chunk.error);
      throw new Error(`Ollama stream error: ${detail}`);
    }

    const message = chunk.message;
    if (message) {
      const thinking = message.thinking;
      if (thinking) {
        thinkingText += thinking;
        onEvent?.({ type: "thinking", content: thinking });
        repetition ??= markRepetition(thinkingRepetitionGuard(thinkingText), "thinking");
      }
      if (message.content) {
        const { cleanDelta, thinkingDelta } = extractThinking(message.content);
        if (cleanDelta) {
          contentText += cleanDelta;
          onEvent?.({ type: "token", content: cleanDelta });
          repetition ??= markRepetition(contentRepetitionGuard(contentText), "content");
        }
        if (thinkingDelta) {
          thinkingText += thinkingDelta;
          onEvent?.({ type: "thinking", content: thinkingDelta });
          repetition ??= markRepetition(thinkingRepetitionGuard(thinkingText), "thinking");
        }
      }
      if (Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
          const name: string = tc.function?.name ?? "";
          const rawArgs = tc.function?.arguments;
          const argStr = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {});
          const id = tc.id || `ollama-${toolCalls.length}-${Date.now()}`;
          const idx = toolCalls.length;
          toolCalls.push({ id, type: "function", function: { name, arguments: argStr } });
          onEvent?.({ type: "tool_call_delta", call_id: id, index: idx, name_delta: name, args_delta: argStr });
        }
      }
    }

    if (chunk.done) {
      sawDone = true;
      finishReason = chunk.done_reason ?? "stop";
      const pe = chunk.prompt_eval_count;
      const ec = chunk.eval_count;
      if (typeof pe === "number" && typeof ec === "number") {
        usage = { prompt_tokens: pe, completion_tokens: ec, total_tokens: pe + ec };
      }
    }
  };

  while (true) {
    if (signal?.aborted) {
      interrupted = true;
      break;
    }
    let readResult: { done: boolean; value?: Uint8Array };
    try {
      readResult = await reader.read();
    } catch (error) {
      if (signal?.aborted) {
        interrupted = true;
        break;
      }
      throw error;
    }
    const { done, value } = readResult;
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) processLine(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) processLine(line);
    if (repetition) break;
  }

  if (repetition) {
    finishReason = "repetition";
    await reader.cancel().catch(() => {});
  } else if (!sawDone && !interrupted) {
    throw new Error("Ollama stream ended before its terminal done chunk");
  }

  // Ollama reports done_reason "stop" even when emitting tool calls; normalize
  // to the OpenAI convention the loop expects.
  if (toolCalls.length > 0 && finishReason === "stop") finishReason = "tool_calls";

  return { contentText, thinkingText, toolCalls, finishReason, usage, interrupted, repetition };
}

// ── Build OpenAI tool schemas ────────────────────────────────────────

export function buildToolSchemas(
  registry: ToolRegistry,
  allowedTools?: Set<string>,
): OpenAIToolSchema[] {
  let tools = registry.list();
  if (allowedTools) {
    tools = tools.filter((t) => allowedTools.has(t.name));
  }
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: toOpenAIName(t.name),
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Build schemas respecting tiers and user disabled tools.
 *
 * Only core tools are included in the initial payload. Standard and
 * external / MCP tools must be discovered via tools.search.
 */
export function buildTieredToolSchemas(
  registry: ToolRegistry,
  disabledTools?: Set<string>,
  options?: {
    ollamaEssentials?: boolean;
    query?: string;
    activatedToolNames?: Iterable<string>;
    selectionLimit?: number;
  },
): OpenAIToolSchema[] {
  let tools = registry.listForLLM(disabledTools);
  if (options?.ollamaEssentials) {
    // Keep the compact core set for local models, then add only the small
    // request-relevant selection below.
    tools = tools.filter((tool) => (tool.tier ?? "standard") === "core");
  }

  const includedNames = new Set(tools.map((tool) => tool.name));
  const includeTool = (tool: ToolDefinition | undefined) => {
    if (!tool || includedNames.has(tool.name) || disabledTools?.has(tool.name)) return;
    tools.push(tool);
    includedNames.add(tool.name);
  };

  for (const name of options?.activatedToolNames ?? []) includeTool(registry.get(name));
  if (options?.query?.trim()) {
    const selectionLimit = options.selectionLimit ?? (options.ollamaEssentials ? 5 : 10);
    for (const tool of registry.selectForLLM(options.query, disabledTools, selectionLimit)) includeTool(tool);
  }

  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: toOpenAIName(t.name),
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Convert individual tool definitions into OpenAI schemas.
 * Used to dynamically inject schemas discovered via tools.search.
 */
export function toolDefsToSchemas(defs: Array<{ name: string; description: string; parameters: unknown }>): OpenAIToolSchema[] {
  return defs.map((t) => ({
    type: "function" as const,
    function: {
      name: toOpenAIName(t.name),
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ── Inline-thinking extraction helper ────────────────────────────────

/**
 * Extract `<thinking>...</thinking>` / `<think>...</think>` / `<reasoning>...</reasoning>` blocks from a
 * raw content stream. Reasoning is returned in `thinking`, visible text in
 * `clean`, and any trailing fragment that might be an incomplete tag is kept
 * as `leftover` to be reprocessed once more data arrives.
 *
 * Only *leading* reasoning blocks are extracted. Once ordinary content begins,
 * any later `<thinking>` / `</think>` / `<reasoning>` tags are treated as visible content so code
 * discussions that mention XML/HTML tags are not accidentally stripped.
 */
function extractInlineThinkingBlocks(raw: string): { clean: string; thinking: string; leftover: string } {
  const OPEN_RE = /^(<(thinking|think|reasoning)>)/i;
  let clean = "";
  let thinking = "";
  let leftover = raw;

  const findMatchingClose = (text: string, tag: string): number => {
    const re = new RegExp(`</${tag}>`, "i");
    const match = text.match(re);
    return match ? match.index! : -1;
  };

  // Extract only *leading* thinking blocks. Once we see ordinary content we
  // stay in clean mode so mid-answer XML/HTML snippets are not stripped.
  while (leftover.length > 0) {
    const openMatch = leftover.match(OPEN_RE);
    if (!openMatch) break;

    const tag = openMatch[2]!;
    const closeIdx = findMatchingClose(leftover, tag);
    if (closeIdx === -1) break; // incomplete leading block — wait for more data

    thinking += leftover.slice(openMatch[0].length, closeIdx);
    leftover = leftover.slice(closeIdx + `</${tag}>`.length);
  }

  // Everything after the leading reasoning is clean content, but hold back a
  // trailing '<...' fragment that may be the start of an incomplete tag.
  if (leftover.length > 0) {
    const lastLt = leftover.lastIndexOf("<");
    if (lastLt !== -1 && leftover.indexOf(">", lastLt) === -1) {
      clean += leftover.slice(0, lastLt);
      leftover = leftover.slice(lastLt);
    } else {
      clean += leftover;
      leftover = "";
    }
  }

  return { clean, thinking, leftover };
}

/**
 * Stateful extractor used by the stream parsers. It buffers raw content,
 * extracts any leading reasoning envelopes, and returns only the *new*
 * clean / thinking deltas so the parser can emit the right events.
 */
function createThinkingExtractor() {
  let rawBuffer = "";
  let cleanCommitted = "";
  let thinkingCommitted = "";

  return (chunk: string): { cleanDelta: string; thinkingDelta: string } => {
    rawBuffer += chunk;
    const { clean, thinking, leftover } = extractInlineThinkingBlocks(rawBuffer);

    const cleanDelta = clean.slice(cleanCommitted.length);
    const thinkingDelta = thinking.slice(thinkingCommitted.length);

    cleanCommitted = clean;
    thinkingCommitted = thinking;
    // Keep committed clean text plus any unprocessed fragment so the next
    // chunk can extend an incomplete tag without losing already-emitted text.
    rawBuffer = cleanCommitted + leftover;

    return { cleanDelta, thinkingDelta };
  };
}

// ── OpenAI SSE stream parser ─────────────────────────────────────────

interface ParsedStream {
  contentText: string;
  thinkingText: string;
  toolCalls: OpenAIToolCall[];
  finishReason: string | null;
  interrupted?: boolean;
  /** Token usage reported by the provider (from the final chunk). */
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  /**
   * Set when the stream was cut short because the model started repeating
   * itself verbatim. `finishReason` is "repetition" in that case.
   */
  repetition?: DegenerateRepetition & { source: "content" | "thinking" };
}

export async function parseOpenAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent?: (event: AgentLoopEvent) => void,
  signal?: AbortSignal,
): Promise<ParsedStream> {
  const decoder = new TextDecoder();
  let buffer = "";
  let contentText = "";
  let thinkingText = "";
  let finishReason: string | null = null;
  let usage: ParsedStream["usage"] | undefined;
  let interrupted = false;
  let repetition: ParsedStream["repetition"];
  const extractThinking = createThinkingExtractor();
  const contentRepetitionGuard = createRepetitionGuard();
  const thinkingRepetitionGuard = createRepetitionGuard();

  const toolCallMap = new Map<
    number,
    { id: string; type: "function"; function: { name: string; arguments: string } }
  >();
  // Slot resolution for streamed tool-call deltas. `index` is the OpenAI way to
  // say which call a fragment belongs to, but plenty of OpenAI-*compatible*
  // backends omit it. Defaulting those to slot 0 collapsed every call of the
  // round into one entry and appended their names together, producing a single
  // garbage identifier ("searchweb_fetchfile_read") with unparseable arguments.
  // Tool-call ids are unique per call, so prefer them and fall back to index.
  const slotByToolCallId = new Map<string, number>();
  let lastToolCallSlot = 0;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trimStart();
    if (payload === "[DONE]") return;

    try {
      const chunk = JSON.parse(payload);
      if (chunk.error) {
        const detail = typeof chunk.error === "string"
          ? chunk.error
          : chunk.error.message ?? JSON.stringify(chunk.error);
        throw new Error(`Provider stream error: ${detail}`);
      }
      const choice = chunk.choices?.[0];
      if (!choice) return;

      const delta = choice.delta;
      if (!delta) return;

      // Reasoning / thinking tokens (e.g. Gemma 4, DeepSeek R1 via Ollama)
      const reasoningToken = delta.reasoning ?? delta.reasoning_content;
      if (reasoningToken) {
        thinkingText += reasoningToken;
        onEvent?.({ type: "thinking", content: reasoningToken });
        repetition ??= markRepetition(thinkingRepetitionGuard(thinkingText), "thinking");
      }

      // Text content — strip any inline <thinking> envelope the model emitted
      if (delta.content) {
        const { cleanDelta, thinkingDelta } = extractThinking(delta.content);
        if (cleanDelta) {
          contentText += cleanDelta;
          onEvent?.({ type: "token", content: cleanDelta });
          repetition ??= markRepetition(contentRepetitionGuard(contentText), "content");
        }
        if (thinkingDelta) {
          thinkingText += thinkingDelta;
          onEvent?.({ type: "thinking", content: thinkingDelta });
          repetition ??= markRepetition(thinkingRepetitionGuard(thinkingText), "thinking");
        }
      }

      // Tool calls (streamed incrementally)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          let idx: number;
          if (tc.id && slotByToolCallId.has(tc.id)) {
            // Continuation of a call we've already seen.
            idx = slotByToolCallId.get(tc.id)!;
          } else if (tc.id) {
            // First fragment of a new call. Honour the provider's index when it
            // gave one and it isn't already taken; otherwise append a new slot.
            idx = typeof tc.index === "number" && !toolCallMap.has(tc.index)
              ? tc.index
              : toolCallMap.size;
            slotByToolCallId.set(tc.id, idx);
          } else {
            // Fragment with no id — belongs to the indexed call, or to whichever
            // call we were last building if the provider omits index too.
            idx = typeof tc.index === "number" ? tc.index : lastToolCallSlot;
          }
          lastToolCallSlot = idx;
          const isNew = !toolCallMap.has(idx);
          if (isNew) {
            toolCallMap.set(idx, {
              id: tc.id ?? "",
              type: "function",
              function: { name: tc.function?.name ?? "", arguments: "" },
            });
          }
          const existing = toolCallMap.get(idx)!;
          if (tc.id) existing.id = tc.id;
          if (!isNew && tc.function?.name) existing.function.name += tc.function.name;
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;

          const callId = existing.id || `pending-${idx}`;
          onEvent?.({
            type: "tool_call_delta",
            call_id: callId,
            index: idx,
            name_delta: tc.function?.name || undefined,
            args_delta: tc.function?.arguments || undefined,
          });
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      // Usage stats (sent in the final chunk by OpenAI-compatible APIs)
      if (chunk.usage && typeof chunk.usage === "object") {
        const u = chunk.usage;
        if (typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number") {
          usage = {
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            total_tokens: u.total_tokens ?? (u.prompt_tokens + u.completion_tokens),
          };
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Provider returned malformed SSE data");
      }
      throw error;
    }
  };

  while (true) {
    if (signal?.aborted) {
      interrupted = true;
      break;
    }
    let readResult: { done: boolean; value?: Uint8Array };
    try {
      readResult = await reader.read();
    } catch (error) {
      if (signal?.aborted) {
        interrupted = true;
        break;
      }
      throw error;
    }
    const { done, value } = readResult;
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) {
        processLine(buffer);
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      processLine(line);
    }
    if (repetition) break;
  }

  if (repetition) {
    finishReason = "repetition";
    await reader.cancel().catch(() => {});
  }

  const toolCalls = [...toolCallMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => tc);

  return { contentText, thinkingText, toolCalls, finishReason, usage, interrupted, repetition };
}

// ── Execute a single tool call with validation + retry ───────────────

interface ExecuteOneOptions {
  tc: OpenAIToolCall;
  sessionId: string;
  auth?: { userId?: string; apiKeys?: Record<string, string>; providerId?: string; model?: string; jaitBackend?: string; runtimeMode?: string };
  signal?: AbortSignal;
  toolRegistry?: ToolRegistry;
  maxRetries: number;
  onEvent?: (event: AgentLoopEvent) => void;
  executeTool: ToolExecutor;
  /** When set, this call is one of several agent-spawn calls in the same parallel batch. */
  swarmRoundId?: string;
}

async function executeOneToolCall(opts: ExecuteOneOptions): Promise<{
  result: ToolResult;
  executed: ExecutedToolCall;
  historyEntry: AgentMessage;
}> {
  const { tc, sessionId, auth, signal, toolRegistry, maxRetries, onEvent, executeTool, swarmRoundId } = opts;

  const startedAt = Date.now();
  let args: unknown;
  try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

  const internalName = fromOpenAIName(tc.function.name);

  // Thread the shared swarm mailbox down to agent.spawn's own execute() via a
  // hidden arg — cheaper than widening ToolExecutor's signature across every
  // call site. Extra properties are ignored by validateToolInput below.
  if (swarmRoundId && isAgentSpawnToolName(internalName) && args && typeof args === "object" && !Array.isArray(args)) {
    args = { ...args, __swarmRoundId: swarmRoundId };
  }

  // ── Input validation (fast reject bad LLM args) ──
  if (toolRegistry) {
    const toolDef = toolRegistry.get(internalName);
    if (toolDef) {
      const validation = validateToolInput(toolDef.parameters, args);
      if (!validation.valid) {
        onEvent?.({
          type: "tool_validation_error",
          call_id: tc.id,
          tool: internalName,
          errors: validation.errors,
        });
        // Return the validation error as a tool result so the LLM can self-correct
        const errorMsg = `INPUT VALIDATION ERROR: ${validation.errors.join("; ")}`;
        const result: ToolResult = { ok: false, message: errorMsg };
        return {
          result,
          executed: {
            callId: tc.id,
            tool: internalName,
            args,
            ok: false,
            message: errorMsg,
            startedAt,
            completedAt: Date.now(),
            retryCount: 0,
          },
          historyEntry: {
            role: "tool",
            content: JSON.stringify({ ok: false, message: errorMsg }),
            tool_call_id: tc.id,
            name: tc.function.name,
          },
        };
      }
    }
  }

  // ── Execute with retries ──
  onEvent?.({ type: "tool_start", tool: internalName, args, call_id: tc.id });

  let result: ToolResult = { ok: false, message: "Not executed" };
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      result = { ok: false, message: "Cancelled" };
      break;
    }

    if (attempt > 0) {
      onEvent?.({ type: "tool_retry", call_id: tc.id, attempt, maxAttempts: maxRetries });
      // Exponential backoff: 500ms, 1s, 2s — abortable, so cancelling a turn
      // doesn't have to wait out the full backoff of every in-flight retry.
      await sleepUntilAborted(Math.min(500 * 2 ** (attempt - 1), 4000), signal);
      if (signal?.aborted) {
        result = { ok: false, message: "Cancelled" };
        break;
      }
    }

    try {
      result = normalizeToolResult(await executeTool(internalName, args, sessionId, auth, (chunk) => {
        onEvent?.({ type: "tool_output", call_id: tc.id, content: chunk });
      }, signal, (nested) => {
        // Sub-agent work surfaces as real events on this turn's stream. The tool
        // doesn't know its own call id, so stamp it here: its own text/thinking
        // belongs to this call, and the tool calls it makes hang under it.
        if (nested.type === "tool_output") {
          onEvent?.({ ...nested, call_id: nested.call_id || tc.id });
        } else {
          onEvent?.({ ...nested, parent_call_id: nested.parent_call_id ?? tc.id });
        }
      }));
    } catch (error) {
      // A tool that throws instead of returning { ok: false } must never reject
      // this promise. executeOneToolCall runs inside Promise batches, and one
      // rejection there discards every sibling's result — leaving the assistant's
      // tool_calls message with no matching tool messages, which corrupts history
      // and makes the provider reject the next round. Surface the throw to the
      // model as a normal failed result instead, so it can self-correct.
      if (signal?.aborted) {
        result = { ok: false, message: "Cancelled" };
        break;
      }
      result = { ok: false, message: `TOOL ERROR: ${error instanceof Error ? error.message : String(error)}` };
    }

    if (result.ok) break;

    // Only retry transient failures, not logical errors
    if (!isTransientFailure(result.message)) break;
    if (attempt >= maxRetries) break;

    retryCount = attempt + 1;
  }

  const completedAt = Date.now();

  onEvent?.({
    type: "tool_result",
    call_id: tc.id,
    tool: internalName,
    ok: result.ok,
    message: result.message,
    data: result.data,
  });

  // If this was a todo tool call, emit todo_list event for the UI
  if (internalName === "todo" && result.ok && result.data) {
    const items = (result.data as any).items;
    if (Array.isArray(items)) {
      onEvent?.({ type: "todo_list", items });
    }
  }

  // If this was a file-modifying tool, emit file_changed event for cross-client sync
  if (result.ok && (internalName === "file.write" || internalName === "file.patch" || internalName === "edit")) {
    const filePath = String((args as Record<string, unknown>)?.path ?? "");
    if (filePath) {
      onEvent?.({
        type: "file_changed",
        path: filePath,
        name: filePath.split("/").pop() ?? filePath,
      } as any);
    }
  }

  return {
    result,
    executed: {
      callId: tc.id,
      tool: internalName,
      args,
      ok: result.ok,
      message: result.message,
      data: result.data,
      startedAt,
      completedAt,
      retryCount,
    },
    historyEntry: {
      role: "tool",
      content: JSON.stringify({
        ok: result.ok,
        message: result.message.length > TOOL_RESULT_MAX_CHARS
          ? result.message.slice(0, TOOL_RESULT_MAX_CHARS) + `\n\n[truncated — ${result.message.length} chars total, showing first ${TOOL_RESULT_MAX_CHARS}]`
          : result.message,
        data: capToolResultData(result.data),
      }),
      tool_call_id: tc.id,
      name: tc.function.name,
    },
  };
}

/** Sleep that resolves early when `signal` aborts, so cancels aren't held up by backoff. */
function sleepUntilAborted(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

/**
 * Coerces whatever a tool returned into a well-formed ToolResult. Tools are
 * third-party-ish (plugins, MCP servers, remote executors) and can resolve with
 * `undefined`, a bare string, or an object with no `message`. Downstream code
 * reads `result.message.length` and lowercases it, so an unnormalized result
 * turns a tool's sloppy return value into a TypeError that kills the whole turn.
 */
function normalizeToolResult(raw: unknown): ToolResult {
  if (raw && typeof raw === "object") {
    const candidate = raw as Partial<ToolResult>;
    return {
      ...(raw as ToolResult),
      ok: candidate.ok === true,
      message: typeof candidate.message === "string" ? candidate.message : "",
    };
  }
  if (typeof raw === "string") return { ok: true, message: raw };
  return { ok: false, message: "Tool returned no result" };
}

/**
 * How much of a failure message to scan for transient-error markers. Failure
 * messages lead with the error; the tail is often captured stdout/stderr, and
 * scanning all of it (up to TOOL_RESULT_MAX_CHARS) made unrelated output — a
 * failing test run that happens to print "503" or "network" — trigger retries.
 */
const TRANSIENT_SCAN_CHARS = 400;

/**
 * Anchored markers of a genuinely retryable failure. These are word-bounded
 * rather than bare substrings: `includes("429")` also matched "1429 bytes",
 * and `includes("network")` matched any prose mentioning networks.
 */
const TRANSIENT_FAILURE_PATTERNS: RegExp[] = [
  /\btimed?\s?out\b/,
  /\btimeout\b/,
  /\be(?:conn(?:refused|reset|aborted)|timedout|hostunreach|ai_again|pipe)\b/,
  /socket hang up/,
  /\brate[ _-]?limit(?:ed|ing)?\b/,
  /\btoo many requests\b/,
  /\b(?:429|502|503|504)\b/,
  /\bnetwork\b(?=.{0,40}\b(?:error|failure|failed|unreachable|down|timeout|issue)\b)/,
  /\b(?:service|server|host|endpoint|model|resource)s?\s+(?:is\s+|are\s+|currently\s+|temporarily\s+)*unavailable\b/,
  /\b(?:temporarily|currently)\s+unavailable\b/,
  /\bbad gateway\b/,
  /\bgateway time-?out\b/,
  /\boverloaded\b/,
];

/** Heuristic: is this error transient and worth retrying? */
function isTransientFailure(message: string | undefined): boolean {
  if (!message) return false;
  const head = message.slice(0, TRANSIENT_SCAN_CHARS).toLowerCase();
  return TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(head));
}

/**
 * Last-resort record for a tool call whose execution rejected outright. Keeps the
 * one-tool-message-per-tool_call invariant intact so the conversation stays valid.
 */
function failedToolCallOutcome(
  tc: OpenAIToolCall,
  reason: unknown,
): { executed: ExecutedToolCall; historyEntry: AgentMessage } {
  let args: unknown;
  try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
  const message = `TOOL ERROR: ${reason instanceof Error ? reason.message : String(reason)}`;
  const now = Date.now();
  return {
    executed: {
      callId: tc.id,
      tool: fromOpenAIName(tc.function.name),
      args,
      ok: false,
      message,
      startedAt: now,
      completedAt: now,
      retryCount: 0,
    },
    historyEntry: {
      role: "tool",
      content: JSON.stringify({ ok: false, message }),
      tool_call_id: tc.id,
      name: tc.function.name,
    },
  };
}

export const __testUtils = {
  buildStructuredConversationSummary,
  executeOneToolCall,
  findDegenerateRepetition,
  trimDegenerateRepetition,
  isTransientFailure,
  isSubstantiveUserMessage,
  pruneHistory,
  repairToolCallHistory,
};

// ── Tool executor type ───────────────────────────────────────────────

export type ToolExecutor = (
  name: string,
  args: unknown,
  sessionId: string,
  auth?: { userId?: string; apiKeys?: Record<string, string>; providerId?: string; model?: string; jaitBackend?: string; runtimeMode?: string },
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  /** Lets a tool emit nested tool-call events (sub-agent work) onto this turn's stream. */
  onNestedEvent?: (event: NestedAgentEvent) => void,
) => Promise<ToolResult>;

// ── Main agent loop ──────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 2;
/** Max characters for a single tool result message before truncation (~8k tokens). */
const TOOL_RESULT_MAX_CHARS = 30_000;

/**
 * Caps a tool result's structured `data` payload the same way `message` is capped above.
 * Without this, a single call whose bulk content lives in `data` (e.g. `chat.traces` on a
 * large session, or any tool returning megabytes of structured output) can inject an
 * uncapped multi-megabyte blob straight into the model's conversation history — `message`
 * stays a short summary, so the truncation above never fires. That single oversized entry
 * would otherwise sit in history verbatim until the Codex-style compaction trigger fires,
 * wasting a large share of the window and forcing an early summarization of everything.
 */
function capToolResultData(data: unknown): unknown {
  if (data === undefined || data === null) return data;
  const serialized = JSON.stringify(data);
  if (serialized === undefined || serialized.length <= TOOL_RESULT_MAX_CHARS) return data;
  return {
    truncated: true,
    originalChars: serialized.length,
    preview: serialized.slice(0, TOOL_RESULT_MAX_CHARS),
  };
}
/** Max times we re-prompt when detecting plain-text tool calls in content. */
const MAX_PLAIN_TEXT_RETRIES = 2;
/** Max times we re-prompt when a provider ends a round without text or tool calls. */
const MAX_EMPTY_RESPONSE_RETRIES = 2;
/**
 * Max times a transient LLM transport failure (undici dispatcher timeout,
 * reset socket) is retried within a round without consuming the round budget.
 * A hung request already costs ~5 minutes (undici's default headers timeout),
 * so keep this small: worst case ≈ 3 × 5 min + short backoffs.
 */
const MAX_TRANSPORT_RETRIES = 2;
/** Base backoff between transport retries; scales linearly with the attempt. */
const TRANSPORT_RETRY_BASE_DELAY_MS = 2_000;
/** Max times a malformed repeating generation is discarded and resampled. */
const MAX_REPETITION_RECOVERIES = 3;
/**
 * Max times we auto-continue a response that was cut off by the output token
 * limit (finish_reason="length"). Reasoning models (e.g. gpt-5) can exhaust
 * the completion budget mid-thinking; continuing lets the user receive the
 * full answer instead of a truncated fragment.
 */
const MAX_LENGTH_CONTINUATIONS = 3;
/**
 * Max consecutive rounds the model may emit the exact same tool call (name +
 * args) before we intervene. Nothing upstream stops the model from
 * re-issuing an already-answered call verbatim — this is the actual
 * backstop for that failure mode (e.g. a coordinator re-reading the same
 * file chunk over and over with no new information arriving).
 */
const MAX_DUPLICATE_CALL_STREAK = 3;
/** Max nudges before escalating a duplicate-call loop to one-round tool quarantine. */
const MAX_DUPLICATE_CALL_INTERVENTIONS = 2;
const MAX_SAME_TOOL_CALLS_PER_TURN = 6;
/**
 * Hard lifetime cap on how often one exact call may be issued in a turn.
 *
 * Unlike {@link MAX_SAME_TOOL_CALLS_PER_TURN} this is never reset by an
 * intervention, so it bounds the total even when the model keeps ignoring
 * nudges. Past this point the call is skipped outright rather than nudged.
 */
const MAX_SAME_TOOL_CALLS_PER_TURN_HARD = 10;
/**
 * Identical failures of the same call before it is treated as a loop.
 *
 * Re-running a call that succeeded can be legitimate (state may have changed);
 * re-running one that returns the byte-identical error never is. This catches
 * the loop several rounds earlier than the generic repeat guard, which is what
 * matters when the tool is broken for the whole turn.
 */
const MAX_IDENTICAL_FAILURES_PER_CALL = 2;
const MAX_TOOL_CALLS_PER_ROUND = 64;
const DEFAULT_TOOL_ROUND_CHECKPOINT = 64;
const ABSOLUTE_TOOL_ROUND_BUDGET = 200;

/**
 * Consecutive rounds that replay the exact same reasoning block AND the exact
 * same tool call before the turn is stopped outright.
 *
 * A deterministic provider (Ollama, or a degraded model) can reproduce its
 * previous thinking word-for-word every round while re-issuing the same
 * (usually quarantined) call. Nothing upstream stops that: the per-round
 * repetition guard only sees one copy per stream, `isVerbatimThinkingRepeat`
 * only checks back-to-back thinking segments (tool groups sit between them),
 * and the empty-response recovery never runs because a tool call exists. The
 * duplicate-call guards block the call, but the model keeps replaying the same
 * reasoning and request, so the turn burns its whole round budget and ends in
 * garbage (observed with deepseek-v4-flash:0731-cloud, 2026-08-16).
 */
const MAX_REPLAYED_THINKING_ROUNDS = 3;

/**
 * How many times the cross-round replayed-reasoning guard *steers* the model
 * back on track (injecting a corrective directive) before it falls back to
 * stopping the turn as a hard backstop. Steer-first: a deterministic provider
 * that replays identical reasoning + the same tool call gets a nudge to change
 * approach instead of the turn being killed on the first violation.
 */
const MAX_REPLAY_STEERINGS = 1;

/**
 * Consecutive rounds that only investigate — read-only tools, no plan step
 * completed — before Jait re-anchors the model on the goal, and before it
 * withholds tools for one round so the model has to answer.
 *
 * The duplicate-call and read-coverage guards below only fire when the model
 * repeats itself. The more common "wanders off and never lands" failure never
 * repeats a call: it reads one more file, greps one more term, opens one more
 * directory, forever. Nothing about that is detectable per-call — only the
 * absence of state change across many rounds gives it away.
 */
const CONVERGE_NUDGE_ROUND_STREAK = 12;
const FORCE_ANSWER_ROUND_STREAK = 24;

/**
 * Renders the session's todo list as a compact plan snapshot for re-injection.
 *
 * The `todo` tool records the plan but nothing ever reads it back, so the plan
 * only exists in the tool result that created it — the first thing compaction
 * throws away. Re-injecting the live list keeps the destination in front of the
 * model for the whole turn instead of only just after it wrote the plan.
 */
function renderPlanSnapshot(todos: TodoItem[]): string | null {
  if (todos.length === 0) return null;
  const completed = todos.filter((todo) => todo.status === "completed").length;
  const lines = todos.map((todo) => {
    const marker = todo.status === "completed" ? "x" : todo.status === "in-progress" ? "~" : " ";
    return `[${marker}] ${todo.title}`;
  });
  return `Your current plan (${completed}/${todos.length} done):\n${lines.join("\n")}`;
}

function canonicalizeToolCallValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeToolCallValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, canonicalizeToolCallValue(entryValue)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function toolCallSignature(toolCall: OpenAIToolCall): string {
  let args: unknown = toolCall.function.arguments.trim();
  try {
    args = canonicalizeToolCallValue(JSON.parse(toolCall.function.arguments));
  } catch {
    args = toolCall.function.arguments.trim();
  }
  return JSON.stringify({ name: fromOpenAIName(toolCall.function.name), args });
}

/**
 * Records whether a call succeeded, so identical repeated failures are visible
 * to the duplicate-call guard on the *next* round.
 *
 * The streak only advances while the error text stays the same — a call that
 * starts failing differently is making progress of a sort, and a call that
 * succeeds clears its history entirely.
 */
function recordToolCallOutcome(
  failures: Map<string, { message: string; count: number }>,
  toolCall: OpenAIToolCall,
  executed: { ok: boolean; message?: string },
): void {
  const signature = toolCallSignature(toolCall);
  if (executed.ok) {
    failures.delete(signature);
    return;
  }
  const message = executed.message ?? "";
  const previous = failures.get(signature);
  failures.set(
    signature,
    previous && previous.message === message
      ? { message, count: previous.count + 1 }
      : { message, count: 1 },
  );
}

/** Consecutive near-redundant ranged reads allowed before redirecting the model. */
const MAX_LOW_PROGRESS_READ_STREAK = 8;
/** A ranged read must add this fraction of new lines to count as progress. */
const MIN_READ_PROGRESS_RATIO = 0.25;

interface ReadRange {
  target: string;
  toolName: string;
  startLine: number;
  endLine: number;
}

interface ReadCoverageState {
  intervals: Array<[number, number]>;
  lowProgressStreak: number;
}

function parseReadRange(toolCall: OpenAIToolCall): ReadRange | null {
  const toolName = fromOpenAIName(toolCall.function.name);
  if (toolName !== "read" && !toolName.endsWith(".read")) return null;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    return null;
  }

  const path = typeof args.path === "string" ? args.path.trim() : "";
  const startLine = Number(args.startLine);
  const endLine = Number(args.endLine);
  if (
    !path ||
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  ) {
    return null;
  }

  const normalizedPath = path.replaceAll("\\", "/").replace(/\/+/g, "/");
  return {
    target: `${toolName}:${normalizedPath}`,
    toolName,
    startLine,
    endLine,
  };
}

function coveredLineCount(
  intervals: Array<[number, number]>,
  startLine: number,
  endLine: number,
): number {
  let covered = 0;
  for (const [coveredStart, coveredEnd] of intervals) {
    const overlapStart = Math.max(startLine, coveredStart);
    const overlapEnd = Math.min(endLine, coveredEnd);
    if (overlapStart <= overlapEnd) covered += overlapEnd - overlapStart + 1;
  }
  return covered;
}

function mergeReadInterval(
  intervals: Array<[number, number]>,
  startLine: number,
  endLine: number,
): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  let nextStart = startLine;
  let nextEnd = endLine;
  let inserted = false;

  for (const [coveredStart, coveredEnd] of intervals) {
    if (coveredEnd + 1 < nextStart) {
      merged.push([coveredStart, coveredEnd]);
    } else if (nextEnd + 1 < coveredStart) {
      if (!inserted) {
        merged.push([nextStart, nextEnd]);
        inserted = true;
      }
      merged.push([coveredStart, coveredEnd]);
    } else {
      nextStart = Math.min(nextStart, coveredStart);
      nextEnd = Math.max(nextEnd, coveredEnd);
    }
  }

  if (!inserted) merged.push([nextStart, nextEnd]);
  return merged;
}

function trackReadProgress(
  coverageByTarget: Map<string, ReadCoverageState>,
  toolCall: OpenAIToolCall,
): (ReadRange & { lowProgressStreak: number }) | null {
  const range = parseReadRange(toolCall);
  if (!range) return null;

  const state = coverageByTarget.get(range.target) ?? {
    intervals: [],
    lowProgressStreak: 0,
  };
  const span = range.endLine - range.startLine + 1;
  const newLines = span - coveredLineCount(state.intervals, range.startLine, range.endLine);
  const lowProgress = state.intervals.length > 0 && newLines / span < MIN_READ_PROGRESS_RATIO;
  state.lowProgressStreak = lowProgress ? state.lowProgressStreak + 1 : 0;
  state.intervals = mergeReadInterval(state.intervals, range.startLine, range.endLine);
  coverageByTarget.set(range.target, state);

  return { ...range, lowProgressStreak: state.lowProgressStreak };
}

/**
 * Swarm mode only: max direct read/search-style calls the coordinator may
 * make before it has delegated anything to a specialist, before we force
 * the issue. Swarm's tool allowlist blocks mutating tools but not reads, so
 * without this a coordinator can "stay compliant" while never delegating.
 */
const SWARM_MAX_UNDELEGATED_READS = 6;

/**
 * Cap on how much thinking we persist to history per assistant message. Reasoning
 * models (e.g. deepseek-v4-flash via ollama) can emit very long thinking blocks;
 * persisting them verbatim lets the context grow unboundedly across tool rounds,
 * which keeps triggering compaction and can look like an endless thinking loop.
 * Truncating to the tail keeps recent reasoning continuity while bounding growth.
 */
const MAX_PERSISTED_THINKING_CHARS = 4000;

/**
 * Minimum length before an exact thinking repeat is treated as pathological.
 * Short fragments ("Okay.", "Let me check the file.") can legitimately recur
 * across rounds; a multi-sentence block reproduced word for word cannot.
 */
const MIN_REPEAT_THINKING_CHARS = 80;

/** True when `addition` is a verbatim repeat of the tail of `existing`. */
function isVerbatimThinkingRepeat(existing: string, addition: string): boolean {
  return addition.length >= MIN_REPEAT_THINKING_CHARS && existing.endsWith(addition);
}

/** Truncate a thinking block to the tail so persisted context stays bounded. */
function capThinking(thinking: string | undefined): string | undefined {
  if (!thinking) return undefined;
  if (thinking.length <= MAX_PERSISTED_THINKING_CHARS) return thinking;
  return "…" + thinking.slice(-MAX_PERSISTED_THINKING_CHARS);
}

/**
 * True when the thinking channel contains only timing/progress heartbeat
 * markers (e.g. "25.0s", "25.0s25.0s", "3s") and no genuine reasoning. Some
 * cloud model servers stream elapsed-time progress into the reasoning channel,
 * and on a bad round that is all they deliver — no answer and no tool call.
 * Treating that as recoverable reasoning wastes retries on a byte-identical
 * payload, so it should short-circuit straight to a graceful fallback.
 */
function isTimingNoiseReasoning(thinking: string | undefined): boolean {
  if (!thinking) return false;
  // Strip every duration token like "25.0s" / "3s" and all surrounding
  // whitespace. If only such tokens (and whitespace) remain, it's a heartbeat.
  const remaining = thinking.replace(/\d+(?:\.\d+)?\s*s/gi, "").replace(/\s+/g, "");
  return remaining.length === 0 && /^\s*\d+(?:\.\d+)?\s*s/i.test(thinking);
}

/**
 * Build a concise, honest final answer to surface when the provider ended the
 * turn with reasoning but no answer or tool call, so the loop never leaves the
 * user staring at an empty thinking bubble. Prefers the most recent tool
 * outcome; otherwise returns a plain status message.
 */
function buildEmptyResponseFallback(executedToolCalls: ExecutedToolCall[]): string {
  const last = executedToolCalls[executedToolCalls.length - 1];
  if (last && last.message) {
    const outcome = last.ok ? "completed" : "encountered a problem";
    const snippet = String(last.message).replace(/\s+/g, " ").trim();
    const detail = snippet.length > 400 ? snippet.slice(0, 400) + "…" : snippet;
    return (
      `I couldn't compose a final answer from the model on this attempt, but the last tool step did finish:\n\n` +
      `- \`${last.tool}\` ${outcome}: ${detail}\n\n` +
      `Ask me to continue and I'll pick up from here.`
    );
  }
  return (
    `I processed your request but the model returned reasoning without a final answer on this attempt. ` +
    `No further action was taken. Ask me to continue and I'll pick up from where it left off.`
  );
}

/**
 * Detect if the model emitted a tool call as plain text instead of structured format.
 * Matches patterns like: `toolName\n{"arg": "value"}` or `toolName({"arg": "value"})`
 */
function detectPlainTextToolCalls(
  content: string,
  knownToolNames: Set<string>,
): { name: string } | null {
  // Pattern 1: tool_name\n{json} or tool_name\n```json\n{...}\n```
  const lines = content.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!.trim();
    // Check if line looks like a bare tool name (with or without underscores/dots)
    if (knownToolNames.has(line)) {
      // Next non-empty line starts with { or ```
      const nextLine = lines.slice(i + 1).find(l => l.trim())?.trim() ?? "";
      if (nextLine.startsWith("{") || nextLine.startsWith("```")) {
        return { name: line };
      }
    }
  }

  // Pattern 2: tool_name({"arg": ...}) in a single line
  for (const name of knownToolNames) {
    if (content.includes(`${name}({`) || content.includes(`${name}({\n`)) {
      return { name };
    }
  }

  // Pattern 3: ``` followed by JSON with a "name" or "function" field referencing a tool
  const jsonBlockMatch = content.match(/```(?:json)?\s*\n?\s*\{[^}]*"(?:name|function)"\s*:\s*"([^"]+)"/);
  if (jsonBlockMatch && knownToolNames.has(jsonBlockMatch[1]!)) {
    return { name: jsonBlockMatch[1]! };
  }

  return null;
}


/**
 * Run the agentic tool-calling loop.
 *
 * This is the core reusable loop used by both the main chat route and
 * the agent.spawn sub-agent tool. It streams LLM responses, executes
 * tool calls (with validation, retry, parallel batching, and steering),
 * and returns the accumulated result.
 */

// ── Context pruning ──────────────────────────────────────────────────

/** Target ratio after pruning — leave headroom for the next LLM response */
/** Target ratio after pruning — lower value leaves more headroom for the next LLM response, compensating for the imprecise char/token estimator. */
const PRUNE_TARGET_RATIO = 0.45;

/**
 * Codex-style compaction trigger. Every message — including file reads and
 * other tool results — stays verbatim in context until usage crosses this
 * fraction of the model window. Codex's auto-compaction fires purely on token
 * budget (`auto_compact_token_limit`, a high fraction of the window), never on
 * round count, and then performs a single full summarization. 0.85 instead of
 * ~0.9 because Jait's char/token estimator is imprecise; the emergency
 * overflow recovery backstops an underestimate with a compact-and-retry.
 */
export const CONTEXT_COMPACT_TRIGGER_RATIO = 0.85;
const SUMMARY_ITEM_LIMIT = 5;
const SUMMARY_TEXT_LIMIT = 220;

function compactSummaryText(value: string, max = SUMMARY_TEXT_LIMIT): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function pushSummaryItem(items: string[], value: string, limit = SUMMARY_ITEM_LIMIT): void {
  const item = compactSummaryText(value);
  if (!item || items.includes(item) || items.length >= limit) return;
  items.push(item);
}

function addFileReferences(value: unknown, files: string[]): void {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return;
  const filePathPattern = /(?:^|[\s([{'"`])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_.-]+)?)/g;
  for (const match of text.matchAll(filePathPattern)) {
    pushSummaryItem(files, match[1] ?? "", 10);
  }
}

function summarizeToolMessage(message: AgentMessage): string {
  const toolName = fromOpenAIName(message.name ?? "tool");
  let detail = message.content;
  try {
    const parsed = JSON.parse(message.content) as { ok?: boolean; message?: string; data?: unknown };
    const data = parsed.data === undefined
      ? ""
      : compactSummaryText(
          typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data),
          600,
        );
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      detail = data ? `${parsed.message}; data: ${data}` : parsed.message;
    } else if (data) {
      detail = data;
    } else if (typeof parsed.ok === "boolean") {
      detail = parsed.ok ? "completed successfully" : "failed";
    }
  } catch {
    // Keep raw tool content.
  }
  return `Tool ${toolName}: ${detail}`;
}

function formatSummarySection(title: string, items: string[]): string[] {
  const values = items.length > 0 ? items : ["Not captured in pruned turns."];
  return [title, ...values.map((item) => `- ${item}`)];
}

function buildStructuredConversationSummary(removedMessages: AgentMessage[]): string {
  const goals: string[] = [];
  const constraints: string[] = [];
  const decisions: string[] = [];
  const files: string[] = [];
  const progress: string[] = [];
  const nextSteps: string[] = [];

  const constraintPattern = /\b(must|never|always|prefer|avoid|require|required|constraint|do not|don't|keep|only)\b/i;
  const decisionPattern = /\b(decision|decided|chose|choose|selected|approach|instead|use|using|will|should)\b/i;
  const nextStepPattern = /\b(next|todo|follow up|remaining|continue|verify|test|run|implement|fix|later)\b/i;

  for (const message of removedMessages) {
    addFileReferences(message.content, files);
    if (message.tool_calls) addFileReferences(message.tool_calls, files);

    const content = compactSummaryText(message.content);

    if (message.role === "user") {
      // Always preserve the user's intent as a goal — even when the message
      // was empty/whitespace-only. The first user turn is the most prune-prone
      // (it is the oldest), so silently skipping it would lose the entire
      // context of the conversation. Use an explicit fallback so the loss is
      // visible rather than disappearing into "Not captured in pruned turns."
      const goalText = content || "[user message was empty or whitespace-only]";
      pushSummaryItem(goals, goalText, 3);
      if (constraintPattern.test(content)) pushSummaryItem(constraints, content);
      if (decisionPattern.test(content)) pushSummaryItem(decisions, content);
      if (nextStepPattern.test(content)) pushSummaryItem(nextSteps, content);
      continue;
    }

    // For non-user roles, skip messages with no content and no tool calls.
    if (!content && !message.tool_calls?.length) continue;

    if (message.role === "system") {
      if (constraintPattern.test(content)) pushSummaryItem(constraints, content);
      continue;
    }

    if (message.role === "assistant") {
      if (content) {
        if (decisionPattern.test(content)) pushSummaryItem(decisions, content);
        pushSummaryItem(progress, `Assistant: ${content}`);
        if (nextStepPattern.test(content)) pushSummaryItem(nextSteps, content);
      }
      if (message.tool_calls?.length) {
        const tools = message.tool_calls.map((call) => fromOpenAIName(call.function.name)).join(", ");
        pushSummaryItem(progress, `Assistant requested tools: ${tools}`);
      }
      continue;
    }

    if (message.role === "tool") {
      pushSummaryItem(progress, summarizeToolMessage(message));
    }
  }

  if (nextSteps.length === 0) {
    nextSteps.push("Continue from the remaining messages below; the latest user turn is preserved verbatim.");
  }

  return [
    "[conversation-summary]",
    `Earlier messages pruned: ${removedMessages.length}.`,
    ...formatSummarySection("Goal:", goals),
    ...formatSummarySection("Constraints:", constraints),
    ...formatSummarySection("Decisions:", decisions),
    ...formatSummarySection("Files:", files),
    ...formatSummarySection("Progress:", progress),
    ...formatSummarySection("Next steps:", nextSteps),
    "[/conversation-summary]",
  ].join("\n");
}

/**
 * Bare "continue" style user turns that carry no task on their own. When one of
 * these is the only user turn left after pruning, the model has nothing to act
 * on, so `pruneHistory` re-injects the most recent substantive user turn.
 */
const TRIVIAL_USER_CONTINUATIONS = new Set([
  "continue", "continue?", "continue.", "cont", "go", "go?", "go on", "go on?",
  "keep going", "keep going?", "carry on", "proceed", "resume", "next",
  "more", "and?", "?", "yes", "y", "yep", "yeah", "ok", "okay", "k",
  "yes please", "please continue", "continue please", "keep going please",
]);

/**
 * A user message is "substantive" when it carries an actual instruction rather
 * than a bare continuation ("continue?", "yes", "go on"). Used so pruning never
 * leaves the model with only a trivial continuation and no task to act on.
 */
function isSubstantiveUserMessage(content: string | undefined): boolean {
  if (!content) return false;
  const normalized = content.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return false;
  const stripped = normalized.replace(/[?.!,]+$/g, "");
  if (TRIVIAL_USER_CONTINUATIONS.has(normalized) || TRIVIAL_USER_CONTINUATIONS.has(stripped)) {
    return false;
  }
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2 || normalized.length >= 12;
}

/**
 * After pruning, guarantee the model still sees the user's real task as a live
 * `user` turn. If the surviving tail user message is a trivial continuation
 * (e.g. "continue?"), the actual request now lives only inside the injected
 * summary — which models tend to treat as background and ignore. Re-inject the
 * most recent substantive user message (just pruned) verbatim, right before the
 * tail turn so it stays the active instruction. Mutates `history` in place.
 */
function reinjectSubstantiveUserTask(
  history: AgentMessage[],
  removedMessages: AgentMessage[],
): void {
  let tailUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === "user") {
      tailUserIdx = i;
      break;
    }
  }
  if (tailUserIdx < 0) return;
  // Tail already carries a real instruction — nothing was lost.
  if (isSubstantiveUserMessage(history[tailUserIdx]!.content)) return;

  // Most recent substantive user turn among the pruned messages.
  let task: AgentMessage | undefined;
  for (let i = removedMessages.length - 1; i >= 0; i--) {
    const msg = removedMessages[i]!;
    if (msg.role === "user" && isSubstantiveUserMessage(msg.content)) {
      task = msg;
      break;
    }
  }
  if (!task) return;

  history.splice(tailUserIdx, 0, {
    role: "user",
    content: `[Restored task from earlier in this conversation — this is still your active task]\n${task.content}`,
    synthetic: true,
  });
}

/**
 * Prune oldest conversation turns to bring context usage below the target.
 *
 * Strategy (similar to Copilot):
 *  1. Never remove the system prompt (index 0) or the last user message.
 *  2. Remove oldest user/assistant/tool turn groups first.
 *  3. Insert a structured `[conversation-summary]` so the model keeps the
 *     pruned goal, constraints, decisions, files, progress, and next steps.
 *
 * Mutates `history` in place. Returns true if anything was pruned.
 */
// ── LLM-based conversation summarization (pi-style) ──────────────────

/** Max chars for a tool result when serializing conversation for summarization. */
const SUMMARY_TOOL_RESULT_MAX_CHARS = 2_000;

/**
 * Serialize conversation messages to text for LLM summarization.
 * This prevents the model from treating it as a conversation to continue.
 * Tool results are truncated to keep the summarization request within reasonable budgets.
 */
function serializeConversationForSummary(messages: AgentMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      if (msg.content) parts.push(`[User]: ${msg.content}`);
    } else if (msg.role === "assistant") {
      if (msg.thinking) parts.push(`[Assistant thinking]: ${msg.thinking}`);
      if (msg.content) parts.push(`[Assistant]: ${msg.content}`);
      if (msg.tool_calls?.length) {
        const calls = msg.tool_calls.map((tc) => {
          let args = "";
          try { args = tc.function.arguments; } catch { args = ""; }
          return `${fromOpenAIName(tc.function.name)}(${args})`;
        });
        parts.push(`[Assistant tool calls]: ${calls.join("; ")}`);
      }
    } else if (msg.role === "tool") {
      const content = msg.content;
      if (content) {
        const truncated = content.length <= SUMMARY_TOOL_RESULT_MAX_CHARS
          ? content
          : `${content.slice(0, SUMMARY_TOOL_RESULT_MAX_CHARS)}\n\n[... ${content.length - SUMMARY_TOOL_RESULT_MAX_CHARS} more characters truncated]`;
        parts.push(`[Tool result]: ${truncated}`);
      }
    } else if (msg.role === "system") {
      // Skip system messages (system prompt, prior summaries, steering, etc.)
    }
  }
  return parts.join("\n\n");
}

const LLM_SUMMARIZATION_SYSTEM_PROMPT =
  "You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified. " +
  "Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.";

const LLM_SUMMARIZATION_PROMPT =
  `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.\n\n` +
  `Use this EXACT format:\n\n` +
  `## Goal\n[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]\n\n` +
  `## Constraints & Preferences\n- [Any constraints, preferences, or requirements mentioned by user]\n- [Or "(none)" if none were mentioned]\n\n` +
  `## Progress\n### Done\n- [x] [Completed tasks/changes]\n\n### In Progress\n- [ ] [Current work]\n\n### Blocked\n- [Issues preventing progress, if any]\n\n` +
  `## Key Decisions\n- **[Decision]**: [Brief rationale]\n\n` +
  `## Next Steps\n1. [Ordered list of what should happen next]\n\n` +
  `## Critical Context\n- [Any data, examples, or references needed to continue]\n- [Or "(none)" if not applicable]\n\n` +
  `Keep each section concise. Preserve exact file paths, function names, and error messages.`;

/**
 * Generate a structured conversation summary using the LLM (pi-style compaction).
 *
 * Sends the removed messages to the model with a summarization prompt and returns
 * the generated summary text. Falls back to the regex-based
 * {@link buildStructuredConversationSummary} on any error (network failure,
 * non-OK response, parse error, or when no LLM config is provided).
 */
export async function generateLLMConversationSummary(
  removedMessages: AgentMessage[],
  llm: LLMConfig,
  signal?: AbortSignal,
): Promise<string> {
  const conversationText = serializeConversationForSummary(removedMessages);
  if (!conversationText.trim()) {
    return buildStructuredConversationSummary(removedMessages);
  }

  const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${LLM_SUMMARIZATION_PROMPT}`;
  const messages = [
    { role: "system" as const, content: LLM_SUMMARIZATION_SYSTEM_PROMPT },
    { role: "user" as const, content: promptText },
  ];

  try {
    const isOllama = llm.backend === "ollama";
    const requestUrl = isOllama
      ? `${llm.openaiBaseUrl.replace(/\/v1\/?$/, "")}/api/chat`
      : `${llm.openaiBaseUrl}/chat/completions`;
    const reqBody: Record<string, unknown> = isOllama
      ? { model: llm.openaiModel, messages, stream: false, options: { num_ctx: llm.numCtx ?? llm.contextWindow } }
      : { model: llm.openaiModel, messages, stream: false, max_tokens: 2048 };

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.openaiApiKey}` },
      body: JSON.stringify(reqBody),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`Summarization LLM returned ${response.status}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; message?: { content?: string } };
    // OpenAI format: data.choices[0].message.content
    // Ollama format: data.message.content
    const summary = data.choices?.[0]?.message?.content ?? data.message?.content ?? "";
    if (!summary.trim()) {
      throw new Error("Summarization LLM returned empty content");
    }

    return `[conversation-summary]\n${summary.trim()}\n[/conversation-summary]`;
  } catch {
    // Fall back to the deterministic regex-based summary — better than nothing.
    return buildStructuredConversationSummary(removedMessages);
  }
}

/**
 * Prune oldest conversation turns to bring context usage below the target.
 *
 * Strategy (similar to Copilot):
 *  1. Never remove the system prompt (index 0) or the last user message.
 *  2. Remove oldest user/assistant/tool turn groups first.
 *  3. Insert a structured `[conversation-summary]` so the model keeps the
 *     pruned goal, constraints, decisions, files, progress, and next steps.
 *
 * When `options.summaryGenerator` is provided, it is used to generate the
 * summary (pi-style LLM compaction). Otherwise, the deterministic regex-based
 * {@link buildStructuredConversationSummary} is used as a fallback.
 *
 * Mutates `history` in place. Returns true if anything was pruned.
 */
export async function pruneHistory(
  history: AgentMessage[],
  contextWindow: number,
  toolSchemas: unknown[],
  options?: {
    summaryGenerator?: (removedMessages: AgentMessage[]) => Promise<string>;
  },
): Promise<boolean> {
  const usage = computeContextUsage(history, toolSchemas, contextWindow);
  const targetTokens = Math.floor(contextWindow * PRUNE_TARGET_RATIO);
  if (usage.total <= targetTokens) return false;

  let tokensToFree = usage.total - targetTokens;
  let pruned = false;

  // Find removable range: skip system messages at the start and keep
  // the last user message + everything after it.
  // Also detect and remove any existing conversation-summary so we merge
  // rather than stack duplicate summaries.
  let firstRemovable = 0;
  let existingSummaryIdx = -1;
  while (firstRemovable < history.length && history[firstRemovable]!.role === "system") {
    if (history[firstRemovable]!.content?.includes("[conversation-summary]")) {
      existingSummaryIdx = firstRemovable;
    }
    firstRemovable++;
  }
  // If there's a prior summary, include it in the removable set so its
  // content feeds into the new merged summary.
  if (existingSummaryIdx >= 0) {
    firstRemovable = existingSummaryIdx;
  }

  // Find last user message index
  let lastUserIdx = history.length - 1;
  while (lastUserIdx >= 0 && history[lastUserIdx]!.role !== "user") {
    lastUserIdx--;
  }
  // Keep the last user message and everything after it
  const safeEnd = Math.max(lastUserIdx, firstRemovable);

  // Remove messages from firstRemovable forward until we've freed enough
  const removedIndices: number[] = [];
  const removedMessages: AgentMessage[] = [];
  for (let i = firstRemovable; i < safeEnd && tokensToFree > 0; i++) {
    const msg = history[i]!;
    const cost = estimateMessageTokens(msg);
    tokensToFree -= cost;
    removedIndices.push(i);
    removedMessages.push(msg);
    pruned = true;
  }

  if (removedIndices.length > 0) {
    // Remove in reverse order to keep indices stable
    for (let i = removedIndices.length - 1; i >= 0; i--) {
      history.splice(removedIndices[i]!, 1);
    }
    // Insert a structured summary after the system messages.
    const insertAt = firstRemovable;
    const summary = options?.summaryGenerator
      ? await options.summaryGenerator(removedMessages)
      : buildStructuredConversationSummary(removedMessages);
    history.splice(insertAt, 0, {
      role: "system",
      content: summary,
    });

    // If the only surviving user turn is a trivial continuation ("continue?"),
    // re-inject the most recent substantive user message so the task isn't lost
    // to the summary and silently ignored on the next turn.
    reinjectSubstantiveUserTask(history, removedMessages);
  }

  return pruned;
}

/**
 * Tool rounds inside the active turn that are never collapsed into a summary.
 *
 * This is the floor that decides how long a file the model read stays readable.
 * Collapsing deletes the tool result outright and replaces it with a ~600-char
 * summary line, so anything past this window is gone — not shortened, gone —
 * and the model's only way back to that content is to read the file again.
 * A window of 3 (the previous value) meant a file read four rounds ago had to
 * be re-read, which is the re-read treadmill: re-reading regrows the context
 * that triggered the collapse, which collapses again, which forces another
 * re-read. Codex-style compaction avoids the treadmill differently: nothing is
 * shortened or collapsed until the token-budget trigger fires, and then the
 * oldest completed rounds go into a summary wholesale rather than being
 * truncated into stubs.
 */
const ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP = 8;
const ACTIVE_TURN_SUMMARY_SOURCE_MESSAGES = 24;

/**
 * Long-running turns cannot be pruned by pruneHistory because it deliberately
 * preserves the last user message and everything after it. Continuous runs can
 * therefore accumulate dozens of completed assistant/tool protocol pairs inside
 * one turn until the model is operating far beyond its context window.
 *
 * Collapse the completed prefix of the active turn into a compact progress
 * summary while keeping the latest tool rounds verbatim. The original user
 * request remains in history, so the summary only needs to preserve recent work.
 *
 * Collapsing is destructive and irreversible, so it is budget-driven: it only
 * removes as many of the oldest rounds as it takes to get back under the target,
 * and does nothing at all when the history already fits. Without the budget
 * check this ran on every round once usage crossed the trigger once — cutting
 * the turn back to the keep-window even when the preceding pruning passes had
 * already freed enough space.
 */
function compactActiveTurnHistory(
  history: AgentMessage[],
  toolSchemas: unknown[] = [],
  contextWindow = 0,
): boolean {
  let lastUserIndex = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]!.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) return false;

  const toolRoundStarts: number[] = [];
  for (let index = lastUserIndex + 1; index < history.length; index++) {
    const message = history[index]!;
    if (message.role === "assistant" && message.tool_calls?.length) {
      toolRoundStarts.push(index);
    }
  }
  if (toolRoundStarts.length <= ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP) return false;

  const removableRounds = toolRoundStarts.length - ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP;
  const targetTokens = contextWindow > 0 ? Math.floor(contextWindow * PRUNE_TARGET_RATIO) : 0;
  let roundsToDrop = removableRounds;

  if (targetTokens > 0) {
    const tokensToFree = computeContextUsage(history, toolSchemas, contextWindow).total - targetTokens;
    if (tokensToFree <= 0) return false;
    let freed = 0;
    roundsToDrop = 0;
    while (roundsToDrop < removableRounds && freed < tokensToFree) {
      const from = roundsToDrop === 0 ? lastUserIndex + 1 : toolRoundStarts[roundsToDrop]!;
      const to = toolRoundStarts[roundsToDrop + 1]!;
      for (let index = from; index < to; index++) freed += estimateMessageTokens(history[index]!);
      roundsToDrop++;
    }
    if (roundsToDrop === 0) return false;
  }

  const keepFromIndex = toolRoundStarts[roundsToDrop]!;
  const removeCount = keepFromIndex - lastUserIndex - 1;
  if (removeCount <= 0) return false;

  const removedMessages = history.splice(lastUserIndex + 1, removeCount);
  const summarySource = removedMessages.slice(-ACTIVE_TURN_SUMMARY_SOURCE_MESSAGES).reverse();
  const summary = buildStructuredConversationSummary(summarySource)
    .replace("[conversation-summary]", "[active-turn-summary]")
    .replace("[/conversation-summary]", "[/active-turn-summary]");
  history.splice(lastUserIndex + 1, 0, { role: "system", content: summary });
  return true;
}

export async function runAgentLoop(
  options: AgentLoopOptions,
  executeTool: ToolExecutor,
  steering?: SteeringController,
): Promise<AgentLoopResult> {
  const {
    llm,
    history,
    toolSchemas: initialToolSchemas,
    hasTools,
    sessionId,
    auth,
    abort,
    maxRounds,
    continuous = !maxRounds || maxRounds <= 0,
    maxRetries = DEFAULT_MAX_RETRIES,
    parallel = true,
    toolRegistry,
    disabledTools,
    mode = "agent",
    onEvent,
    onContext,
    onPersist,
    log = console,
  } = options;

  const requestedRoundBudget = maxRounds && maxRounds > 0
    ? maxRounds
    : DEFAULT_TOOL_ROUND_CHECKPOINT;
  const roundBudget = Math.min(requestedRoundBudget, ABSOLUTE_TOOL_ROUND_BUDGET);
  const roundLimit = continuous ? Number.POSITIVE_INFINITY : roundBudget;

  let fullContent = "";
  const executedToolCalls: ExecutedToolCall[] = [];
  const segments: MessageSegment[] = [];
  const queue = new ToolCallQueue();
  const discardLatestContentText = (discardedContent: string): void => {
    if (!discardedContent) return;
    if (fullContent.endsWith(discardedContent)) {
      fullContent = fullContent.slice(0, -discardedContent.length);
    }
    const lastSegment = segments[segments.length - 1];
    if (lastSegment?.type !== "text" || !lastSegment.content.endsWith(discardedContent)) return;
    const retainedContent = lastSegment.content.slice(0, -discardedContent.length);
    if (retainedContent) {
      segments[segments.length - 1] = { type: "text", content: retainedContent };
    } else {
      segments.pop();
    }
  };
  /** Roll a round's reasoning back out of the rendered transcript. */
  const discardLatestThinkingText = (discardedThinking: string): void => {
    if (!discardedThinking) return;
    const lastSegment = segments[segments.length - 1];
    // A verbatim replay is never appended (see the segment merge below), so a
    // segment that doesn't end with this round's reasoning has nothing to drop.
    if (lastSegment?.type !== "thinking" || !lastSegment.content.endsWith(discardedThinking)) return;
    const retainedThinking = lastSegment.content.slice(0, -discardedThinking.length);
    if (retainedThinking) {
      segments[segments.length - 1] = { type: "thinking", content: retainedThinking };
    } else {
      segments.pop();
    }
  };
  /** Tracks whether the turn's assistant message was already persisted via onPersist. */
  let persisted = false;

  // ── Loop health tracking ──
  /** Times we've re-prompted for plain-text tool calls in this loop run. */
  let plainTextRetries = 0;
  /** Consecutive terminal provider responses with no visible text or tool call. */
  let emptyResponseRetries = 0;
  /** Thinking from the last answer-less round, to detect a replayed reasoning loop. */
  let lastEmptyThinking = "";
  const emptyResponseRecoveryPrompts = new Set<AgentMessage>();
  /** The previous round's reasoning text, to detect verbatim replays across rounds. */
  let lastRoundThinking = "";
  /** Tool-call signature of the previous round, paired with the replay check. */
  let lastRoundToolSignature: string | null = null;
  /** Consecutive rounds that replayed the same reasoning + same tool call. */
  let replayedLoopRounds = 0;
  /** `fullContent` length at the start of the replay loop (rollback point). */
  let replayedLoopStartContent = 0;
  /** `segments` length at the start of the replay loop (rollback point). */
  let replayedLoopStartSegments = 0;
  /** Times we've steered (rather than stopped) this replay loop so far. */
  let replaySteerings = 0;
  let autonomousCheckpointPrompt: AgentMessage | null = null;
  const clearEmptyResponseRecoveryPrompts = () => {
    for (const prompt of emptyResponseRecoveryPrompts) {
      const index = history.indexOf(prompt);
      if (index >= 0) history.splice(index, 1);
    }
    emptyResponseRecoveryPrompts.clear();
  };
  /** Times we've auto-continued after a length-truncated response in this loop run. */
  let lengthContinuations = 0;
  /** Times we've discarded a provider generation that fell into verbatim repetition. */
  let repetitionRecoveries = 0;
  /**
   * Set for the single round that immediately follows a discarded generation,
   * so the resample can be nudged off the sampling path that just looped.
   */
  let repetitionResampleAttempt = 0;
  /** Signature of the most recent round's tool call(s), for duplicate-loop detection. */
  let lastToolCallSignature: string | null = null;
  /** Consecutive rounds with the exact same tool call signature. */
  let duplicateCallStreak = 0;
  /** Times we've nudged the model to break out of a duplicate-call loop. */
  let duplicateCallInterventions = 0;
  /** Signatures rejected by the latest duplicate-call intervention. */
  let duplicateInterventionSignatures = new Set<string>();
  /** Internal tool names hidden from the next provider round after a loop. */
  let quarantinedToolNames = new Set<string>();
  const toolCallOccurrences = new Map<string, number>();
  /**
   * Lifetime count per signature, never reset by an intervention.
   *
   * `toolCallOccurrences` is zeroed every time we nudge or quarantine, which
   * hands the model a fresh budget each cycle — so a call that should have been
   * stopped at 6 can keep recurring indefinitely (nudge, reset, 6 more, nudge,
   * reset…). This is the counter that actually terminates such a loop.
   */
  const toolCallLifetimeOccurrences = new Map<string, number>();
  /** Consecutive failures per signature that returned the same error text. */
  const repeatedFailureCounts = new Map<string, { message: string; count: number }>();
  const readCoverageByTarget = new Map<string, ReadCoverageState>();
  /** Whether we've already attempted overflow recovery (compact + retry) in this loop run. */
  let overflowRecoveryAttempted = false;
  /**
   * Consecutive transient transport failures (undici timeouts, reset sockets)
   * retried without consuming a round — see the catch around the LLM fetch.
   */
  let transportRetries = 0;
  /** Swarm mode: has the coordinator delegated anything to a specialist yet? */
  let swarmHasDelegated = false;
  /** Swarm mode: direct read/search-style tool calls made before any delegation. */
  let swarmUndelegatedReadCount = 0;
  /** Swarm mode: has the forced-delegation nudge already been sent? */
  let swarmDelegationNudged = false;
  /** The periodic reminder currently in history, so the next one replaces it. */
  let periodicReminderPrompt: AgentMessage | null = null;
  /** The convergence directive currently in history, removed once progress resumes. */
  let convergePrompt: AgentMessage | null = null;
  /** Consecutive rounds that only investigated and completed no plan step. */
  let investigationOnlyStreak = 0;
  /** Completed todo count at the end of the previous round, to detect plan movement. */
  let completedTodoCount = getSessionTodos(sessionId).filter((todo) => todo.status === "completed").length;
  /** When set, the next round is sent without tools so the model has to answer. */
  // Explicit annotation: the assignment `forceFinalAnswer = answerOnlyRound || forceFinalAnswer`
  // below otherwise makes TypeScript chase an inference cycle (TS7022).
  let forceFinalAnswer: boolean = false;

  // ── Plan mode state ──
  const plannedActions: PlannedAction[] = [];
  const planId = mode === "plan" ? `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : "";

  // ── Mode-aware schema filtering ──
  // Ask mode: only read-only tools. Plan/Agent/Swarm mode: full set.
  let modeFilteredSchemas = initialToolSchemas;
  if (mode === "ask") {
    modeFilteredSchemas = initialToolSchemas.filter((s) =>
      ASK_MODE_TOOLS.has(fromOpenAIName(s.function.name)),
    );
    onEvent?.({ type: "mode_notice", mode: "ask", message: "Running in Ask mode — read-only tools only." });
  } else if (mode === "plan") {
    onEvent?.({ type: "mode_notice", mode: "plan", message: "Running in Plan mode — mutating actions will be proposed, not executed." });
  } else if (mode === "swarm") {
    onEvent?.({ type: "mode_notice", mode: "swarm", message: "Running in Swarm mode — the coordinator is restricted to orchestration tools and must delegate all implementation work (edits, commands, state changes) to specialist sub-agents." });
  }

  // Dynamic schema set — starts with filtered schemas, grows when tools.search
  // discovers additional tools (e.g. external/MCP tools).
  const activeSchemas = [...modeFilteredSchemas];
  const activeSchemaNames = new Set(activeSchemas.map((s) => s.function.name));

  for (let round = 0; round < roundLimit; round++) {
    // ── Check abort ──
    if (abort.signal.aborted) {
      log.info(`Agent loop cancelled for session ${sessionId} — stopping before round ${round}`);
      return { content: fullContent, executedToolCalls, segments, rounds: round, aborted: true, hitMaxRounds: false, persisted };
    }

    // ── Invisible continuous-run checkpoint ──
    // A checkpoint is a context/strategy boundary, not a terminal condition.
    // The previous checkpoint prompt is removed so these do not accumulate.
    // Codex-style compaction is token-budget-only: this round-count boundary
    // never compacts history — the per-round budget check handles that.
    if (continuous && round > 0 && round % roundBudget === 0) {
      if (autonomousCheckpointPrompt) {
        const checkpointIndex = history.indexOf(autonomousCheckpointPrompt);
        if (checkpointIndex >= 0) history.splice(checkpointIndex, 1);
      }
      autonomousCheckpointPrompt = {
        role: "system",
        content:
          "[AUTONOMOUS CHECKPOINT] Reassess the original request and the work completed so far. " +
          "Do not repeat completed investigation or identical tool calls. Continue with the smallest " +
          "remaining actions, verify the outcome, and give the user a final answer as soon as the task " +
          "is complete. If external input is genuinely required, explain that blocker normally.",
      };
      history.push(autonomousCheckpointPrompt);
      log.info(
        `Agent loop crossed autonomous checkpoint ${round / roundBudget} ` +
          `(${round} rounds) for session ${sessionId}; continuing`,
      );
    }

    // ── Apply steering messages ──
    if (steering) {
      const steered = steering.drain();
      for (const msg of steered) {
        history.push({ role: "system", content: `[STEERING] ${msg}` });
        segments.push({ type: "steering", content: msg });
        onEvent?.({ type: "steering", message: msg });
        log.info(`Steering injected for session ${sessionId}: ${msg.slice(0, 100)}`);
      }
    }

    // ── Periodic reminder (every 4 rounds) to reinforce good agent behaviour ──
    // The previous copy is removed first. Appending instead stacked an
    // identical reminder every 4 rounds: pure context bloat, and — since every
    // resolver's reminder amounts to "keep going until the task is resolved" —
    // a pile of standing instructions to keep calling tools, which is the last
    // pressure a model circling the same ground needs. One live copy, carrying
    // the current plan so the goal survives compaction, replaces the stack.
    if (round > 0 && round % 4 === 0 && mode !== "ask") {
      const modelEndpoint: ModelEndpoint = { model: llm.openaiModel, baseUrl: "" };
      const reminder = getReminderInstructions(mode, modelEndpoint);
      if (reminder) {
        if (periodicReminderPrompt) {
          const reminderIndex = history.indexOf(periodicReminderPrompt);
          if (reminderIndex >= 0) history.splice(reminderIndex, 1);
        }
        const planSnapshot = renderPlanSnapshot(getSessionTodos(sessionId));
        periodicReminderPrompt = {
          role: "system",
          content: planSnapshot ? `${reminder}\n\n${planSnapshot}` : reminder,
        };
        history.push(periodicReminderPrompt);
      }
    }

    // ── Context budget tracking & compaction (Codex-style) ────────────
    // Everything stays verbatim in history until usage crosses
    // CONTEXT_COMPACT_TRIGGER_RATIO — a high fraction of the window, matching
    // Codex's token-budget-only auto-compaction (it fires at ~90% of the model
    // window, never by round count). When it fires, the old portion of the
    // conversation is replaced by a single structured summary; the current
    // request and the most recent tool rounds stay verbatim.
    const contextWindow = llm.contextWindow;
    if (contextWindow > 0) {
      let usage = computeContextUsage(history, activeSchemas, contextWindow);
      onEvent?.({ type: "context_usage", ...usage });

      if (usage.ratio >= CONTEXT_COMPACT_TRIGGER_RATIO) {
        // Summarize completed turns (before the last user message) first.
        const pruned = await pruneHistory(history, contextWindow, activeSchemas, {
          summaryGenerator: (removed) => generateLLMConversationSummary(removed, llm, abort.signal),
        });
        // In a long single-turn run there are no completed turns to prune, so
        // also collapse the completed prefix of the active turn into a summary
        // (keeps the most recent rounds verbatim). Both passes summarize rather
        // than truncate — no tool result is ever shortened into a stub.
        const activeTurnCompacted = compactActiveTurnHistory(
          history,
          activeSchemas,
          contextWindow,
        );
        if (pruned || activeTurnCompacted) {
          usage = computeContextUsage(history, activeSchemas, contextWindow);
          onEvent?.({ type: "context_usage", ...usage, pruned: true });
          log.info(
            `Context compacted: ${usage.total}/${contextWindow} tokens (${(usage.ratio * 100).toFixed(0)}%)`,
          );
        }
      }
    }
    repairToolCallHistory(history);

    // ── LLM request ──
    // Ollama: use the native /api/chat endpoint so we can pass num_ctx. The
    // OpenAI-compatible /v1 endpoint silently ignores it and pins the model to
    // the server's default context, truncating long conversations mid-answer.
    const isOllama = llm.backend === "ollama";
    const roundQuarantinedToolNames = quarantinedToolNames;
    quarantinedToolNames = new Set<string>();
    // A round sent without any tools cannot produce another tool call, so the
    // model answers from what it has and the turn ends. This is the only hard
    // stop for a turn that would otherwise investigate forever.
    // Explicit annotation: this flag is re-assigned from `answerOnlyRound` at the
    // end of the round, which otherwise creates a circular inference (TS7022).
    const answerOnlyRound: boolean = forceFinalAnswer;
    forceFinalAnswer = false;
    const roundToolSchemas = answerOnlyRound
      ? []
      : roundQuarantinedToolNames.size > 0
        ? activeSchemas.filter((schema) => !roundQuarantinedToolNames.has(fromOpenAIName(schema.function.name)))
        : activeSchemas;
    const reqBody: Record<string, unknown> = isOllama
      ? {
          model: llm.openaiModel,
          messages: serializeMessagesForOllama(history),
          stream: true,
          options: { num_ctx: llm.numCtx ?? contextWindow },
        }
      : {
          model: llm.openaiModel,
          messages: serializeMessages(history),
          stream: true,
          stream_options: { include_usage: true },
        };
    // Re-sending a discarded generation's request unchanged only helps when the
    // backend samples non-deterministically. Ollama's defaults are effectively
    // replayable for a byte-identical payload, so a resample there has to move
    // off the path that just looped. OpenAI-compatible payloads are left alone:
    // reasoning models reject a non-default temperature outright, and those
    // backends already vary between identical requests.
    if (isOllama && repetitionResampleAttempt > 0) {
      const options = reqBody.options as Record<string, unknown>;
      options.temperature = Math.min(1.1, 0.8 + 0.15 * repetitionResampleAttempt);
      options.seed = Math.floor(Math.random() * 0x7fffffff);
    }
    repetitionResampleAttempt = 0;
    // Reasoning effort (OpenAI o-series / GPT-5 reasoning models). Ollama's
    // native /api/chat endpoint does not accept this field, so only send it to
    // OpenAI-compatible backends when the user has explicitly chosen a level.
    if (!isOllama && auth?.reasoningEffort) {
      reqBody.reasoning_effort = auth.reasoningEffort;
    }
    if (hasTools && roundToolSchemas.length > 0) {
      reqBody.tools = roundToolSchemas;
      if (!isOllama) reqBody.tool_choice = "auto";
    }
    // Snapshot context_usage for inclusion in round metrics
    let roundContextUsage: RoundMetrics["contextUsage"] | undefined;
    if (contextWindow > 0) {
      const snap = computeContextUsage(history, roundToolSchemas, contextWindow);
      roundContextUsage = snap;
    }

    // Track the current round object so we can attach metrics after the LLM call
    const currentRound: LlmContextFlowRound = {
      round: round + 1,
      createdAt: new Date().toISOString(),
      model: llm.openaiModel,
      messages: reqBody.messages as ReturnType<typeof serializeMessages>,
      ...(hasTools && roundToolSchemas.length > 0
        ? { tools: roundToolSchemas, tool_choice: "auto" as const }
        : {}),
    };
    onContext?.(currentRound);

    const llmStartTime = Date.now();

    // Debug: log payload size so we can diagnose slow local model requests
    {
      const bodyJson = JSON.stringify(reqBody);
      const sysMsgLen = history.find(m => m.role === "system")?.content?.length ?? 0;
      log.info(`LLM request round=${round + 1} model=${llm.openaiModel} bodySize=${bodyJson.length} sysPromptChars=${sysMsgLen} tools=${roundToolSchemas.length} → ${llm.openaiBaseUrl}`);
    }

    let contentText = "";
    let thinkingText = "";
    let toolCalls: OpenAIToolCall[] = [];
    let finishReason: string | null = null;
    let streamInterrupted = false;
    let repetitionStop: ParsedStream["repetition"];

    try {
      // Use a generous timeout (10 min) for LLM streaming — slow local models
      // (e.g. Ollama on CPU) can take several minutes for the first token.
      // Combine with the user-cancel abort signal so either can stop the request.
      const llmSignal = AbortSignal.any([
        abort.signal,
        AbortSignal.timeout(10 * 60 * 1000),
      ]);
      const requestUrl = isOllama
        ? `${llm.openaiBaseUrl.replace(/\/v1\/?$/, "")}/api/chat`
        : `${llm.openaiBaseUrl}/chat/completions`;
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llm.openaiApiKey}`,
        },
        body: JSON.stringify(reqBody),
        signal: llmSignal,
      });

      if (!response.ok) {
        const errText = await response.text();
        log.error(`LLM error ${response.status}: ${errText}`);

        // ── Context overflow recovery (pi-style: compact + retry once) ──
        // When the provider rejects the request because the context is too long,
        // aggressively compact the history and retry this round. Only attempt
        // recovery once — if the compacted context is still too large, surface
        // the error to the user rather than looping forever.
        if (
          isContextOverflowError(response.status, errText) &&
          !overflowRecoveryAttempted &&
          llm.contextWindow > 0
        ) {
          overflowRecoveryAttempted = true;
          log.warn(
            `Context overflow detected (status ${response.status}) — compacting history and retrying once for session ${sessionId}`,
          );
          onEvent?.({
            type: "steering",
            message: "Context too large for the model — compacting conversation history and retrying...",
          });

          // Force aggressive pruning: lower the threshold to trigger even if
          // the estimator thinks we're under 60% (the estimator is imprecise
          // and the provider clearly disagrees).
          // Force a Codex-style summarization: lower the trigger to fire even
          // if the estimator thinks we're under budget (the estimator is
          // imprecise and the provider clearly disagrees). Both passes summarize
          // — nothing is truncated into a stub.
          const emergencyUsage = computeContextUsage(history, activeSchemas, llm.contextWindow);
          if (emergencyUsage.ratio >= 0.30) {
            await pruneHistory(history, llm.contextWindow, activeSchemas, {
              summaryGenerator: (removed) => generateLLMConversationSummary(removed, llm, abort.signal),
            });
            compactActiveTurnHistory(history, activeSchemas, llm.contextWindow);
          }

          // Continue this round again (decrement round counter so we don't consume a round)
          round--;
          continue;
        }

        const friendlyMessage = formatLLMError(response.status, errText);
        onEvent?.({ type: "error", message: friendlyMessage, status: response.status });
        return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: false, hitMaxRounds: false, persisted };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent?.({ type: "error", message: "No response body from LLM" });
        return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: false, hitMaxRounds: false, persisted };
      }

      const parsed = isOllama
        ? await parseOllamaStream(reader as any, onEvent, abort.signal)
        : await parseOpenAIStream(reader as any, onEvent, abort.signal);
      clearEmptyResponseRecoveryPrompts();
      contentText = parsed.contentText;
      streamInterrupted = parsed.interrupted === true;
      thinkingText = parsed.thinkingText;
      toolCalls = parsed.toolCalls;
      finishReason = parsed.finishReason;
      repetitionStop = parsed.repetition;

      // Attach metrics to the round now that streaming is complete
      const durationMs = Date.now() - llmStartTime;
      const metrics: RoundMetrics = { durationMs };
      if (parsed.usage) {
        metrics.promptTokens = parsed.usage.prompt_tokens;
        metrics.completionTokens = parsed.usage.completion_tokens;
        metrics.totalTokens = parsed.usage.total_tokens;
        if (parsed.usage.completion_tokens > 0 && durationMs > 0) {
          metrics.tokensPerSecond = Math.round((parsed.usage.completion_tokens / (durationMs / 1000)) * 10) / 10;
        }
      } else {
        // Estimate completion tokens from text length when provider doesn't report usage
        const estimatedCompletionTokens = estimateTokens(contentText + thinkingText);
        if (estimatedCompletionTokens > 0 && durationMs > 0) {
          metrics.completionTokens = estimatedCompletionTokens;
          metrics.tokensPerSecond = Math.round((estimatedCompletionTokens / (durationMs / 1000)) * 10) / 10;
        }
      }
      if (roundContextUsage) metrics.contextUsage = roundContextUsage;
      currentRound.metrics = metrics;
    } catch (fetchErr) {
      clearEmptyResponseRecoveryPrompts();
      if (abort.signal.aborted) {
        log.info(`Agent loop cancelled during LLM streaming (round ${round})`);
        return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: true, hitMaxRounds: false, persisted };
      }
      // A transient transport failure (backend hung past undici's dispatcher
      // deadline, socket reset mid-handshake) is worth a bounded retry: a
      // healthy turn that dies at round 27 of 60 to a one-off blip should not
      // end as a bare error that the user has to manually continue. Re-run the
      // same round with the unchanged conversation; loop-top state consumed by
      // the failed attempt (tool quarantine, answer-only mode) is restored so
      // the retry behaves like the original round. Refused/DNS failures are
      // not retried — a dead backend stays dead.
      if (isTransientTransportError(fetchErr) && transportRetries < MAX_TRANSPORT_RETRIES) {
        transportRetries++;
        const waitMs = TRANSPORT_RETRY_BASE_DELAY_MS * transportRetries;
        log.warn(
          `LLM transport failure on round ${round} (${describeTransportError(fetchErr)}) — `
            + `retrying in ${waitMs}ms (attempt ${transportRetries}/${MAX_TRANSPORT_RETRIES})`,
        );
        onEvent?.({ type: "steering", message: `Model connection dropped — retrying (attempt ${transportRetries}/${MAX_TRANSPORT_RETRIES})…` });
        await sleepUntilAborted(waitMs, abort.signal);
        // Restore per-attempt state the failed round already consumed.
        forceFinalAnswer = answerOnlyRound || forceFinalAnswer;
        quarantinedToolNames = roundQuarantinedToolNames;
        round--;
        continue;
      }
      // An unreachable backend is a configuration problem, not a crash — report
      // it the same way an HTTP error is reported instead of throwing a raw
      // "fetch failed" up the stack.
      const connectionMessage = formatConnectionError(fetchErr, llm);
      if (connectionMessage) {
        log.error(`LLM transport failure: ${connectionMessage}`);
        onEvent?.({ type: "error", message: connectionMessage });
        return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: false, hitMaxRounds: false, persisted };
      }
      throw fetchErr;
    }

    fullContent += contentText;
    if (contentText.trim()) {
      emptyResponseRetries = 0;
      lastEmptyThinking = "";
    }

    // ── Track segments for interleaved rendering ──
    // Skip verbatim repeats. When a round produces no visible text the
    // empty-response recovery below re-issues the request, and a deterministic
    // provider reproduces the same reasoning word for word. Concatenating it
    // is what surfaces to the user as the model repeating itself inside a
    // single thinking block.
    if (thinkingText) {
      const last = segments[segments.length - 1];
      if (last?.type === "thinking") {
        if (!isVerbatimThinkingRepeat(last.content, thinkingText)) {
          segments[segments.length - 1] = { type: "thinking", content: last.content + thinkingText };
        }
      } else {
        segments.push({ type: "thinking", content: thinkingText });
      }
    }

    if (contentText) {
      const last = segments[segments.length - 1];
      if (last?.type === "text") {
        segments[segments.length - 1] = { type: "text", content: last.content + contentText };
      } else {
        segments.push({ type: "text", content: contentText });
      }
    }

    if (streamInterrupted || abort.signal.aborted) {
      if (contentText) history.push({ role: "assistant", content: contentText });
      log.info(`Agent loop cancelled during LLM streaming (round ${round})`);
      return {
        content: fullContent,
        executedToolCalls,
        segments,
        rounds: round + 1,
        aborted: true,
        hitMaxRounds: false,
        persisted,
      };
    }

    // ── Runaway repetition → discard and resample ──
    // Treat a repeating generation as a failed sampling attempt, not as a
    // terminal answer — the same way codex treats a stream that dies before
    // `response.completed`. There, only *completed* response items are ever
    // committed to history, so a failed attempt contributes nothing and the
    // retry re-derives the turn from the unchanged conversation. That is the
    // part that matters: the prefix leading into a loop is the exact context
    // the model was following when it fell in, so replaying it back is the
    // surest way to land in the same attractor again. The retry bound prevents
    // a genuinely broken backend from consuming the continuous-loop budget.
    if (repetitionStop) {
      const repeated = repetitionStop.source === "thinking" ? "reasoning" : "text";
      const cleanContent = repetitionStop.source === "content"
        ? contentText.slice(0, repetitionStop.startIndex)
        : contentText;
      const cleanThinking = repetitionStop.source === "thinking"
        ? thinkingText.slice(0, repetitionStop.startIndex)
        : thinkingText;

      log.warn(
        `Runaway repetition in ${repetitionStop.source} for session ${sessionId}: `
          + `${repetitionStop.copies} identical copies of a ${repetitionStop.unit.length}-char block — discarding generation`,
      );

      const canRecover =
        repetitionRecoveries < MAX_REPETITION_RECOVERIES && round + 1 < roundLimit;

      // Roll the whole attempt back out of the rendered transcript. On the last
      // attempt the clean prefix is re-added below as a best-effort salvage.
      discardLatestContentText(contentText);
      discardLatestThinkingText(thinkingText);
      contentText = canRecover ? "" : cleanContent;
      thinkingText = canRecover ? "" : cleanThinking;

      if (canRecover) {
        repetitionRecoveries++;
        repetitionResampleAttempt = repetitionRecoveries;
        // Nothing from the discarded generation enters `history`. The only
        // difference from the request that just failed is this instruction,
        // which clearEmptyResponseRecoveryPrompts() strips again once the
        // resample starts streaming.
        const recoveryPrompt: AgentMessage = {
          role: "system",
          content:
            `Your previous generation fell into verbatim repetition in its ${repeated} and was discarded. ` +
            `Do not repeat, recap, or extend that pattern. Continue from the useful evidence already in the conversation, ` +
            `change strategy if needed, and complete the user's request with a concise answer or a different structured tool call.`,
        };
        history.push(recoveryPrompt);
        emptyResponseRecoveryPrompts.add(recoveryPrompt);
        // The discarded generation already streamed tokens to subscribers; tell
        // any live accumulator mirroring this turn to roll back to the same
        // point so a reload doesn't persist the garbage.
        onEvent?.({ type: "content_rollback", contentLength: fullContent.length, segments: segments.length });
        continue;
      }

      if (cleanThinking) {
        const lastSegment = segments[segments.length - 1];
        if (lastSegment?.type === "thinking") {
          segments[segments.length - 1] = { type: "thinking", content: lastSegment.content + cleanThinking };
        } else {
          segments.push({ type: "thinking", content: cleanThinking });
        }
      }
      if (cleanContent) {
        fullContent += cleanContent;
        const lastSegment = segments[segments.length - 1];
        if (lastSegment?.type === "text") {
          segments[segments.length - 1] = { type: "text", content: lastSegment.content + cleanContent };
        } else {
          segments.push({ type: "text", content: cleanContent });
        }
      }
      // Same rollback for the final (non-recovering) salvage: the accumulator
      // must not keep the repeated wall the guard just cut.
      onEvent?.({ type: "content_rollback", contentLength: fullContent.length, segments: segments.length });

      // Recovery is intentionally quiet: retain any clean prefix and end with
      // the best usable result instead of exposing an internal loop guard as a
      // synthetic "Stopped" message or throwing a provider error.
      if (fullContent || thinkingText || segments.length > 0 || executedToolCalls.length > 0) {
        onPersist?.(
          sessionId,
          "assistant",
          fullContent,
          executedToolCalls.length > 0 ? JSON.stringify(executedToolCalls) : undefined,
          segments.length > 0 ? JSON.stringify(segments) : undefined,
          capThinking(thinkingText) || undefined,
        );
        persisted = true;
      }
      return {
        content: fullContent,
        executedToolCalls,
        segments,
        rounds: round + 1,
        aborted: false,
        hitMaxRounds: false,
        persisted,
      };
    }

    // ── Cross-round replayed-reasoning guard ──────────────────────────
    // A deterministic provider can replay its exact previous reasoning every
    // round while re-issuing the same (often quarantined) tool call. Nothing
    // upstream stops that: the per-round repetition guard only sees one copy
    // per stream, `isVerbatimThinkingRepeat` only checks back-to-back thinking
    // segments (tool groups sit between them), and the empty-response recovery
    // never runs because a tool call exists. This guard pairs a verbatim
    // thinking replay with the same tool-call signature and stops the turn
    // after a few rounds instead of burning the round budget on duplicates.
    const thinkingReplay =
      thinkingText.length >= MIN_REPEAT_THINKING_CHARS
      && isVerbatimThinkingRepeat(lastRoundThinking, thinkingText);
    const roundToolSignature = toolCalls.length > 0
      ? JSON.stringify(toolCalls.map(toolCallSignature).sort())
      : null;
    const sameCallAsLastRound =
      roundToolSignature !== null && roundToolSignature === lastRoundToolSignature;
    if (thinkingReplay && sameCallAsLastRound) {
      if (replayedLoopRounds === 0) {
        replayedLoopStartContent = fullContent.length;
        replayedLoopStartSegments = segments.length;
      }
      replayedLoopRounds++;
    } else {
      replayedLoopRounds = 0;
    }
    lastRoundThinking = thinkingText;
    // Update every round (null when the round made no calls) so the pairing
    // below is strictly "same call as the immediately preceding round".
    lastRoundToolSignature = roundToolSignature;

    if (replayedLoopRounds >= MAX_REPLAYED_THINKING_ROUNDS) {
      // Roll the loop's streamed text out of the transcript so the persisted
      // turn keeps the useful work, not the repeated reasoning. The reasoning
      // itself never belonged in the visible transcript anyway.
      fullContent = fullContent.slice(0, replayedLoopStartContent);
      segments.splice(replayedLoopStartSegments);
      onEvent?.({ type: "content_rollback", contentLength: fullContent.length, segments: segments.length });

      // Steer-first: nudge the model back on track instead of killing the turn.
      // Only fall back to stopping once the steer allowance is exhausted (or we
      // have no budget left to continue), so a deterministic provider stuck in a
      // replay gets a corrective directive before the hard backstop.
      if (replaySteerings < MAX_REPLAY_STEERINGS && round + 1 < roundLimit) {
        replaySteerings++;
        log.warn(
          `Model replayed the same reasoning + tool call for ${replayedLoopRounds} consecutive rounds for session ${sessionId} — steering the turn back on track (${replaySteerings}/${MAX_REPLAY_STEERINGS})`,
        );
        const steerPrompt: AgentMessage = {
          role: "system",
          content:
            `You are replaying the same reasoning and tool call (${roundToolSignature ?? "unknown call"}) ` +
            `for ${replayedLoopRounds} consecutive rounds without making progress. Stop that. Do not re-issue that ` +
            `call and do not repeat that reasoning. Change approach: take a smaller, different next step, verify the ` +
            `last tool's actual output before calling anything, or give the user a final answer now.`,
        };
        history.push(steerPrompt);
        emptyResponseRecoveryPrompts.add(steerPrompt);
        onEvent?.({
          type: "steering",
          message:
            "Steering: the model repeated the same reasoning and tool call every round. It has been asked to change approach instead of looping.",
        });
        // Reset the counter so a model that listens gets fresh chances; the
        // loop continues on the corrected context.
        replayedLoopRounds = 0;
        replayedLoopStartContent = fullContent.length;
        replayedLoopStartSegments = segments.length;
        continue;
      }

      log.warn(
        `Model replayed the same reasoning + tool call for ${replayedLoopRounds} consecutive rounds for session ${sessionId} — stopping the turn`,
      );
      onEvent?.({
        type: "steering",
        message:
          "Stopped: the model kept repeating the same reasoning and tool call even after being steered, instead of making progress.",
      });
      if (fullContent || segments.length > 0 || executedToolCalls.length > 0) {
        onPersist?.(
          sessionId,
          "assistant",
          fullContent,
          executedToolCalls.length > 0 ? JSON.stringify(executedToolCalls) : undefined,
          segments.length > 0 ? JSON.stringify(segments) : undefined,
          undefined,
        );
        persisted = true;
      }
      return {
        content: fullContent,
        executedToolCalls,
        segments,
        rounds: round + 1,
        aborted: false,
        hitMaxRounds: false,
        persisted,
      };
    }

    // ── Model returned tool calls → queue & execute ──
    if (toolCalls.length > 0) {
      emptyResponseRetries = 0;
      lastEmptyThinking = "";

      const originalToolCallCount = toolCalls.length;
      const uniqueToolCalls: OpenAIToolCall[] = [];
      const signaturesInRound = new Set<string>();
      for (const toolCall of toolCalls) {
        const signature = toolCallSignature(toolCall);
        if (signaturesInRound.has(signature)) continue;
        signaturesInRound.add(signature);
        uniqueToolCalls.push(toolCall);
      }
      const duplicateToolCallCount = originalToolCallCount - uniqueToolCalls.length;
      const excessToolCallCount = Math.max(0, uniqueToolCalls.length - MAX_TOOL_CALLS_PER_ROUND);
      toolCalls = uniqueToolCalls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
      if (duplicateToolCallCount > 0 || excessToolCallCount > 0) {
        const collapsedKinds = [
          duplicateToolCallCount > 0 ? `${duplicateToolCallCount} duplicate` : "",
          excessToolCallCount > 0 ? `${excessToolCallCount} excess` : "",
        ].filter(Boolean).join(" and ");
        log.warn(
          `Collapsed ${collapsedKinds} tool calls in one provider round for session ${sessionId}`,
        );
        onEvent?.({
          type: "steering",
          message: `Collapsed ${collapsedKinds} tool calls from one model response`,
        });
      }

      if (finishReason && finishReason !== "tool_calls") {
        log.warn(
          `LLM returned ${toolCalls.length} tool call(s) with finish_reason="${finishReason}" — executing anyway`,
        );
      }

      const ignoredQuarantineCalls = toolCalls.filter((toolCall) =>
        roundQuarantinedToolNames.has(fromOpenAIName(toolCall.function.name))
      );
      if (ignoredQuarantineCalls.length > 0) {
        const ignoredNames = [...new Set(
          ignoredQuarantineCalls.map((toolCall) => fromOpenAIName(toolCall.function.name)),
        )].join(", ");
        discardLatestContentText(contentText);
        const persistentQuarantineNames = new Set(roundQuarantinedToolNames);
        for (const toolCall of ignoredQuarantineCalls) {
          persistentQuarantineNames.add(fromOpenAIName(toolCall.function.name));
        }
        quarantinedToolNames = persistentQuarantineNames;
        const message =
          `Provider repeated an unavailable tool call (${ignoredNames}); rejected it and kept working`;
        log.warn(`${message} for session ${sessionId}`);
        onEvent?.({ type: "steering", message });
        contentText = "";
        history.push({
          role: "assistant",
          content: "",
          tool_calls: ignoredQuarantineCalls,
          thinking: capThinking(thinkingText),
        });
        const ignoredCallIds: string[] = [];
        for (const toolCall of ignoredQuarantineCalls) {
          const tool = fromOpenAIName(toolCall.function.name);
          let args: unknown;
          try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }
          const resultData = { quarantined: true, reason: "tool_unavailable" };
          const now = Date.now();
          ignoredCallIds.push(toolCall.id);
          executedToolCalls.push({
            callId: toolCall.id,
            tool,
            args,
            ok: false,
            message,
            data: resultData,
            startedAt: now,
            completedAt: now,
          });
          history.push({
            role: "tool",
            content: JSON.stringify({ ok: false, message, data: resultData }),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
          });
          onEvent?.({
            type: "tool_result",
            call_id: toolCall.id,
            tool,
            ok: false,
            message,
            data: resultData,
          });
        }
        if (ignoredCallIds.length > 0) {
          const lastSegment = segments[segments.length - 1];
          if (lastSegment?.type === "toolGroup") {
            segments[segments.length - 1] = {
              type: "toolGroup",
              callIds: [...new Set([...lastSegment.callIds, ...ignoredCallIds])],
            };
          } else {
            segments.push({ type: "toolGroup", callIds: ignoredCallIds });
          }
        }
        history.push({
          role: "system",
          content:
            `The provider attempted to call ${ignoredNames} even though it was unavailable. ` +
            `Jait rejected that call without ending the turn, and the tool remains unavailable for the next response. ` +
            `Keep working with the available tools or answer from the evidence already collected. Do not repeat the rejected call.`,
        });
        toolCalls = toolCalls.filter((toolCall) =>
          !roundQuarantinedToolNames.has(fromOpenAIName(toolCall.function.name))
        );
        if (toolCalls.length === 0) continue;
      }

      // ── Overlapping read-range loop detection ──
      // Exact signatures cannot catch a model orbiting the same file window
      // while shifting startLine/endLine by a few lines. Track actual coverage
      // per file and intervene only after several consecutive calls add almost
      // no new lines. This preserves normal pagination and a small number of
      // defensive re-reads while bounding range jitter.
      const stalledReads = toolCalls
        .map((toolCall) => trackReadProgress(readCoverageByTarget, toolCall))
        .filter((read): read is ReadRange & { lowProgressStreak: number } =>
          read !== null && read.lowProgressStreak >= MAX_LOW_PROGRESS_READ_STREAK
        );
      if (stalledReads.length > 0) {
        const stalledTargets = [...new Set(stalledReads.map((read) => read.target))];
        const stalledToolNames = new Set(stalledReads.map((read) => read.toolName));
        quarantinedToolNames = stalledToolNames;
        discardLatestContentText(contentText);
        const message =
          `Detected repeated overlapping reads with negligible new coverage (${stalledTargets.join(", ")}); `
          + `temporarily quarantining ${[...stalledToolNames].join(", ")} for the next model round`;
        log.warn(`${message} for session ${sessionId}`);
        onEvent?.({ type: "steering", message });
        history.push({
          role: "system",
          content:
            `You repeatedly read overlapping line ranges from the same file without gaining meaningful new coverage. `
            + `Jait skipped the latest redundant read and made ${[...stalledToolNames].join(", ")} unavailable for your next response. `
            + `Use the results already in the conversation, choose a different tool or file, or answer the user. `
            + `If more of this file is genuinely needed later, read a substantially new non-overlapping range.`,
        });
        continue;
      }

      // ── Duplicate tool-call loop detection ──
      // If the model emits the exact same tool call(s) — same name(s), same
      // args — round after round, it's stuck: no new information is arriving
      // to change its decision, so letting it repeat indefinitely just burns
      // rounds/context until the provider degenerates into garbage output.
      // Nudge it to break out; if it ignores the nudge, skip the exact
      // duplicate and quarantine that tool for one provider round.
      {
        const currentCallSignatures = toolCalls.map(toolCallSignature);
        const ignoredInterventionSignatures = new Set(
          currentCallSignatures.filter((signature) => duplicateInterventionSignatures.has(signature)),
        );
        if (duplicateInterventionSignatures.size > 0 && ignoredInterventionSignatures.size === 0) {
          duplicateInterventionSignatures.clear();
        }
        const callSignature = JSON.stringify([...currentCallSignatures].sort());
        if (callSignature === lastToolCallSignature) {
          duplicateCallStreak++;
        } else {
          lastToolCallSignature = callSignature;
          duplicateCallStreak = 0;
        }

        const repeatedAcrossTurn = new Set<string>();
        /** Signatures past a hard limit — skipped outright, never merely nudged. */
        const exhaustedSignatures = new Set<string>();
        for (const signature of currentCallSignatures) {
          const occurrences = (toolCallOccurrences.get(signature) ?? 0) + 1;
          toolCallOccurrences.set(signature, occurrences);
          if (occurrences >= MAX_SAME_TOOL_CALLS_PER_TURN) repeatedAcrossTurn.add(signature);

          const lifetime = (toolCallLifetimeOccurrences.get(signature) ?? 0) + 1;
          toolCallLifetimeOccurrences.set(signature, lifetime);
          if (lifetime >= MAX_SAME_TOOL_CALLS_PER_TURN_HARD) exhaustedSignatures.add(signature);

          // A call that keeps returning the same error is never worth another
          // attempt — the tool is broken or misused for the whole turn.
          if ((repeatedFailureCounts.get(signature)?.count ?? 0) >= MAX_IDENTICAL_FAILURES_PER_CALL) {
            exhaustedSignatures.add(signature);
          }
        }

        if (
          duplicateCallStreak >= MAX_DUPLICATE_CALL_STREAK ||
          repeatedAcrossTurn.size > 0 ||
          exhaustedSignatures.size > 0 ||
          ignoredInterventionSignatures.size > 0
        ) {
          const repeatedSignatures = new Set([
            ...repeatedAcrossTurn,
            ...exhaustedSignatures,
            ...ignoredInterventionSignatures,
          ]);
          const loopSignatures = repeatedSignatures.size > 0
            ? repeatedSignatures
            : new Set(currentCallSignatures);
          const repeatedNames = toolCalls
            .filter((toolCall) => loopSignatures.has(toolCallSignature(toolCall)))
            .map((toolCall) => fromOpenAIName(toolCall.function.name));
          const names = [...new Set(
            repeatedNames.length > 0
              ? repeatedNames
              : toolCalls.map((toolCall) => fromOpenAIName(toolCall.function.name)),
          )].join(", ");

          if (
            ignoredInterventionSignatures.size > 0 ||
            exhaustedSignatures.size > 0 ||
            duplicateCallInterventions >= MAX_DUPLICATE_CALL_INTERVENTIONS
          ) {
            const quarantinedCalls = toolCalls.filter((toolCall) =>
              loopSignatures.has(toolCallSignature(toolCall))
            );
            const quarantinedNames = new Set(
              quarantinedCalls.map((toolCall) => fromOpenAIName(toolCall.function.name)),
            );
            quarantinedToolNames = quarantinedNames;
            duplicateInterventionSignatures = new Set(loopSignatures);
            duplicateCallStreak = 0;
            for (const signature of loopSignatures) toolCallOccurrences.set(signature, 0);

            const message =
              `Skipped repeated tool call (${names}); ` +
              `temporarily quarantining ${[...quarantinedNames].join(", ")} for the next model round`;
            discardLatestContentText(contentText);
            log.warn(`${message} for session ${sessionId}`);
            onEvent?.({ type: "steering", message });

            history.push({
              role: "assistant",
              content: "",
              tool_calls: quarantinedCalls,
              thinking: capThinking(thinkingText),
            });
            const callIds: string[] = [];
            for (const toolCall of quarantinedCalls) {
              const tool = fromOpenAIName(toolCall.function.name);
              let args: unknown;
              try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }
              const resultData = { quarantined: true, reason: "duplicate_call" };
              const now = Date.now();
              callIds.push(toolCall.id);
              executedToolCalls.push({
                callId: toolCall.id,
                tool,
                args,
                ok: false,
                message,
                data: resultData,
                startedAt: now,
                completedAt: now,
              });
              history.push({
                role: "tool",
                content: JSON.stringify({ ok: false, message, data: resultData }),
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
              });
              onEvent?.({
                type: "tool_result",
                call_id: toolCall.id,
                tool,
                ok: false,
                message,
                data: resultData,
              });
            }
            if (callIds.length > 0) {
              const lastSegment = segments[segments.length - 1];
              if (lastSegment?.type === "toolGroup") {
                segments[segments.length - 1] = {
                  type: "toolGroup",
                  callIds: [...new Set([...lastSegment.callIds, ...callIds])],
                };
              } else {
                segments.push({ type: "toolGroup", callIds });
              }
            }
            // When the loop is a call that keeps *failing*, "you already have
            // that result" is the wrong explanation and the model will keep
            // trying. Name the error instead, so it switches approach.
            const stuckError = [...loopSignatures]
              .map((signature) => repeatedFailureCounts.get(signature))
              .find((entry) => entry && entry.count >= MAX_IDENTICAL_FAILURES_PER_CALL);
            history.push({
              role: "system",
              content: stuckError
                ? `That call kept failing with the same error and was skipped: "${stuckError.message}". `
                  + `Retrying it will produce the same failure, so ${[...quarantinedNames].join(", ")} is unavailable for your next response. `
                  + `Fix the cause if the error tells you how (a wrong path or argument), otherwise reach the goal a different way — another tool, a terminal command, or an answer from what you already have.`
                : `The exact repeated call was skipped because its result is already in the conversation. `
                  + `The tool(s) ${[...quarantinedNames].join(", ")} are unavailable for your next response only. `
                  + `Keep working: use another available tool, change strategy, delegate, or answer from the evidence already collected. Do not repeat the skipped call.`,
            });
            continue;
          }

          duplicateCallInterventions++;
          duplicateInterventionSignatures = new Set(loopSignatures);
          duplicateCallStreak = 0;
          for (const signature of currentCallSignatures) toolCallOccurrences.set(signature, 0);
          log.warn(
            `Detected repeated identical tool call (${names}) for session ${sessionId} — nudging model to break the loop ` +
              `(intervention ${duplicateCallInterventions}/${MAX_DUPLICATE_CALL_INTERVENTIONS})`,
          );
          onEvent?.({ type: "steering", message: `Detected a repeated tool call (${names}) — redirecting` });
          discardLatestContentText(contentText);
          history.push({
            role: "system",
            content:
              `You just called the same tool with the exact same arguments again (${names}) — you already have that result from a previous round; repeating it will not give you new information. ` +
              `Stop repeating this call. Either take a different action to make progress, delegate the work if you can't proceed directly yourself, or give the user a final answer using what you already know.`,
          });
          continue;
        }
      }

      // Push assistant message with tool_calls to history (persist thinking so
      // the model keeps reasoning continuity across tool rounds).
      history.push({
        role: "assistant",
        content: contentText || "",
        tool_calls: toolCalls,
        thinking: capThinking(thinkingText),
      });

      // Enqueue the bounded, deduplicated tool calls for this round.
      for (const tc of toolCalls) {
        const internalName = fromOpenAIName(tc.function.name);
        queue.enqueue(tc, ToolCallPriority.Normal, isParallelSafe(internalName));
      }

      // ── Swarm mode: force delegation if the coordinator only ever reads ──
      // The orchestration allowlist blocks mutating tools but not reads, so a
      // coordinator can stay "compliant" while never calling the agent tool
      // and just investigating everything itself. Nudge it once it's made
      // several direct calls with nothing delegated yet.
      if (mode === "swarm") {
        if (toolCalls.some((tc) => isAgentSpawnToolName(fromOpenAIName(tc.function.name)))) {
          swarmHasDelegated = true;
        }
        if (!swarmHasDelegated) {
          swarmUndelegatedReadCount += toolCalls.length;
          if (swarmUndelegatedReadCount >= SWARM_MAX_UNDELEGATED_READS && !swarmDelegationNudged) {
            swarmDelegationNudged = true;
            log.warn(
              `Swarm coordinator made ${swarmUndelegatedReadCount} direct call(s) without delegating any work — forcing delegation for session ${sessionId}`,
            );
            onEvent?.({ type: "steering", message: "Coordinator hasn't delegated yet — prompting it to hand off work to a specialist" });
            history.push({
              role: "system",
              content:
                `You've made ${swarmUndelegatedReadCount} direct read/search calls in this turn without delegating any work to a specialist. ` +
                `Swarm mode exists to hand implementation and deep investigation work to a team — reading everything yourself defeats the point. ` +
                `On your next turn, either delegate the remaining work with the agent tool (name the team/roles you're using), or, if you already have enough context, give the user a final answer now instead of continuing to read.`,
            });
          }
        }
      }

      // Track tool calls as a segment group for interleaved rendering
      const callIds = toolCalls.map(tc => tc.id);
      const lastSeg = segments[segments.length - 1];
      if (lastSeg?.type === "toolGroup") {
        // Extend existing group (shouldn't normally happen, but defensive)
        const merged = new Set([...lastSeg.callIds, ...callIds]);
        segments[segments.length - 1] = { type: "toolGroup", callIds: [...merged] };
      } else {
        segments.push({ type: "toolGroup", callIds });
      }

      // ── Plan-mode, Ask-mode & Swarm-mode interception ──
      // In plan mode, mutating tools are captured as plan actions.
      // In ask mode, any tool that slipped through is blocked.
      // In swarm mode, any non-orchestration tool is blocked so the
      // coordinator is forced to delegate implementation work to sub-agents.
      if (mode === "plan" || mode === "ask" || mode === "swarm") {
        const intercepted: QueuedToolCall[] = [];
        const passthrough: QueuedToolCall[] = [];

        while (!queue.isEmpty) {
          const batch = queue.dequeueBatch(false);
          for (const item of batch) {
            const name = fromOpenAIName(item.toolCall.function.name);
            const isMutating = MUTATING_TOOLS.has(name);

            if (mode === "ask" && !ASK_MODE_TOOLS.has(name)) {
              // Ask mode: block non-read tools, return error to LLM
              intercepted.push(item);
            } else if (mode === "swarm" && !SWARM_ORCHESTRATION_TOOLS.has(name)) {
              // Swarm mode: block implementation tools, force delegation
              intercepted.push(item);
            } else if (mode === "plan" && isMutating) {
              // Plan mode: capture mutating tools as planned actions
              intercepted.push(item);
            } else {
              passthrough.push(item);
            }
          }
        }

        // Handle intercepted tool calls
        for (const item of intercepted) {
          const tc = item.toolCall;
          const name = fromOpenAIName(tc.function.name);
          let args: unknown;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

          if (mode === "ask") {
            // Return an error to the LLM
            const msg = `Tool "${name}" is not available in Ask mode. Only read-only tools can be used. Suggest the user switch to Agent or Plan mode for this action.`;
            history.push({
              role: "tool",
              content: JSON.stringify({ ok: false, message: msg }),
              tool_call_id: tc.id,
              name: tc.function.name,
            });
            executedToolCalls.push({
              callId: tc.id,
              tool: name,
              args,
              ok: false,
              message: msg,
              startedAt: Date.now(),
              completedAt: Date.now(),
            });
          } else if (mode === "swarm") {
            // Swarm mode: block implementation tools and force delegation.
            // The coordinator must hand this work to a specialist sub-agent.
            const msg = `Tool "${name}" is not available to the Swarm coordinator. In Swarm mode the coordinator only orchestrates — it cannot edit files, run commands, or mutate state directly. Delegate this work to a specialist sub-agent with the agent tool, granting it the tools it needs via allowedTools (e.g. "file.read,file.list,file.write,file.patch,edit,terminal.run,search,web.search,web.fetch").`;
            history.push({
              role: "tool",
              content: JSON.stringify({ ok: false, message: msg }),
              tool_call_id: tc.id,
              name: tc.function.name,
            });
            executedToolCalls.push({
              callId: tc.id,
              tool: name,
              args,
              ok: false,
              message: msg,
              startedAt: Date.now(),
              completedAt: Date.now(),
            });
          } else {
            // Plan mode: capture as planned action
            const action: PlannedAction = {
              id: tc.id,
              tool: name,
              args,
              description: `${name}(${JSON.stringify(args).slice(0, 200)})`,
              order: plannedActions.length,
              status: "pending",
            };
            plannedActions.push(action);
            onEvent?.({ type: "plan_action", action });

            // Tell the LLM the action was captured
            const msg = `[PLANNED] Action "${name}" has been added to the plan (step ${action.order + 1}). It will execute after user approval. Continue analyzing and propose more actions if needed.`;
            history.push({
              role: "tool",
              content: JSON.stringify({ ok: true, message: msg }),
              tool_call_id: tc.id,
              name: tc.function.name,
            });
            executedToolCalls.push({
              callId: tc.id,
              tool: name,
              args,
              ok: true,
              message: msg,
              startedAt: Date.now(),
              completedAt: Date.now(),
            });
          }
        }

        // Re-enqueue passthrough items
        for (const item of passthrough) {
          queue.enqueue(item.toolCall, item.priority, item.parallelSafe);
        }
      }

      // ── Process the queue ──
      while (!queue.isEmpty) {
        if (abort.signal.aborted) {
          // Mark remaining queued calls as cancelled
          while (!queue.isEmpty) {
            const batch = queue.dequeueBatch(false);
            for (const item of batch) {
              let rArgs: unknown;
              try { rArgs = JSON.parse(item.toolCall.function.arguments); } catch { rArgs = {}; }
              executedToolCalls.push({
                callId: item.toolCall.id,
                tool: fromOpenAIName(item.toolCall.function.name),
                args: rArgs,
                ok: false,
                message: "Cancelled",
                startedAt: Date.now(),
                completedAt: Date.now(),
              });
            }
          }
          return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: true, hitMaxRounds: false, persisted };
        }

        const batch = queue.dequeueBatch(parallel);

        if (batch.length === 1) {
          // Sequential execution (single item or non-parallel-safe)
          const item = batch[0]!;
          const { executed, historyEntry } = await executeOneToolCall({
            tc: item.toolCall,
            sessionId,
            auth,
            signal: abort.signal,
            toolRegistry,
            maxRetries,
            onEvent,
            executeTool,
          });
          recordToolCallOutcome(repeatedFailureCounts, item.toolCall, executed);
          executedToolCalls.push(executed);
          history.push(historyEntry);
        } else {
          // ── Parallel execution ──
          log.info(`Executing ${batch.length} tool calls in parallel`);

          // Swarm round: when 2+ agent-spawn calls land in the same parallel
          // batch, give them a shared mailbox (agent.message) so the specialists
          // can post notes to / read from each other while they run.
          const agentSpawnCount = batch.filter((item) => isAgentSpawnToolName(fromOpenAIName(item.toolCall.function.name))).length;
          const swarmRoundId = agentSpawnCount >= 2 ? randomUUID() : undefined;
          if (swarmRoundId) createSwarmRound(swarmRoundId, agentSpawnCount);

          try {
            // allSettled, not all: every tool_call in this batch must end up with
            // exactly one matching tool message in history. Promise.all would
            // discard all sibling results the moment one call rejected, leaving
            // the assistant's tool_calls message half-answered — which providers
            // reject on the next round.
            const results = await Promise.allSettled(
              batch.map((item) =>
                executeOneToolCall({
                  tc: item.toolCall,
                  sessionId,
                  auth,
                  signal: abort.signal,
                  toolRegistry,
                  maxRetries,
                  onEvent,
                  executeTool,
                  swarmRoundId,
                }),
              ),
            );
            for (const [index, outcome] of results.entries()) {
              if (outcome.status === "fulfilled") {
                recordToolCallOutcome(
                  repeatedFailureCounts,
                  batch[index]!.toolCall,
                  outcome.value.executed,
                );
                executedToolCalls.push(outcome.value.executed);
                history.push(outcome.value.historyEntry);
                continue;
              }
              const item = batch[index]!;
              const failed = failedToolCallOutcome(item.toolCall, outcome.reason);
              recordToolCallOutcome(repeatedFailureCounts, item.toolCall, failed.executed);
              log.error(`Tool call ${item.toolCall.function.name} rejected unexpectedly: ${failed.executed.message}`);
              onEvent?.({
                type: "tool_result",
                call_id: item.toolCall.id,
                tool: failed.executed.tool,
                ok: false,
                message: failed.executed.message,
              });
              executedToolCalls.push(failed.executed);
              history.push(failed.historyEntry);
            }
          } finally {
            if (swarmRoundId) endSwarmRound(swarmRoundId);
          }
        }
      }

      // ── Dynamic schema expansion ──
      // If any tool call was tools.search/tools.list, check if the result
      // contains new tool schemas that should be injected for subsequent rounds.
      for (const exec of executedToolCalls) {
        if (exec.tool === "tools.search" && exec.ok && exec.data) {
          const data = exec.data as { matches?: Array<{ name?: string; description?: string; parameters?: unknown }> };
          if (Array.isArray(data.matches)) {
            for (const match of data.matches) {
              if (match.name && match.description && match.parameters) {
                const oaiName = toOpenAIName(match.name);
                // In ask mode, only add read-only tools
                if (mode === "ask" && !ASK_MODE_TOOLS.has(match.name)) continue;
                if (!activeSchemaNames.has(oaiName) && !disabledTools?.has(match.name)) {
                  activeSchemas.push({
                    type: "function",
                    function: {
                      name: oaiName,
                      description: match.description,
                      parameters: match.parameters,
                    },
                  });
                  activeSchemaNames.add(oaiName);
                  log.info(`Dynamic schema expansion: added ${match.name}`);
                }
              }
            }
          }
        }
      }

      // ── Investigation-without-progress detection ──
      // Everything above catches a model repeating itself. This catches the
      // opposite shape: a model that never repeats a call and never lands
      // either — one more file read, one more search, round after round, with
      // nothing edited, nothing run, and no plan step closed. Escalate in two
      // stages so a genuinely long investigation isn't cut off at the first
      // sign of quiet: re-anchor on the goal first, force an answer only if
      // the model keeps circling after that.
      {
        const investigationOnlyRound = toolCalls.every((toolCall) =>
          ASK_MODE_TOOLS.has(fromOpenAIName(toolCall.function.name)),
        );
        const completedNow = getSessionTodos(sessionId)
          .filter((todo) => todo.status === "completed").length;
        const planAdvanced = completedNow > completedTodoCount;
        completedTodoCount = completedNow;

        if (investigationOnlyRound && !planAdvanced) {
          investigationOnlyStreak++;
        } else {
          investigationOnlyStreak = 0;
          if (convergePrompt) {
            const convergeIndex = history.indexOf(convergePrompt);
            if (convergeIndex >= 0) history.splice(convergeIndex, 1);
            convergePrompt = null;
          }
        }

        const planSnapshot = renderPlanSnapshot(getSessionTodos(sessionId));
        if (investigationOnlyStreak >= FORCE_ANSWER_ROUND_STREAK) {
          forceFinalAnswer = true;
          investigationOnlyStreak = 0;
          const message =
            `No state change in ${FORCE_ANSWER_ROUND_STREAK} consecutive rounds — withholding tools for one round to force an answer`;
          log.warn(`${message} for session ${sessionId}`);
          onEvent?.({ type: "steering", message });
          history.push({
            role: "system",
            content:
              `You have spent ${FORCE_ANSWER_ROUND_STREAK} consecutive rounds gathering information without changing anything or completing a plan step. ` +
              `No tools are available on your next response. Answer the user now using the evidence already in this conversation: ` +
              `state what you found, what you concluded, and — if the task is unfinished — exactly what remains and what is blocking it.` +
              (planSnapshot ? `\n\n${planSnapshot}` : ""),
          });
        } else if (investigationOnlyStreak >= CONVERGE_NUDGE_ROUND_STREAK && !convergePrompt) {
          const message =
            `No state change in ${investigationOnlyStreak} consecutive rounds — re-anchoring the model on the goal`;
          log.warn(`${message} for session ${sessionId}`);
          onEvent?.({ type: "steering", message });
          convergePrompt = {
            role: "system",
            content:
              `The last ${investigationOnlyStreak} rounds were all information gathering — nothing was edited, no command was run, and no plan step was completed. ` +
              `Investigation is not the goal; finishing the user's request is. On your next response, commit: take the concrete action that moves the task forward, ` +
              `or give the user your answer. If you cannot decide what to do next, say so and explain what is blocking you rather than reading more.` +
              (planSnapshot ? `\n\n${planSnapshot}` : ""),
          };
          history.push(convergePrompt);
        }
      }

      // Loop continues — LLM sees results and decides next
      continue;
    }

    // ── Plain-text tool call detection & re-prompting ──
    // Some local models (e.g. qwen, llama) emit tool calls as plain text instead
    // of using structured function_call format. Detect and re-prompt up to 2 times.
    if (toolCalls.length === 0 && contentText && hasTools) {
      const detected = detectPlainTextToolCalls(contentText, activeSchemaNames);
      if (detected && plainTextRetries < MAX_PLAIN_TEXT_RETRIES) {
        plainTextRetries++;
        log.warn(`Plain-text tool call detected in content (attempt ${plainTextRetries}): "${detected.name}" — re-prompting model to use proper format`);
        onEvent?.({ type: "steering", message: `Detected plain-text tool call "${detected.name}" — correcting model` });
        history.push({ role: "assistant", content: contentText });
        history.push({
          role: "system",
          content: `You just wrote a tool call as plain text in your response instead of using the proper function calling format. Do NOT write tool names or JSON arguments in your text. Instead, invoke tools using the structured tool_calls mechanism provided by the API. Re-do your last action using a proper tool call now.`,
        });
        continue;
      }
    }

    // ── Truncation recovery ──
    // Reasoning models (e.g. gpt-5) count hidden reasoning toward the output
    // budget and frequently hit the completion limit, returning
    // finish_reason="length" with the visible answer cut off mid-sentence or
    // mid-thinking. Rather than presenting the fragment as a finished reply,
    // transparently continue the generation so the user gets the whole answer.
    if (
      finishReason === "length" &&
      toolCalls.length === 0 &&
      lengthContinuations < MAX_LENGTH_CONTINUATIONS
    ) {
      // A model that ran out of budget while looping is not going to "resume"
      // into anything useful — "continue where you left off" just feeds the
      // loop back in and burns another continuation. Checking the whole turn
      // (not just this round) catches a loop that only became obvious across
      // continuations, e.g. one whose repeating unit is longer than a single
      // response. Reasoning counts too: a model that loops in its thinking
      // until the cap leaves `fullContent` clean, so scanning visible text
      // alone would wave the continuation straight through.
      const turnThinking = segments
        .filter((segment): segment is { type: "thinking"; content: string } => segment.type === "thinking")
        .map((segment) => segment.content)
        // Joined without a separator: a loop that spans two continuation rounds
        // is only periodic if nothing is injected at the seam.
        .join("");
      const degenerate = findDegenerateRepetition(fullContent)
        ?? findDegenerateRepetition(turnThinking);
      if (degenerate) {
        log.warn(
          `Response hit the output token limit while repeating itself `
            + `(${degenerate.copies} copies) for session ${sessionId} — not continuing`,
        );
        onEvent?.({
          type: "steering",
          message: "Response hit the output token limit while repeating itself — stopping",
        });
      } else {
        lengthContinuations++;
        log.warn(
          `Response truncated (finish_reason="length") — auto-continuing ${lengthContinuations}/${MAX_LENGTH_CONTINUATIONS} for session ${sessionId}`,
        );
        onEvent?.({
          type: "steering",
          message: `Response hit the output token limit — continuing (${lengthContinuations}/${MAX_LENGTH_CONTINUATIONS})`,
        });
        // Preserve whatever visible text arrived so the model can resume after it.
        if (contentText) {
          history.push({ role: "assistant", content: contentText });
        }
        history.push({
          role: "system",
          content:
            "Your previous response was cut off because it reached the output token limit. Resume exactly where you left off — do not repeat any text you already produced, do not restart, and do not re-summarize. Continue seamlessly from the final character of your previous output.",
        });
        continue;
      }
    }

    if (!contentText.trim() && toolCalls.length === 0) {
      // A thinking-only response lands here: the model reasoned but produced
      // neither an answer nor a tool call. Retrying only helps if the next
      // request differs from the one that just failed — the recovery prompt
      // added below is stripped again by clearEmptyResponseRecoveryPrompts()
      // as soon as the next stream parses, so on its own it leaves the payload
      // byte-identical and a deterministic provider replays the same
      // reasoning. Record the reasoning as a real assistant turn (which
      // survives that cleanup) so each attempt sees new context.
      const repeatedThinking = isVerbatimThinkingRepeat(lastEmptyThinking, thinkingText);
      lastEmptyThinking = thinkingText;

      // Graceful completion path: emit a real assistant message so the turn
      // never ends stuck on an empty thinking bubble.
      const finishWithFallback = (reason: string): AgentLoopResult => {
        const fallback = buildEmptyResponseFallback(executedToolCalls);
        log.warn(`${reason} for session ${sessionId}`);
        onEvent?.({ type: "token", content: fallback });
        fullContent += fallback;
        history.push({ role: "assistant", content: fallback, thinking: capThinking(thinkingText) });
        segments.push({ type: "text", content: fallback });
        const tcJson = executedToolCalls.length > 0 ? JSON.stringify(executedToolCalls) : undefined;
        const segJson = JSON.stringify(segments);
        onPersist?.(sessionId, "assistant", fullContent, tcJson, segJson, capThinking(thinkingText) || undefined);
        persisted = true;
        const planResult =
          mode === "plan" && plannedActions.length > 0
            ? { id: planId, summary: fallback, actions: plannedActions }
            : undefined;
        return {
          content: fullContent,
          executedToolCalls,
          segments,
          rounds: round + 1,
          aborted: false,
          hitMaxRounds: false,
          persisted,
          plan: planResult,
        };
      };

      // Some cloud model servers stream elapsed-time progress into the
      // reasoning channel; when that is all a round delivers, retrying only
      // replays the identical heartbeat. Skip straight to a graceful fallback.
      if (isTimingNoiseReasoning(thinkingText)) {
        return finishWithFallback(
          `Provider returned only a timing heartbeat (reasoning="${String(thinkingText).slice(0, 60)}") with no answer — finishing with a graceful fallback`,
        );
      }

      if (repeatedThinking) {
        const canRecover =
          emptyResponseRetries < MAX_EMPTY_RESPONSE_RETRIES && round + 1 < roundLimit;
        if (canRecover) {
          emptyResponseRetries++;
          const message =
            `Model repeated the same reasoning without answering — rejecting the duplicate and retrying (${emptyResponseRetries}/${MAX_EMPTY_RESPONSE_RETRIES})`;
          log.warn(`${message} for session ${sessionId}`);
          onEvent?.({ type: "steering", message });
          const recoveryPrompt: AgentMessage = {
            role: "system",
            content:
              "Your previous reasoning was an exact duplicate and was rejected. Do not repeat or extend it. Use the evidence already collected and write the answer for the user now, or make a different structured tool call.",
          };
          history.push(recoveryPrompt);
          emptyResponseRecoveryPrompts.add(recoveryPrompt);
          continue;
        }
      }

      const canRetry = emptyResponseRetries < MAX_EMPTY_RESPONSE_RETRIES && round + 1 < roundLimit;
      if (canRetry) {
        emptyResponseRetries++;
        const afterTools = executedToolCalls.length > 0;
        const message = afterTools
          ? `Provider returned no final answer after tool execution — retrying (${emptyResponseRetries}/${MAX_EMPTY_RESPONSE_RETRIES})`
          : `Provider returned an empty response — retrying (${emptyResponseRetries}/${MAX_EMPTY_RESPONSE_RETRIES})`;
        log.warn(`${message} for session ${sessionId}`);
        onEvent?.({ type: "steering", message });
        if (thinkingText) {
          history.push({ role: "assistant", content: "", thinking: capThinking(thinkingText) });
        }
        const recoveryPrompt: AgentMessage = {
          role: "system",
          content: thinkingText
            ? "You produced reasoning but no answer. Do not think further and do not repeat that reasoning — write the answer for the user now, or make a structured tool call."
            : afterTools
              ? "Your previous response ended without a final answer after the tools completed. Continue from the completed tool results and give the user a concise final answer. Do not repeat completed tool calls."
              : "Your previous response was empty. Answer the user's request now. Return either a substantive response or a structured tool call.",
        };
        history.push(recoveryPrompt);
        emptyResponseRecoveryPrompts.add(recoveryPrompt);
        continue;
      }

      const phase = executedToolCalls.length > 0 ? " after tool execution" : "";
      return finishWithFallback(
        `LLM returned an empty response${phase} and did not recover after ${emptyResponseRetries + 1} attempt(s) — finishing with a graceful fallback`,
      );
    }

    if (steering?.hasPending) {
      const steered = steering.drain();
      if (contentText) {
        history.push({ role: "assistant", content: contentText });
      }
      for (const msg of steered) {
        history.push({ role: "system", content: "[STEERING] " + msg });
        segments.push({ type: "steering", content: msg });
        onEvent?.({ type: "steering", message: msg });
        log.info("Steering injected for session " + sessionId + ": " + msg.slice(0, 100));
      }
      continue;
    }

    // ── Normal text response — done ──
    if (contentText) {
      history.push({ role: "assistant", content: contentText, thinking: capThinking(thinkingText) });
    }
    if (fullContent || thinkingText || segments.length > 0 || executedToolCalls.length > 0) {
      const tcJson = executedToolCalls.length > 0 ? JSON.stringify(executedToolCalls) : undefined;
      const segJson = segments.length > 0 ? JSON.stringify(segments) : undefined;
      onPersist?.(sessionId, "assistant", fullContent, tcJson, segJson, thinkingText || undefined);
      persisted = true;
    }

    // ── Emit plan completion in plan mode ──
    if (mode === "plan" && plannedActions.length > 0) {
      onEvent?.({
        type: "plan_complete",
        planId,
        summary: contentText || "Plan ready for review.",
        actions: plannedActions,
      });
    }

    const planResult = mode === "plan" && plannedActions.length > 0
      ? { id: planId, summary: contentText || "Plan ready for review.", actions: plannedActions }
      : undefined;
    return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: false, hitMaxRounds: false, persisted, plan: planResult };
  }

  // Pause at the safety budget. Clients receive hitMaxRounds and can offer a
  // continuation action, matching Copilot's confirm-to-continue behavior.
  log.warn(`Agent loop hit max rounds (${roundLimit}) for session ${sessionId}`);
  const msg = `\n\n[Paused after ${roundLimit} tool rounds to prevent a runaway loop. Continue to resume, or send a new message to refine the task.]`;
  onEvent?.({ type: "token", content: msg });
  fullContent += msg;

  {
    const tcJson = executedToolCalls.length > 0 ? JSON.stringify(executedToolCalls) : undefined;
    const segJson = segments.length > 0 ? JSON.stringify(segments) : undefined;
    onPersist?.(sessionId, "assistant", fullContent, tcJson, segJson, undefined);
    persisted = true;
  }

  const planResultMaxRounds = mode === "plan" && plannedActions.length > 0
    ? { id: planId, summary: fullContent, actions: plannedActions }
    : undefined;
  return { content: fullContent, executedToolCalls, segments, rounds: roundLimit, aborted: false, hitMaxRounds: true, persisted, plan: planResultMaxRounds };
}

// ── Retry API ────────────────────────────────────────────────────────

/**
 * Retry a specific failed tool call by its callId.
 *
 * This re-executes the tool with its original arguments, updates the
 * conversation history in-place (replaces the old tool result message),
 * and returns the new result.
 *
 * Designed to be called from a REST endpoint like:
 *   POST /api/sessions/:sessionId/retry-tool
 *   { callId: "call_abc123" }
 */
export async function retryToolCall(
  callId: string,
  history: AgentMessage[],
  executedToolCalls: ExecutedToolCall[],
  executeTool: ToolExecutor,
  sessionId: string,
  auth?: { userId?: string; apiKeys?: Record<string, string>; providerId?: string; model?: string; jaitBackend?: string; runtimeMode?: string },
  onEvent?: (event: AgentLoopEvent) => void,
  signal?: AbortSignal,
): Promise<ToolResult> {
  // Find the original call
  const original = executedToolCalls.find((tc) => tc.callId === callId);
  if (!original) {
    return { ok: false, message: `Tool call ${callId} not found` };
  }

  // Find and update history entry
  const histIdx = history.findIndex(
    (m) => m.role === "tool" && m.tool_call_id === callId,
  );

  const startedAt = Date.now();

  onEvent?.({
    type: "tool_start",
    tool: original.tool,
    args: original.args,
    call_id: callId,
  });

  const result = await executeTool(
    original.tool,
    original.args,
    sessionId,
    auth,
    (chunk) => onEvent?.({ type: "tool_output", call_id: callId, content: chunk }),
    signal,
  );

  const completedAt = Date.now();

  onEvent?.({
    type: "tool_result",
    call_id: callId,
    tool: original.tool,
    ok: result.ok,
    message: result.message,
    data: result.data,
  });

  // Update the executed tool call record
  original.ok = result.ok;
  original.message = result.message;
  original.data = result.data;
  original.startedAt = startedAt;
  original.completedAt = completedAt;
  original.retryCount = (original.retryCount ?? 0) + 1;

  // Update conversation history so the LLM sees the new result
  if (histIdx !== -1) {
    history[histIdx] = {
      role: "tool",
      content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
      tool_call_id: callId,
      name: toOpenAIName(original.tool),
    };
  }

  return result;
}
