import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { JaitDB } from "../db/index.js";
import type { SessionService } from "../services/sessions.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/contracts.js";
import type { AuditWriter } from "../services/audit.js";
import type { ToolResult } from "../tools/contracts.js";
import type { MemoryService } from "../memory/contracts.js";
import { messages as messagesTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { uuidv7 } from "../lib/uuidv7.js";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
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
  | { type: "tool_result"; call_id: string; ok: boolean; message: string; data?: unknown }
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

function mapPendingToolCallsForUI(toolCalls: OpenAIToolCall[]): Array<Record<string, unknown>> {
  return toolCalls.map((tc) => ({
    callId: tc.id,
    tool: fromOpenAIName(tc.function.name),
    args: parseToolArguments(tc.function.arguments),
    status: "running",
  }));
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
  for (let i = 0; i < history.length; i++) {
    const m = history[i]!;
    if (m.role === "system" || m.role === "tool") continue;

    const uiToolCalls = (m.role === "assistant" && m.tool_calls && includePendingAssistantToolCalls)
      ? mapPendingToolCallsForUI(m.tool_calls)
      : undefined;

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

Guidelines:
- Be direct and concise.
- When running commands, use the actual tools — don't just suggest commands.
- For multi-step tasks, execute them step by step, checking each result.
- If a command fails, analyze the error and try to fix it.
- When editing files, read them first to understand the context before patching.`;

/** Max agentic loop iterations to prevent infinite loops */
const MAX_TOOL_ROUNDS = 15;

/** OpenAI requires function names to match ^[a-zA-Z0-9_-]+$ — no dots */
function toOpenAIName(name: string): string { return name.replace(/\./g, "_"); }
function fromOpenAIName(name: string): string {
  // Our tools use "namespace.action" format — only the first underscore is the dot
  const idx = name.indexOf("_");
  if (idx === -1) return name;
  return name.slice(0, idx) + "." + name.slice(idx + 1);
}

/** Build OpenAI-format tool schemas from ToolRegistry */
function buildToolSchemas(registry: ToolRegistry) {
  return registry.list().map((t) => ({
    type: "function" as const,
    function: {
      name: toOpenAIName(t.name),
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Serialize messages for OpenAI API (drop undefined fields) */
function serializeMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.tool_calls) msg.tool_calls = m.tool_calls;
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.name) msg.name = m.name;
    return msg;
  });
}

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
  toolRegistry?: ToolRegistry;
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
  let toolRegistry: ToolRegistry | undefined;
  let audit: AuditWriter | undefined;
  let toolExecutor: ChatRouteDeps["toolExecutor"] | undefined;
  let memoryService: MemoryService | undefined;

  if (depsOrDb && typeof depsOrDb === "object" && "sessionService" in depsOrDb) {
    const deps = depsOrDb as ChatRouteDeps;
    db = deps.db;
    sessionService = deps.sessionService;
    toolRegistry = deps.toolRegistry;
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

  const toolSchemas = toolRegistry ? buildToolSchemas(toolRegistry) : [];
  const hasTools = toolSchemas.length > 0;

  app.log.info(`Chat route: ${hasTools ? toolSchemas.length + " tools available for agent" : "no tools (text-only mode)"}`);

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
        ...rows.map((r) => ({
          role: r.role as ChatMessage["role"],
          content: r.content,
        })),
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
      workspaceRoot: process.cwd(),
      requestedBy: "agent",
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

    if (!content.trim()) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", details: "content is required" });
    }

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
        { role: "system", content: SYSTEM_PROMPT },
      ]);
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

    try {
      if (config.llmProvider === "openai") {
        // ══ OpenAI agentic loop ════════════════════════════════════
        const result = await runOpenAIAgentLoop(
          config, history, toolSchemas, hasTools, sessionId,
          streamAbort, safeWrite, app, executeTool,
        );
        fullContent = result.content;
        partialToolCalls = result.executedToolCalls;
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
  app.post("/api/sessions/:sessionId/cancel", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const controller = sessionAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
  });

  // Truncate a session from a specific user message onward (used for edit + replay).
  app.post("/api/sessions/:sessionId/restart-from", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
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
  app.get("/api/sessions/:sessionId/messages", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
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
    const { sessionId } = request.params as { sessionId: string };
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
}

// ══════════════════════════════════════════════════════════════════════
// OpenAI Agentic Loop — tool calling + streaming
// ══════════════════════════════════════════════════════════════════════

interface OpenAIToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}

async function runOpenAIAgentLoop(
  config: AppConfig,
  history: ChatMessage[],
  toolSchemas: OpenAIToolSchema[],
  hasTools: boolean,
  sessionId: string,
  streamAbort: AbortController,
  safeWrite: (data: string) => void,
  app: FastifyInstance,
  executeTool: (name: string, args: unknown, sid: string, onChunk?: (chunk: string) => void, signal?: AbortSignal) => Promise<ToolResult>,
): Promise<{ content: string; executedToolCalls: PersistedToolCall[] }> {
  let fullContent = "";
  const executedToolCalls: PersistedToolCall[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Check if the session was cancelled before starting the next round
    if (streamAbort.signal.aborted) {
      app.log.info(`Agentic loop cancelled for session ${sessionId} — stopping before round ${round}`);
      return { content: fullContent, executedToolCalls };
    }

    const reqBody: Record<string, unknown> = {
      model: config.openaiModel,
      messages: serializeMessages(history),
      stream: true,
    };
    if (hasTools) {
      reqBody.tools = toolSchemas;
      reqBody.tool_choice = "auto";
    }

    let contentText = "";
    let toolCalls: OpenAIToolCall[] = [];
    let finishReason: string | null = null;

    try {
      const openaiResponse = await fetch(
        `${config.openaiBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify(reqBody),
          signal: streamAbort.signal,
        },
      );

      if (!openaiResponse.ok) {
        const errText = await openaiResponse.text();
        app.log.error(`OpenAI error ${openaiResponse.status}: ${errText}`);
        safeWrite(`data: ${JSON.stringify({ type: "error", message: `OpenAI error: ${openaiResponse.status}` })}\n\n`);
        return { content: fullContent, executedToolCalls };
      }

      const reader = openaiResponse.body?.getReader();
      if (!reader) {
        safeWrite(`data: ${JSON.stringify({ type: "error", message: "No response body from OpenAI" })}\n\n`);
        return { content: fullContent, executedToolCalls };
      }

      // Parse the stream, accumulating text content and tool calls
      const parsed = await parseOpenAIStream(
        reader as any, sessionId, safeWrite,
      );
      contentText = parsed.contentText;
      toolCalls = parsed.toolCalls;
      finishReason = parsed.finishReason;
    } catch (fetchErr) {
      // If the abort signal fired during fetch/streaming, return partial results
      // instead of throwing — the caller will persist them.
      if (streamAbort.signal.aborted) {
        app.log.info(`Agentic loop cancelled for session ${sessionId} during LLM streaming (round ${round})`);
        return { content: fullContent, executedToolCalls };
      }
      throw fetchErr; // re-throw non-abort errors
    }

    fullContent += contentText;

    // ── Model returned tool calls → execute them ──
    // Accept tool calls regardless of finish_reason — some providers
    // (and GPT-5 edge cases) return "stop" instead of "tool_calls".
    if (toolCalls.length > 0) {
      if (finishReason && finishReason !== "tool_calls") {
        app.log.warn(
          `LLM returned ${toolCalls.length} tool call(s) with finish_reason="${finishReason}" (expected "tool_calls") — executing anyway`,
        );
      }
      // Push assistant message with tool_calls to history
      history.push({
        role: "assistant",
        content: contentText || "",
        tool_calls: toolCalls,
      });

      // Execute each tool call (abort-aware)
      for (const tc of toolCalls) {
        // Check if cancelled before starting next tool call
        if (streamAbort.signal.aborted) {
          app.log.info(`Agentic loop cancelled for session ${sessionId} — skipping remaining tool calls`);
          // Record skipped tool calls as cancelled so they persist correctly
          for (const remaining of toolCalls) {
            if (executedToolCalls.some(etc => etc.callId === remaining.id)) continue;
            let rArgs: unknown;
            try { rArgs = JSON.parse(remaining.function.arguments); } catch { rArgs = {}; }
            executedToolCalls.push({
              callId: remaining.id,
              tool: fromOpenAIName(remaining.function.name),
              args: rArgs,
              ok: false,
              message: "Cancelled",
              startedAt: Date.now(),
              completedAt: Date.now(),
            });
          }
          return { content: fullContent, executedToolCalls };
        }

        const startedAt = Date.now();
        let args: unknown;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

        const internalName = fromOpenAIName(tc.function.name);

        // Notify frontend (use internal dotted name for display)
        const toolStartEvent: StreamEvent = {
          type: "tool_start",
          tool: internalName,
          args,
          call_id: tc.id,
        };
        emitToSubscribers(sessionId, toolStartEvent);
        safeWrite(`data: ${JSON.stringify(toolStartEvent)}\n\n`);

        app.log.info(`Executing tool: ${internalName}(${tc.function.arguments})`);

        const result = await executeTool(internalName, args, sessionId, (chunk) => {
          const ev: StreamEvent = { type: "tool_output", call_id: tc.id, content: chunk };
          emitToSubscribers(sessionId, ev);
          safeWrite(`data: ${JSON.stringify(ev)}\n\n`);
        }, streamAbort.signal);
        const completedAt = Date.now();

        // Notify frontend of result
        const toolResultEvent: StreamEvent = {
          type: "tool_result",
          call_id: tc.id,
          ok: result.ok,
          message: result.message,
          data: result.data,
        };
        emitToSubscribers(sessionId, toolResultEvent);
        safeWrite(`data: ${JSON.stringify(toolResultEvent)}\n\n`);

        // Push tool result to history for next LLM call
        history.push({
          role: "tool",
          content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
          tool_call_id: tc.id,
          name: tc.function.name,  // keep OpenAI name for serialization
        });

        // Accumulate for DB persistence
        executedToolCalls.push({
          callId: tc.id,
          tool: internalName,
          args,
          ok: result.ok,
          message: result.message,
          data: result.data,
          startedAt,
          completedAt,
        });
      }

      // Loop continues — LLM sees results and responds or calls more tools
      continue;
    }

    // ── Normal text response — done ──
    if (contentText) {
      history.push({ role: "assistant", content: contentText });
      const tcJson = executedToolCalls.length > 0 ? JSON.stringify(executedToolCalls) : undefined;
      persistMessageGlobal(sessionId, "assistant", contentText, tcJson);
    }
    return { content: fullContent, executedToolCalls };
  }

  // Hit max rounds
  app.log.warn(`Agentic loop hit max rounds (${MAX_TOOL_ROUNDS}) for session ${sessionId}`);
  const msg = "\n\n[Reached maximum tool execution rounds. Stopping.]";
  safeWrite(`data: ${JSON.stringify({ type: "token", content: msg })}\n\n`);
  fullContent += msg;
  return { content: fullContent, executedToolCalls };
}

// ── OpenAI SSE stream parser ─────────────────────────────────────────

interface ParsedStream {
  contentText: string;
  toolCalls: OpenAIToolCall[];
  finishReason: string | null;
}

async function parseOpenAIStream(
  reader: ReadableStreamDefaultReader,
  sessionId: string,
  safeWrite: (data: string) => void,
): Promise<ParsedStream> {
  const decoder = new TextDecoder();
  let buffer = "";
  let contentText = "";
  let finishReason: string | null = null;

  // Accumulate tool_calls incrementally
  const toolCallMap = new Map<number, { id: string; type: "function"; function: { name: string; arguments: string } }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      try {
        const chunk = JSON.parse(payload);
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (!delta) continue;

        // Text content
        if (delta.content) {
          contentText += delta.content;
          const tokenEvent = { type: "token" as const, content: delta.content };
          emitToSubscribers(sessionId, tokenEvent);
          safeWrite(`data: ${JSON.stringify(tokenEvent)}\n\n`);
        }

        // Tool calls (streamed incrementally — emit deltas to frontend)
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx: number = tc.index ?? 0;
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
            // Name: only append on subsequent deltas (first delta sets it in init)
            if (!isNew && tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;

            // Stream the delta to the frontend so tool calls appear progressively
            const callId = existing.id || `pending-${idx}`;
            const deltaEvent: StreamEvent = {
              type: "tool_call_delta",
              call_id: callId,
              index: idx,
              name_delta: tc.function?.name || undefined,
              args_delta: tc.function?.arguments || undefined,
            };
            emitToSubscribers(sessionId, deltaEvent);
            safeWrite(`data: ${JSON.stringify(deltaEvent)}\n\n`);
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      } catch {
        // partial JSON chunk
      }
    }
  }

  const toolCalls = [...toolCallMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => tc);

  return { contentText, toolCalls, finishReason };
}

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
