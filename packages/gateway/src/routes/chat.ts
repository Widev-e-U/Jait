import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { JaitDB } from "../db/index.js";
import type { SessionService } from "../services/sessions.js";
import type { UserService } from "../services/users.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/contracts.js";
import type { AuditWriter } from "../services/audit.js";
import type { ToolResult } from "../tools/contracts.js";
import type { MemoryService } from "../memory/contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { resolveWorkspaceRoot } from "../tools/core/get-fs.js";
import { messages as messagesTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { uuidv7 } from "../lib/uuidv7.js";
import { requireAuth } from "../security/http-auth.js";
import {
  runAgentLoop,
  retryToolCall,
  buildTieredToolSchemas,
  fromOpenAIName,
  SteeringController,
  type AgentLoopEvent,
  type ExecutedToolCall,
  type OpenAIToolCall,
} from "../tools/agent-loop.js";
import {
  type ChatMode,
  type PlannedAction,
  isValidChatMode,
  getSystemPromptForMode,
} from "../tools/chat-modes.js";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
  uiToolCalls?: PersistedToolCall[];
}

/** Serialized tool call info for DB persistence */
interface PersistedToolCall {
  callId: string;
  tool: string;
  args: unknown;
  ok: boolean;
  message: string;
  /** @deprecated kept for back-compat with old rows; prefer `data` */
  output?: string;
  /** Full result.data object — round-trips all tool-specific fields */
  data?: unknown;
  startedAt?: number;
  completedAt?: number;
}

// ── In-memory state ──────────────────────────────────────────────────

const sessionHistory = new Map<string, ChatMessage[]>();
const activeStreams = new Set<string>();
const sessionAbortControllers = new Map<string, AbortController>();

type StreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_call_delta"; call_id: string; index: number; name_delta?: string; args_delta?: string }
  | { type: "tool_start"; tool: string; args: unknown; call_id: string }
  | { type: "tool_output"; call_id: string; content: string }
  | { type: "tool_result"; call_id: string; tool: string; ok: boolean; message: string; data?: unknown }
  | { type: "todo_list"; items: { id: number; title: string; status: "not-started" | "in-progress" | "completed" }[] }
  | { type: "done"; session_id: string; prompt_count: number; remaining_prompts: null }
  | { type: "error"; message: string };
type StreamSubscriber = (event: StreamEvent) => void;
const sessionSubscribers = new Map<string, Set<StreamSubscriber>>();

const DEFAULT_UI_MESSAGE_LIMIT = 120;
const MAX_UI_MESSAGE_LIMIT = 500;

type UIMsg = { id: string; role: "user" | "assistant"; content: string; toolCalls?: unknown };
type VisibleHistoryMsg = UIMsg & { historyIndex: number };

function parseToolArguments(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

type ToolCallResultState = {
  ok: boolean;
  message: string;
  data?: unknown;
};

function mapPendingToolCallsForUI(
  toolCalls: OpenAIToolCall[],
  resultStateByCallId?: Map<string, ToolCallResultState>,
): Array<Record<string, unknown>> {
  const now = Date.now();
  return toolCalls.map((tc) => ({
    callId: tc.id,
    tool: fromOpenAIName(tc.function.name),
    args: parseToolArguments(tc.function.arguments),
    ...(resultStateByCallId?.has(tc.id)
      ? {
          status: resultStateByCallId.get(tc.id)!.ok ? "success" : "error",
          ok: resultStateByCallId.get(tc.id)!.ok,
          message: resultStateByCallId.get(tc.id)!.message,
          data: resultStateByCallId.get(tc.id)!.data,
          completedAt: now,
        }
      : {
          status: "running",
          startedAt: now,
        }),
  }));
}

function mapPersistedToolCallsForUI(toolCalls: PersistedToolCall[]): Array<Record<string, unknown>> {
  return toolCalls.map((tc) => ({
    callId: tc.callId,
    tool: tc.tool,
    args: (typeof tc.args === "object" && tc.args !== null ? tc.args : {}),
    status: tc.ok ? "success" : "error",
    ok: tc.ok,
    message: tc.message,
    output: tc.output,
    data: tc.data,
    startedAt: tc.startedAt,
    completedAt: tc.completedAt,
  }));
}

function buildToolResultStateMap(history: ChatMessage[]): Map<string, ToolCallResultState> {
  const out = new Map<string, ToolCallResultState>();
  for (const msg of history) {
    if (msg.role !== "tool" || !msg.tool_call_id) continue;
    let parsed: { ok?: unknown; message?: unknown; data?: unknown } | undefined;
    try {
      parsed = JSON.parse(msg.content) as { ok?: unknown; message?: unknown; data?: unknown };
    } catch {
      // Keep best effort fallback below.
    }
    const ok = typeof parsed?.ok === "boolean" ? parsed.ok : false;
    const message = typeof parsed?.message === "string"
      ? parsed.message
      : (msg.content?.trim() || (ok ? "Completed" : "Failed"));
    out.set(msg.tool_call_id, {
      ok,
      message,
      data: parsed?.data,
    });
  }
  return out;
}

function emitToSubscribers(sessionId: string, event: StreamEvent) {
  const subs = sessionSubscribers.get(sessionId);
  if (subs) for (const fn of subs) fn(event);
}

function subscribe(sessionId: string, fn: StreamSubscriber) {
  if (!sessionSubscribers.has(sessionId)) sessionSubscribers.set(sessionId, new Set());
  sessionSubscribers.get(sessionId)!.add(fn);
  return () => {
    const subs = sessionSubscribers.get(sessionId);
    if (subs) {
      subs.delete(fn);
      if (subs.size === 0) sessionSubscribers.delete(sessionId);
    }
  };
}

function parseMessageLimit(raw: unknown): number {
  const parsed = typeof raw === "number"
    ? raw
    : typeof raw === "string"
      ? Number.parseInt(raw, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UI_MESSAGE_LIMIT;
  return Math.min(Math.floor(parsed), MAX_UI_MESSAGE_LIMIT);
}

function windowMessages<T>(messages: T[], limit: number): {
  messages: T[];
  total: number;
  hasMore: boolean;
} {
  const total = messages.length;
  const start = Math.max(total - limit, 0);
  return {
    messages: messages.slice(start),
    total,
    hasMore: start > 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildVisibleHistoryEntries(
  sessionId: string,
  history: ChatMessage[],
  options?: { includePendingAssistantToolCalls?: boolean },
): VisibleHistoryMsg[] {
  const out: VisibleHistoryMsg[] = [];
  let visibleIndex = 0;
  const includePendingAssistantToolCalls = options?.includePendingAssistantToolCalls === true;
  const toolResultStateByCallId = includePendingAssistantToolCalls
    ? buildToolResultStateMap(history)
    : undefined;
  for (let i = 0; i < history.length; i++) {
    const m = history[i]!;
    if (m.role === "system" || m.role === "tool") continue;

    let uiToolCalls: Array<Record<string, unknown>> | undefined;
    if (m.role === "assistant") {
      if (Array.isArray(m.uiToolCalls) && m.uiToolCalls.length > 0) {
        uiToolCalls = mapPersistedToolCallsForUI(m.uiToolCalls);
      } else if (m.tool_calls && includePendingAssistantToolCalls) {
        uiToolCalls = mapPendingToolCallsForUI(m.tool_calls, toolResultStateByCallId);
      }
    }

    if (m.role === "assistant" && m.tool_calls && !m.content && !includePendingAssistantToolCalls) {
      continue;
    }

    out.push({
      id: `${sessionId}-${visibleIndex}`,
      role: m.role as "user" | "assistant",
      content: m.content,
      toolCalls: uiToolCalls,
      historyIndex: i,
    });
    visibleIndex++;
  }
  return out;
}

function buildVisibleHistoryMessages(
  sessionId: string,
  history: ChatMessage[],
  options?: { includePendingAssistantToolCalls?: boolean },
): UIMsg[] {
  return buildVisibleHistoryEntries(sessionId, history, options).map(({ id, role, content, toolCalls }) => ({
    id,
    role,
    content,
    toolCalls,
  }));
}

// ── System prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Jait — Just Another Intelligent Tool. You are a capable AI assistant that can run shell commands, read/write files, and manage system surfaces.

When the user asks you to do something that requires action (run a command, edit a file, check system info, etc.), use your tools. Don't just describe what you would do — actually do it.

Key capabilities:
- terminal.run: Execute shell commands (PowerShell on Windows). Always use this to run commands.
- file.read / file.write / file.patch: Read, create, and edit files.
- file.list / file.stat: Browse the filesystem.
- os.query: Get system info, running processes, disk usage.
- surfaces.list / surfaces.start / surfaces.stop: Manage terminal and filesystem surfaces.
- cron.add / cron.list / cron.update / cron.remove: Create and manage recurring Jait jobs.

Guidelines:
- Be direct and concise.
- When running commands, use the actual tools — don't just suggest commands.
- For multi-step tasks, execute them step by step, checking each result.
- If a command fails, analyze the error and try to fix it.
- When editing files, read them first to understand the context before patching.
- For recurring or scheduled automation requests, prefer cron tools and Jait jobs instead of OS-native schedulers.
- Do not create Windows Task Scheduler jobs unless the user explicitly asks for OS-native scheduling.`;

/** Max agentic loop iterations to prevent infinite loops */
const MAX_TOOL_ROUNDS = 15;

// ── Module-level DB ref for persistence from extracted functions ──────
let _dbRef: JaitDB | undefined;
let _appRef: FastifyInstance | undefined;

function persistMessageGlobal(sessionId: string, role: string, content: string, toolCalls?: string): void {
  if (!_dbRef) return;
  try {
    _dbRef.insert(messagesTable)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        role,
        content,
        toolCalls: toolCalls ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    _appRef?.log.error(err, "Failed to persist message");
  }
}

// ── Route registration ───────────────────────────────────────────────

export interface ChatRouteDeps {
  db?: JaitDB;
  sessionService?: SessionService;
  userService?: UserService;
  toolRegistry?: ToolRegistry;
  surfaceRegistry?: SurfaceRegistry;
  audit?: AuditWriter;
  memoryService?: MemoryService;
  toolExecutor?: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => Promise<ToolResult>;
}

export function registerChatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  depsOrDb?: JaitDB | ChatRouteDeps,
  sessionServiceArg?: SessionService,
) {
  // Support both old signature (db, sessionService) and new deps object
  let db: JaitDB | undefined;
  let sessionService: SessionService | undefined;
  let userService: UserService | undefined;
  let toolRegistry: ToolRegistry | undefined;
  let surfaceRegistry: SurfaceRegistry | undefined;
  let audit: AuditWriter | undefined;
  let toolExecutor: ChatRouteDeps["toolExecutor"] | undefined;
  let memoryService: MemoryService | undefined;

  if (depsOrDb && typeof depsOrDb === "object" && "sessionService" in depsOrDb) {
    const deps = depsOrDb as ChatRouteDeps;
    db = deps.db;
    sessionService = deps.sessionService;
    userService = deps.userService;
    toolRegistry = deps.toolRegistry;
    surfaceRegistry = deps.surfaceRegistry;
    audit = deps.audit;
    toolExecutor = deps.toolExecutor;
    memoryService = deps.memoryService;
  } else {
    db = depsOrDb as JaitDB | undefined;
    sessionService = sessionServiceArg;
  }

  // Store refs for persistence from extracted functions
  _dbRef = db;
  _appRef = app;

  const hasTools = !!toolRegistry && toolRegistry.list().length > 0;

  // ── Per-session steering controllers and executed tool call tracking ──
  const sessionSteeringControllers = new Map<string, SteeringController>();
  const sessionExecutedToolCalls = new Map<string, ExecutedToolCall[]>();
  /** Plans produced by plan mode — keyed by session ID */
  const sessionPlans = new Map<string, { id: string; summary: string; actions: PlannedAction[] }>();

  app.log.info(`Chat route: ${hasTools ? toolRegistry!.list().length + " tools available for agent (tiered)" : "no tools (text-only mode)"}`);

  // Hydrate in-memory cache from DB if session not yet loaded
  function hydrateSession(sessionId: string): void {
    if (sessionHistory.has(sessionId)) return;
    if (!db) return;
    const rows = db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.sessionId, sessionId))
      .orderBy(messagesTable.createdAt)
      .all();
    if (rows.length > 0) {
      sessionHistory.set(sessionId, [
        { role: "system", content: SYSTEM_PROMPT },
        ...rows.map((r) => {
          let uiToolCalls: PersistedToolCall[] | undefined;
          if (r.toolCalls) {
            try {
              const parsed = JSON.parse(r.toolCalls) as unknown;
              if (Array.isArray(parsed)) {
                uiToolCalls = parsed as PersistedToolCall[];
              }
            } catch {
              // Ignore malformed historical toolCalls payloads.
            }
          }
          return {
            role: r.role as ChatMessage["role"],
            content: r.content,
            uiToolCalls,
          };
        }),
      ]);
    }
  }

  function persistMessage(sessionId: string, role: string, content: string, toolCalls?: string): void {
    if (!db) return;
    try {
      db.insert(messagesTable)
        .values({
          id: crypto.randomUUID(),
          sessionId,
          role,
          content,
          toolCalls: toolCalls ?? null,
          createdAt: new Date().toISOString(),
        })
        .run();
    } catch (err) {
      app.log.error(err, "Failed to persist message");
    }
  }

  // ── Tool execution helper ──────────────────────────────────────────

  async function executeTool(
    toolName: string,
    args: unknown,
    sessionId: string,
    auth?: { userId?: string; apiKeys?: Record<string, string> },
    onOutputChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    if (!toolRegistry) {
      return { ok: false, message: "Tool registry not available" };
    }
    if (signal?.aborted) {
      return { ok: false, message: "Cancelled" };
    }
    const context: ToolContext = {
      sessionId,
      actionId: uuidv7(),
      workspaceRoot: surfaceRegistry
        ? resolveWorkspaceRoot(surfaceRegistry, sessionId)
        : process.cwd(),
      requestedBy: "agent",
      userId: auth?.userId,
      apiKeys: auth?.apiKeys,
      onOutputChunk,
      signal,
    };
    try {
      const toolPromise = toolExecutor
        ? toolExecutor(toolName, args, context)
        : toolRegistry.execute(toolName, args, context, audit);

      // Race the tool execution against the abort signal so a stuck tool
      // (e.g. browser launch hanging) doesn't block the cancel flow forever.
      if (signal && !signal.aborted) {
        const abortPromise = new Promise<ToolResult>((resolve) => {
          const onAbort = () => resolve({ ok: false, message: "Cancelled" });
          signal.addEventListener("abort", onAbort, { once: true });
          // Clean up if the tool finishes first
          toolPromise.finally(() => signal.removeEventListener("abort", onAbort));
        });
        return await Promise.race([toolPromise, abortPromise]);
      }

      return await toolPromise;
    } catch (err) {
      if (signal?.aborted) return { ok: false, message: "Cancelled" };
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ══ POST /api/chat — Main chat endpoint with agentic tool loop ═════

  app.post("/api/chat", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as Record<string, unknown>;
    const content =
      typeof body["content"] === "string"
        ? body["content"]
        : typeof body["message"] === "string"
          ? (body["message"] as string)
          : "";
    const sessionId =
      typeof body["sessionId"] === "string"
        ? body["sessionId"]
        : typeof body["session_id"] === "string"
          ? (body["session_id"] as string)
          : crypto.randomUUID();
    const chatMode: ChatMode = isValidChatMode(body["mode"]) ? body["mode"] : "agent";

    if (!content.trim()) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", details: "content is required" });
    }
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }
    const userApiKeys = userService?.getSettings(authUser.id).apiKeys ?? {};
    const llmRuntime = {
      openaiApiKey: userApiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey,
      openaiBaseUrl: userApiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl,
      openaiModel: userApiKeys["OPENAI_MODEL"]?.trim() || config.openaiModel,
    };

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Build conversation history (hydrate from DB if needed)
    hydrateSession(sessionId);
    if (!sessionHistory.has(sessionId)) {
      sessionHistory.set(sessionId, [
        { role: "system", content: getSystemPromptForMode(chatMode) },
      ]);
    } else {
      // Update system prompt if mode changed mid-session
      const h = sessionHistory.get(sessionId)!;
      const modePrompt = getSystemPromptForMode(chatMode);
      if (h[0]?.role === "system" && h[0].content !== modePrompt) {
        h[0] = { role: "system", content: modePrompt };
      }
    }
    const history = sessionHistory.get(sessionId)!;
    history.push({ role: "user", content });
    persistMessage(sessionId, "user", content);
    try { sessionService?.touch(sessionId); } catch { /* session may not exist */ }

    const streamAbort = new AbortController();
    sessionAbortControllers.set(sessionId, streamAbort);

    let fullContent = "";
    let partialToolCalls: PersistedToolCall[] = [];
    activeStreams.add(sessionId);

    let clientDisconnected = false;
    reply.raw.on("close", () => { clientDisconnected = true; });

    const safeWrite = (data: string) => {
      if (!clientDisconnected) {
        try { reply.raw.write(data); } catch { clientDisconnected = true; }
      }
    };

    const providerLabel = config.llmProvider === "openai" ? "OpenAI" : "Ollama";

    // Create steering controller for this session
    const steering = new SteeringController();
    sessionSteeringControllers.set(sessionId, steering);

    try {
      if (config.llmProvider === "openai") {
        // ══ OpenAI agentic loop (using extracted runAgentLoop) ═════

        // Build tiered schemas per request — respects user-disabled tools
        const userSettings = userService?.getSettings(authUser.id);
        const disabledTools = userSettings?.disabledTools?.length
          ? new Set(userSettings.disabledTools)
          : undefined;
        const toolSchemas = toolRegistry
          ? buildTieredToolSchemas(toolRegistry, disabledTools)
          : [];

        const onEvent = (event: AgentLoopEvent) => {
          emitToSubscribers(sessionId, event as StreamEvent);
          safeWrite(`data: ${JSON.stringify(event)}\n\n`);
        };
        const result = await runAgentLoop(
          {
            llm: llmRuntime,
            history,
            toolSchemas,
            hasTools,
            sessionId,
            auth: { userId: authUser.id, apiKeys: userApiKeys },
            abort: streamAbort,
            maxRounds: MAX_TOOL_ROUNDS,
            parallel: true,
            toolRegistry,
            disabledTools,
            mode: chatMode,
            onEvent,
            onPersist: (sid, role, content, tc) => persistMessage(sid, role, content, tc),
            log: app.log,
          },
          executeTool,
          steering,
        );
        fullContent = result.content;
        partialToolCalls = result.executedToolCalls as unknown as PersistedToolCall[];
        // Track executed tool calls for retry API
        sessionExecutedToolCalls.set(sessionId, result.executedToolCalls);
        // Store plan if plan mode produced one
        if (result.plan) {
          sessionPlans.set(sessionId, result.plan);
        }
      } else {
        // ══ Ollama (text only — no tool support) ═══════════════════
        fullContent = await runOllamaStream(
          config, history, sessionId, streamAbort, safeWrite, app,
        );
      }
    } catch (err) {
      // The OpenAI agentic loop now handles AbortError internally and returns
      // partial results.  This catch only fires for non-abort errors (OpenAI)
      // or for Ollama stream errors (including abort).
      const wasCancelled = err instanceof Error && err.name === "AbortError";
      if (!wasCancelled) app.log.error(err, `${providerLabel} streaming error`);

      // Save partial content for real (non-cancel) errors
      if (!wasCancelled && (fullContent || partialToolCalls.length > 0)) {
        const tcJson = partialToolCalls.length > 0 ? JSON.stringify(partialToolCalls) : undefined;
        persistMessage(sessionId, "assistant", fullContent || "", tcJson);
      }

      const errMsg = wasCancelled
        ? "cancelled"
        : err instanceof Error ? err.message : `Failed to reach ${providerLabel}`;
      emitToSubscribers(sessionId, wasCancelled
        ? { type: "done" as const, session_id: sessionId, prompt_count: history.filter(m => m.role === "user").length, remaining_prompts: null }
        : { type: "error", message: errMsg });
      try {
        safeWrite(`data: ${JSON.stringify(wasCancelled ? { type: "done", session_id: sessionId } : { type: "error", message: errMsg })}\n\n`);
      } catch { /* client gone */ }
    }

    // Persist partial results BEFORE clearing stream state so that a reload
    // between these two steps loads the cancelled tool calls from the DB.
    if (streamAbort.signal.aborted && partialToolCalls.length > 0) {
      const tcJson = JSON.stringify(partialToolCalls);
      persistMessage(sessionId, "assistant", fullContent || "", tcJson);
    }

    activeStreams.delete(sessionId);
    sessionAbortControllers.delete(sessionId);
    sessionSteeringControllers.delete(sessionId);

    // Clean up in-memory history: remove any dangling assistant tool_calls
    // messages that never got a text response (e.g. cancelled mid-tool-call).
    // This prevents them from showing as "running" on reload.
    const currentHistory = sessionHistory.get(sessionId);
    if (currentHistory) {
      // Walk backwards: if the last messages are assistant+tool_calls with no
      // following text response, and the corresponding tool results are missing,
      // remove them so the history is clean for the next session load.
      while (currentHistory.length > 0) {
        const last = currentHistory[currentHistory.length - 1]!;
        // Remove orphaned tool result messages at the tail
        if (last.role === "tool") {
          currentHistory.pop();
          continue;
        }
        // Remove assistant messages that only contain tool_calls with no text
        if (last.role === "assistant" && last.tool_calls && !last.content) {
          currentHistory.pop();
          continue;
        }
        break;
      }
    }

    // Final done event
    const doneEvent = {
      type: "done" as const,
      session_id: sessionId,
      prompt_count: history.filter(m => m.role === "user").length,
      remaining_prompts: null,
    };
    emitToSubscribers(sessionId, doneEvent);
    safeWrite(`data: ${JSON.stringify(doneEvent)}\n\n`);

    try { reply.raw.end(); } catch { /* already closed */ }
  });

  // Cancel an active stream for a session
  app.post("/api/sessions/:sessionId/cancel", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }
    const controller = sessionAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
  });

  // Truncate a session from a specific user message onward (used for edit + replay).
  app.post("/api/sessions/:sessionId/restart-from", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }
    const body = (request.body as Record<string, unknown>) ?? {};
    const messageId = typeof body["messageId"] === "string" ? body["messageId"] : "";
    const messageIndex = typeof body["messageIndex"] === "number" ? body["messageIndex"] : -1;
    const messageFromEnd = typeof body["messageFromEnd"] === "number" ? body["messageFromEnd"] : -1;

    if (!messageId && messageIndex < 0 && messageFromEnd < 0) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "messageId, messageFromEnd, or messageIndex is required" });
    }
    if (activeStreams.has(sessionId)) {
      const controller = sessionAbortControllers.get(sessionId);
      if (controller) controller.abort();
      const deadline = Date.now() + 5000;
      while (activeStreams.has(sessionId) && Date.now() < deadline) {
        await sleep(50);
      }
      if (activeStreams.has(sessionId)) {
        return reply.status(409).send({ error: "CONFLICT", details: "Cannot restart while session is streaming" });
      }
    }

    hydrateSession(sessionId);
    const history = sessionHistory.get(sessionId) ?? [];
    const visibleEntries = buildVisibleHistoryEntries(sessionId, history);
    let targetVisibleIndex = visibleEntries.findIndex((m) => m.id === messageId);
    if (
      targetVisibleIndex === -1 &&
      Number.isFinite(messageFromEnd) &&
      messageFromEnd >= 0 &&
      messageFromEnd < visibleEntries.length
    ) {
      targetVisibleIndex = visibleEntries.length - 1 - Math.floor(messageFromEnd);
    }
    if (
      targetVisibleIndex === -1 &&
      Number.isFinite(messageIndex) &&
      messageIndex >= 0 &&
      messageIndex < visibleEntries.length
    ) {
      targetVisibleIndex = Math.floor(messageIndex);
    }
    if (targetVisibleIndex === -1) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Message not found" });
    }

    const target = visibleEntries[targetVisibleIndex]!;
    if (target.role !== "user") {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "Only user messages can be edited/restarted" });
    }

    if (memoryService) {
      const toFlush = visibleEntries
        .slice(targetVisibleIndex)
        .filter((entry) => entry.content.trim().length > 0)
        .map((entry) => `[${entry.role}] ${entry.content}`);
      await memoryService.flushPreCompaction(sessionId, toFlush);
    }

    const truncatedHistory = history.slice(0, target.historyIndex);
    sessionHistory.set(sessionId, truncatedHistory);

    if (db) {
      const rows = db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.sessionId, sessionId))
        .orderBy(messagesTable.createdAt)
        .all();
      const rowsToDelete = rows.slice(targetVisibleIndex);
      for (const row of rowsToDelete) {
        db.delete(messagesTable).where(eq(messagesTable.id, row.id)).run();
      }
    }

    try { sessionService?.touch(sessionId); } catch { /* ignore */ }

    const updatedMessages = buildVisibleHistoryMessages(sessionId, truncatedHistory);
    const windowed = windowMessages(updatedMessages, DEFAULT_UI_MESSAGE_LIMIT);
    return {
      ok: true,
      sessionId,
      streaming: false,
      total: windowed.total,
      hasMore: windowed.hasMore,
      limit: DEFAULT_UI_MESSAGE_LIMIT,
      messages: windowed.messages,
    };
  });

  // List messages in a session
  app.get("/api/sessions/:sessionId/messages", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }
    const query = request.query as { limit?: number | string };
    const limit = parseMessageLimit(query?.limit);
    hydrateSession(sessionId);
    const history = sessionHistory.get(sessionId) ?? [];
    const visible = buildVisibleHistoryMessages(sessionId, history);
    const windowed = windowMessages(visible, limit);
    return {
      sessionId,
      streaming: activeStreams.has(sessionId),
      total: windowed.total,
      hasMore: windowed.hasMore,
      limit,
      messages: windowed.messages,
    };
  });

  // SSE stream-resume: join an in-progress session's token stream
  // Client receives a snapshot of current content, then live tokens until done.
  app.get("/api/sessions/:sessionId/stream", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }
    const query = request.query as { limit?: number | string };
    const limit = parseMessageLimit(query?.limit);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    hydrateSession(sessionId);
    const history = sessionHistory.get(sessionId) ?? [];
    const isStreaming = activeStreams.has(sessionId);

    // Build snapshot. While streaming, prefer in-memory history so partial assistant
    // content is visible immediately (DB persistence may lag until stream completion).
    let snapshotMessages: UIMsg[];
    let total = 0;
    let hasMore = false;
    if (db && !isStreaming) {
      const rows = db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.sessionId, sessionId))
        .orderBy(messagesTable.createdAt)
        .all();
      const allMessages: UIMsg[] = rows
        .filter((r) => r.role === "user" || r.role === "assistant")
        .map((r, i) => {
          const msg: UIMsg = {
            id: `${sessionId}-${i}`,
            role: r.role as "user" | "assistant",
            content: r.content,
          };
          if (r.toolCalls) {
            try { msg.toolCalls = JSON.parse(r.toolCalls); } catch { /* ignore */ }
          }
          return msg;
        });
      const windowed = windowMessages(allMessages, limit);
      snapshotMessages = windowed.messages;
      total = windowed.total;
      hasMore = windowed.hasMore;
    } else {
      const allMessages = buildVisibleHistoryMessages(
        sessionId,
        history,
        { includePendingAssistantToolCalls: isStreaming },
      );
      const windowed = windowMessages(allMessages, limit);
      snapshotMessages = windowed.messages;
      total = windowed.total;
      hasMore = windowed.hasMore;
    }

    reply.raw.write(
      `data: ${JSON.stringify({
        type: "snapshot",
        messages: snapshotMessages,
        streaming: isStreaming,
        total,
        hasMore,
        limit,
      })}\n\n`,
    );

    if (!isStreaming) {
      // Not streaming — send done immediately
      reply.raw.write(
        `data: ${JSON.stringify({ type: "done", session_id: sessionId, prompt_count: history.filter(m => m.role === "user").length, remaining_prompts: null })}\n\n`,
      );
      reply.raw.end();
      return;
    }

    // Subscribe to live events
    let closed = false;
    reply.raw.on("close", () => { closed = true; });

    const unsubscribe = subscribe(sessionId, (event) => {
      if (closed) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "done" || event.type === "error") {
          try { reply.raw.end(); } catch { /* */ }
        }
      } catch {
        closed = true;
      }
    });

    // Clean up subscription if client disconnects before stream finishes
    request.raw.on("close", () => {
      unsubscribe();
    });
  });

  // ── POST /api/sessions/:sessionId/retry-tool ────────────────────────
  // Retry a specific failed tool call by its callId.
  app.post("/api/sessions/:sessionId/retry-tool", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }

    const body = (request.body as Record<string, unknown>) ?? {};
    const callId = typeof body["callId"] === "string" ? body["callId"] : "";
    if (!callId) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "callId is required" });
    }

    // Cannot retry while a stream is active
    if (activeStreams.has(sessionId)) {
      return reply.status(409).send({ error: "CONFLICT", details: "Cannot retry while session is streaming" });
    }

    const executed = sessionExecutedToolCalls.get(sessionId);
    if (!executed) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "No tool calls recorded for this session" });
    }

    const original = executed.find((tc) => tc.callId === callId);
    if (!original) {
      return reply.status(404).send({ error: "NOT_FOUND", details: `Tool call ${callId} not found` });
    }

    hydrateSession(sessionId);
    const history = sessionHistory.get(sessionId);
    if (!history) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session history not found" });
    }

    const userApiKeys = userService?.getSettings(authUser.id).apiKeys ?? {};

    const result = await retryToolCall(
      callId,
      history as any,
      executed,
      executeTool,
      sessionId,
      { userId: authUser.id, apiKeys: userApiKeys },
      (event) => emitToSubscribers(sessionId, event as StreamEvent),
    );

    // Persist updated history entry
    if (db) {
      const tcJson = JSON.stringify(executed);
      // Find the last assistant message and update its tool calls
      const rows = db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.sessionId, sessionId))
        .orderBy(messagesTable.createdAt)
        .all();
      const lastAssistant = [...rows].reverse().find((r) => r.role === "assistant");
      if (lastAssistant) {
        db.update(messagesTable)
          .set({ toolCalls: tcJson })
          .where(eq(messagesTable.id, lastAssistant.id))
          .run();
      }
    }

    return {
      ok: result.ok,
      callId,
      tool: original.tool,
      message: result.message,
      data: result.data,
      retryCount: original.retryCount,
    };
  });

  // ── POST /api/sessions/:sessionId/steer ─────────────────────────────
  // Inject a steering message into an active agent loop.
  app.post("/api/sessions/:sessionId/steer", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }

    const body = (request.body as Record<string, unknown>) ?? {};
    const message = typeof body["message"] === "string" ? body["message"] : "";
    if (!message.trim()) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "message is required" });
    }

    if (!activeStreams.has(sessionId)) {
      return reply.status(409).send({ error: "CONFLICT", details: "No active stream for this session — steering only works during streaming" });
    }

    const controller = sessionSteeringControllers.get(sessionId);
    if (!controller) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "No steering controller for this session" });
    }

    controller.steer(message);
    return { ok: true, steered: true };
  });

  // ══ GET /api/sessions/:sessionId/plan — Get pending plan ═══════════

  app.get("/api/sessions/:sessionId/plan", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }

    const plan = sessionPlans.get(sessionId);
    if (!plan) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "No pending plan for this session" });
    }

    return {
      plan_id: plan.id,
      summary: plan.summary,
      actions: plan.actions.map((a) => ({
        id: a.id,
        tool: a.tool,
        args: a.args,
        description: a.description,
        order: a.order,
        status: a.status,
      })),
    };
  });

  // ══ POST /api/sessions/:sessionId/plan/execute — Execute approved plan ═

  app.post("/api/sessions/:sessionId/plan/execute", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }

    const plan = sessionPlans.get(sessionId);
    if (!plan) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "No pending plan for this session" });
    }

    const body = (request.body as Record<string, unknown>) ?? {};
    // Optional: allow partial approval by specifying action IDs to execute
    const approvedActionIds = Array.isArray(body["action_ids"])
      ? new Set((body["action_ids"] as string[]).filter((id) => typeof id === "string"))
      : null;

    const userApiKeys = userService?.getSettings(authUser.id).apiKeys ?? {};

    // SSE headers for streaming plan execution
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let clientDisconnected = false;
    reply.raw.on("close", () => { clientDisconnected = true; });
    const safeWrite = (data: string) => {
      if (!clientDisconnected) {
        try { reply.raw.write(data); } catch { clientDisconnected = true; }
      }
    };

    const executionResults: Array<{ id: string; tool: string; ok: boolean; message: string; data?: unknown }> = [];

    for (const action of plan.actions) {
      // Skip rejected or already-executed actions
      if (action.status === "rejected" || action.status === "executed") continue;
      // If partial approval, skip non-approved
      if (approvedActionIds && !approvedActionIds.has(action.id)) {
        action.status = "rejected";
        continue;
      }

      action.status = "approved";

      safeWrite(`data: ${JSON.stringify({ type: "plan_action_start", id: action.id, tool: action.tool, order: action.order })}\n\n`);
      emitToSubscribers(sessionId, { type: "tool_start", tool: action.tool, args: action.args, call_id: action.id });

      try {
        const result = await executeTool(
          action.tool,
          action.args,
          sessionId,
          { userId: authUser.id, apiKeys: userApiKeys },
          (chunk) => {
            safeWrite(`data: ${JSON.stringify({ type: "plan_action_output", id: action.id, content: chunk })}\n\n`);
          },
        );

        action.status = result.ok ? "executed" : "failed";
        action.result = { ok: result.ok, message: result.message, data: result.data };
        executionResults.push({ id: action.id, tool: action.tool, ok: result.ok, message: result.message, data: result.data });

        safeWrite(`data: ${JSON.stringify({
          type: "plan_action_result",
          id: action.id,
          tool: action.tool,
          ok: result.ok,
          message: result.message,
          data: result.data,
        })}\n\n`);

        emitToSubscribers(sessionId, {
          type: "tool_result",
          call_id: action.id,
          tool: action.tool,
          ok: result.ok,
          message: result.message,
          data: result.data,
        });

        // Add to conversation history so the agent has context
        const history = sessionHistory.get(sessionId);
        if (history) {
          history.push({
            role: "tool",
            content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
            tool_call_id: action.id,
            name: action.tool,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        action.status = "failed";
        action.result = { ok: false, message };
        executionResults.push({ id: action.id, tool: action.tool, ok: false, message });

        safeWrite(`data: ${JSON.stringify({ type: "plan_action_result", id: action.id, tool: action.tool, ok: false, message })}\n\n`);
      }
    }

    // Plan fully executed — clean up
    const allDone = plan.actions.every((a) => a.status === "executed" || a.status === "rejected" || a.status === "failed");
    if (allDone) {
      sessionPlans.delete(sessionId);
    }

    const succeeded = executionResults.filter((r) => r.ok).length;
    const failed = executionResults.filter((r) => !r.ok).length;

    safeWrite(`data: ${JSON.stringify({
      type: "plan_execution_complete",
      plan_id: plan.id,
      total: executionResults.length,
      succeeded,
      failed,
      results: executionResults,
    })}\n\n`);

    reply.raw.end();
  });

  // ══ POST /api/sessions/:sessionId/plan/reject — Reject/discard plan ═

  app.post("/api/sessions/:sessionId/plan/reject", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }

    const plan = sessionPlans.get(sessionId);
    if (!plan) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "No pending plan for this session" });
    }

    for (const action of plan.actions) {
      if (action.status === "pending") action.status = "rejected";
    }
    sessionPlans.delete(sessionId);

    // Add a system message so the agent knows the plan was rejected
    const history = sessionHistory.get(sessionId);
    if (history) {
      history.push({
        role: "system",
        content: "[PLAN REJECTED] The user rejected the proposed plan. Ask if they want to revise it or try a different approach.",
      });
    }

    return { ok: true, plan_id: plan.id, message: "Plan rejected and discarded." };
  });
}

// ══════════════════════════════════════════════════════════════════════
// Agent loop extracted to ../tools/agent-loop.ts
// (runAgentLoop, parseOpenAIStream, serializeMessages, etc.)
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// Ollama streaming (text-only — no tool support)
// ══════════════════════════════════════════════════════════════════════

async function runOllamaStream(
  config: AppConfig,
  history: ChatMessage[],
  sessionId: string,
  streamAbort: AbortController,
  safeWrite: (data: string) => void,
  app: FastifyInstance,
): Promise<string> {
  let fullContent = "";

  const ollamaResponse = await fetch(
    `${config.ollamaUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: history
          .filter(m => m.role !== "tool")
          .map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal: streamAbort.signal,
    },
  );

  if (!ollamaResponse.ok) {
    const errText = await ollamaResponse.text();
    app.log.error(`Ollama error ${ollamaResponse.status}: ${errText}`);
    safeWrite(`data: ${JSON.stringify({ type: "error", message: `Ollama error: ${ollamaResponse.status}` })}\n\n`);
    return fullContent;
  }

  const reader = ollamaResponse.body?.getReader();
  if (!reader) {
    safeWrite(`data: ${JSON.stringify({ type: "error", message: "No response body from Ollama" })}\n\n`);
    return fullContent;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  let streamingAssistantIndex: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.message?.content) {
          const token = chunk.message.content;
          fullContent += token;

          // Keep in-memory history updated during streaming so endpoints can
          // return a partial assistant response mid-stream.
          if (streamingAssistantIndex === null) {
            history.push({ role: "assistant", content: "" });
            streamingAssistantIndex = history.length - 1;
          }
          history[streamingAssistantIndex]!.content += token;

          emitToSubscribers(sessionId, { type: "token", content: token });
          safeWrite(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
        }
      } catch {
        // partial JSON
      }
    }
  }

  if (fullContent) {
    persistMessageGlobal(sessionId, "assistant", fullContent);
  }

  return fullContent;
}
