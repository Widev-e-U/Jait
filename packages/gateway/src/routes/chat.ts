import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { type AppConfig } from "../config.js";
import type { JaitDB } from "../db/index.js";
import type { SessionService } from "../services/sessions.js";
import type { UserService } from "../services/users.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolOutputStreamMetadata } from "../tools/contracts.js";
import type { AuditWriter } from "../services/audit.js";
import type { ToolResult } from "../tools/contracts.js";
import type { MemoryEntry, MemoryScope, MemoryService } from "../memory/contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { FileSystemSurface } from "../surfaces/filesystem.js";
import type { WsControlPlane } from "../ws.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ProjectService } from "../services/projects.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ProviderId, ProviderEvent, CliProviderAdapter, RuntimeMode } from "../providers/contracts.js";
import { extractTodoResultItems } from "../providers/todo-result.js";
import { RemoteCliProvider } from "../providers/remote-cli-provider.js";
import { resolveProjectRoot } from "../tools/core/get-fs.js";
import { existsSync } from "node:fs";
import { messages as messagesTable } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "../db/uuidv7.js";
import { requireAuth } from "../security/http-auth.js";
import { signAuthToken } from "../security/http-auth.js";
import { JaitConfigError, resolveJaitLlmConfig, type ResolvedJaitLlmConfig } from "../services/jait-llm.js";
import {
  runAgentLoop,
  retryToolCall,
  buildTieredToolSchemas,
  fromOpenAIName,
  SteeringController,
  type AgentLoopEvent,
  type ExecutedToolCall,
  type LlmContextFlowRound,
  type OpenAIToolCall,
} from "../tools/agent-loop.js";
import { interventionRunResumeRegistry } from "../services/intervention-run-resume.js";
import { matchSkills } from "../services/thread-router.js";
import {
  type ChatMode,
  type PlannedAction,
  isValidChatMode,
} from "../tools/chat-modes.js";
import { buildSystemPrompt, type ModelEndpoint, type PromptContext } from "../tools/prompts/index.js";
import { getResponseStyleInstructions, isResponseStyle, type ResponseStyle } from "../tools/prompts/shared-sections.js";
import type { Skill, SkillRegistry } from "../skills/index.js";
import type { ArchitectureDiagramService } from "../services/architecture-diagrams.js";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
  uiToolCalls?: PersistedToolCall[];
  /** Persisted segments for interleaved rendering */
  segments?: unknown[];
  /** Outbound LLM request snapshots that produced this visible response */
  contextFlow?: LlmContextFlow;
  /** Chain-of-thought / reasoning content (e.g. Gemma 4 thinking) */
  thinking?: string;
}

interface LlmContextFlow {
  provider: string;
  model?: string;
  rounds: LlmContextFlowRound[];
  note?: string;
  memory?: LlmContextFlowMemory;
}

interface LlmContextFlowMemoryEntry {
  id: string;
  scope: MemoryScope;
  source: string;
  sourceType: string;
  sourceId: string;
  sourceSurface: string;
  updatedAt: string;
  content: string;
}

interface LlmContextFlowMemory {
  query: string;
  retrieved: LlmContextFlowMemoryEntry[];
  injectedIds: string[];
  ignoredIds: string[];
  savedIds: string[];
}

function formatExternalProviderFirstTurn(systemPrompt: string, userContent: string, recentContextBlock?: string | null): string {
  const parts = [
    "Jait session instructions:",
    "<system>",
    systemPrompt,
    "</system>",
    "",
  ];
  if (recentContextBlock) {
    parts.push(recentContextBlock, "");
  }
  parts.push("User request:", userContent);
  return parts.join("\n");
}

function normalizeExternalContextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function truncateExternalContextContent(content: string, max = 1200): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function buildExternalProviderRecentContext(history: ChatMessage[], limit = 4): string | null {
  const visibleMessages = history
    .slice(0, -1)
    .filter((message): message is ChatMessage & { role: "user" | "assistant" } => (
      (message.role === "user" || message.role === "assistant")
      && normalizeExternalContextContent(message.content).trim().length > 0
    ))
    .slice(-limit);
  if (visibleMessages.length === 0) return null;

  return [
    `Recent active chat context (last ${limit} messages before this turn):`,
    ...visibleMessages.map((message) => {
      const roleLabel = message.role === "user" ? "User" : "Assistant";
      return `${roleLabel}: ${truncateExternalContextContent(normalizeExternalContextContent(message.content))}`;
    }),
  ].join("\n");
}

export function normalizeProviderSessionError(message: string): string {
  const compact = message.trim() || "Session error";
  const lower = compact.toLowerCase();
  const isAuthOrLimitError = [
    "authentication required",
    "auth required",
    "not authenticated",
    "not logged in",
    "login required",
    "please log in",
    "credentials",
    "api key",
    "usage limit",
    "rate limit",
    "quota",
    "limit reached",
    "limit exceeded",
  ].some((needle) => lower.includes(needle));
  return isAuthOrLimitError ? "Authentication required" : compact;
}

function buildCliProviderSystemPrompt(
  provider: ProviderId,
  model: string | undefined,
  mode: ChatMode,
  promptCtx: PromptContext,
): string {
  return buildSystemPrompt(mode, {
    model: model?.trim() || provider,
    baseUrl: `jait-cli://${provider}`,
    backend: provider,
  }, {
    ...promptCtx,
    // CLI providers need the full Jait tool-control prompt even when the
    // user's normal Jait backend is a compact local model.
    backend: provider,
  });
}

function buildExternalProviderContextFlow(
  requestProvider: string,
  model: string | undefined,
  setupMessage: string,
  systemPrompt: string | null,
  userContent: string,
  sentAt: string,
  note: string,
  memory?: LlmContextFlowMemory,
  recentContextBlock?: string | null,
): LlmContextFlow {
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: setupMessage },
  ];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (recentContextBlock) {
    messages.push({ role: "system", content: recentContextBlock });
  }
  messages.push({ role: "user", content: userContent });

  return {
    provider: requestProvider,
    ...(model ? { model } : {}),
    note,
    ...(memory ? { memory } : {}),
    rounds: [{
      round: 1,
      createdAt: sentAt,
      model: model ?? requestProvider,
      messages,
    }],
  } satisfies LlmContextFlow;
}

function truncateForMemoryBlock(value: string, max = 220): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function shouldIncludeContactMemories(content: string): boolean {
  return /\b(based on what you know|remember|preference|preferences|prefer|my usual|about me|what do you know)\b/i.test(content);
}

function memorySourceLabel(entry: MemoryEntry): string {
  if (entry.source.type === "pre_compaction") {
    return "memory compact"
  }
  return `${entry.source.type}:${entry.source.id}@${entry.source.surface}`;
}

export function isSourceVisible(entry: MemoryEntry): boolean {
  return entry.source.type !== "pre_compaction";
}

function toContextFlowMemoryEntry(entry: MemoryEntry): LlmContextFlowMemoryEntry {
  return {
    id: entry.id,
    scope: entry.scope,
    source: memorySourceLabel(entry),
    sourceType: entry.source.type,
    sourceId: entry.source.id,
    sourceSurface: entry.source.surface,
    updatedAt: entry.updatedAt,
    content: truncateForMemoryBlock(entry.content),
  };
}

function buildRelevantMemoryPromptBlock(entries: MemoryEntry[]): string {
  const lines = entries.slice(0, 5).map((entry) => {
    const content = truncateForMemoryBlock(entry.content);
    return `- [id=${entry.id} scope=${entry.scope} source=${memorySourceLabel(entry)} updated=${entry.updatedAt}] ${content}`;
  });
  return [
    "<relevant_memory>",
    "Use these memories only when they are directly relevant. Do not mention memory IDs unless the user asks for provenance.",
    ...lines,
    "</relevant_memory>",
  ].join("\n");
}

async function retrieveRelevantMemoryContext(
  memoryService: MemoryService | undefined,
  content: string,
): Promise<{ block: string; flow: LlmContextFlowMemory } | null> {
  const query = content.trim();
  if (!memoryService || !query) return null;

  const projectMemories = await memoryService.search(query, 25, "project");
  const byId = new Map<string, MemoryEntry>();
  for (const entry of projectMemories) {
    if (!isSourceVisible(entry)) continue;
    byId.set(entry.id, entry);
  }

  if (shouldIncludeContactMemories(query)) {
    const contactMemories = await memoryService.search(query, Math.max(0, 25 - byId.size), "contact");
    for (const entry of contactMemories) {
      if (!isSourceVisible(entry)) continue;
      byId.set(entry.id, entry);
    }
  }

  const entries = [...byId.values()].slice(0, 5);
  if (entries.length === 0) {
    return {
      block: "",
      flow: {
        query,
        retrieved: [],
        injectedIds: [],
        ignoredIds: [],
        savedIds: [],
      },
    };
  }

  return {
    block: buildRelevantMemoryPromptBlock(entries),
    flow: {
      query,
      retrieved: entries.map(toContextFlowMemoryEntry),
      injectedIds: entries.map((entry) => entry.id),
      ignoredIds: [],
      savedIds: [],
    },
  };
}

/** Serialized tool call info for DB persistence */
interface PersistedToolCall {
  callId: string;
  parentCallId?: string;
  tool: string;
  args: unknown;
  ok: boolean;
  message: string;
  status?: "pending" | "running" | "success" | "error";
  approvalRequestId?: string;
  approvalState?: "pending" | "approved" | "rejected";
  /** @deprecated kept for back-compat with old rows; prefer `data` */
  output?: string;
  /** Full result.data object — round-trips all tool-specific fields */
  data?: unknown;
  startedAt?: number;
  completedAt?: number;
}

function buildSyntheticSkillToolCall(skills: Skill[]): PersistedToolCall | null {
  if (skills.length === 0) return null;
  const names = skills.map((skill) => skill.name);
  return {
    callId: `skill-${randomUUID()}`,
    tool: "skill",
    args: { skills: names.join(", ") },
    ok: true,
    message: `Using skills: ${names.join(", ")}`,
    data: {
      names,
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      })),
    },
    startedAt: Date.now(),
    completedAt: Date.now(),
  };
}

function emitSyntheticSkillToolCall(
  sessionId: string,
  toolCall: PersistedToolCall | null,
  safeWrite: (data: string) => void,
  emitToSubscribers: (sessionId: string, event: StreamEvent) => void,
): void {
  if (!toolCall) return;
  const toolStartEvent = {
    type: "tool_start" as const,
    call_id: toolCall.callId,
    parent_call_id: toolCall.parentCallId,
    tool: toolCall.tool,
    args: toolCall.args,
  };
  safeWrite(`data: ${JSON.stringify(toolStartEvent)}\n\n`);
  emitToSubscribers(sessionId, toolStartEvent as StreamEvent);
  accumulateToolStart(sessionId, toolCall.callId, toolCall.tool, toolCall.args, toolCall.parentCallId);

  const toolResultEvent = {
    type: "tool_result" as const,
    call_id: toolCall.callId,
    parent_call_id: toolCall.parentCallId,
    tool: toolCall.tool,
    ok: true,
    message: toolCall.message,
    data: toolCall.data,
  };
  safeWrite(`data: ${JSON.stringify(toolResultEvent)}\n\n`);
  emitToSubscribers(sessionId, toolResultEvent as StreamEvent);
  accumulateToolResult(sessionId, toolCall.callId, true, toolCall.message, toolCall.data);
}

function buildSyntheticMemoryToolCall(content: string, memoryService: MemoryService | undefined): PersistedToolCall | null {
  const query = content.trim();
  if (!memoryService || !query) return null;
  return {
    callId: `memory-${randomUUID()}`,
    tool: "memory.search",
    args: { query, limit: 25 },
    ok: true,
    message: "Searching memory",
    startedAt: Date.now(),
  };
}

function emitSyntheticToolStart(
  sessionId: string,
  toolCall: PersistedToolCall | null,
  safeWrite: (data: string) => void,
  emitToSubscribers: (sessionId: string, event: StreamEvent) => void,
): void {
  if (!toolCall) return;
  const toolStartEvent = {
    type: "tool_start" as const,
    call_id: toolCall.callId,
    parent_call_id: toolCall.parentCallId,
    tool: toolCall.tool,
    args: toolCall.args,
  };
  safeWrite(`data: ${JSON.stringify(toolStartEvent)}\n\n`);
  emitToSubscribers(sessionId, toolStartEvent as StreamEvent);
  accumulateToolStart(sessionId, toolCall.callId, toolCall.tool, toolCall.args, toolCall.parentCallId);
}

function emitSyntheticToolResult(
  sessionId: string,
  toolCall: PersistedToolCall | null,
  ok: boolean,
  message: string,
  data: unknown,
  safeWrite: (data: string) => void,
  emitToSubscribers: (sessionId: string, event: StreamEvent) => void,
): void {
  if (!toolCall) return;
  toolCall.ok = ok;
  toolCall.message = message;
  toolCall.data = data;
  toolCall.completedAt = Date.now();
  const toolResultEvent = {
    type: "tool_result" as const,
    call_id: toolCall.callId,
    parent_call_id: toolCall.parentCallId,
    tool: toolCall.tool,
    ok,
    message,
    data,
  };
  safeWrite(`data: ${JSON.stringify(toolResultEvent)}\n\n`);
  emitToSubscribers(sessionId, toolResultEvent as StreamEvent);
  accumulateToolResult(sessionId, toolCall.callId, ok, message, data);
}

interface QueuedChatMessage {
  id?: string;
  content: string;
  mode?: ChatMode;
  provider?: ProviderId;
  runtimeMode?: RuntimeMode;
  model?: string | null;
  displaySegments?: Array<
    { type: "text"; text: string }
    | { type: "file"; path: string; name: string; lineRange?: UserDisplayLineRange }
    | { type: "project"; path: string; name: string }
    | { type: "terminal"; terminalId: string; name: string; projectRoot?: string; lineRange?: UserDisplayLineRange; selectedText?: string }
    | { type: "image"; name: string; mimeType: string; data: string }
    | { type: "attachment"; name: string; mimeType: string; data: string }
  >;
}

interface UserDisplayLineRange {
  startLine: number;
  endLine: number;
}

function parseUserDisplaySegments(raw: unknown): Array<
  { type: "text"; text: string }
  | { type: "file"; path: string; name: string; lineRange?: UserDisplayLineRange }
  | { type: "project"; path: string; name: string }
  | { type: "terminal"; terminalId: string; name: string; projectRoot?: string; lineRange?: UserDisplayLineRange; selectedText?: string }
  | { type: "image"; name: string; mimeType: string; data: string }
  | { type: "attachment"; name: string; mimeType: string; data: string }
> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const segments: Array<
    { type: "text"; text: string }
    | { type: "file"; path: string; name: string; lineRange?: UserDisplayLineRange }
    | { type: "project"; path: string; name: string }
    | { type: "terminal"; terminalId: string; name: string; projectRoot?: string; lineRange?: UserDisplayLineRange; selectedText?: string }
    | { type: "image"; name: string; mimeType: string; data: string }
    | { type: "attachment"; name: string; mimeType: string; data: string }
  > = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      segments.push({ type: "text", text: record.text });
      continue;
    }
    if (record.type === "file" && typeof record.path === "string") {
      segments.push({
        type: "file",
        path: record.path,
        name: typeof record.name === "string" ? record.name : record.path.split("/").pop() ?? record.path,
        ...(parseDisplayLineRange(record) ? { lineRange: parseDisplayLineRange(record)! } : {}),
      });
      continue;
    }
    if (record.type === "project" && typeof record.path === "string") {
      segments.push({
        type: "project",
        path: record.path,
        name: typeof record.name === "string" ? record.name : record.path.split("/").pop() ?? record.path,
      });
      continue;
    }
    if (record.type === "terminal" && typeof record.terminalId === "string") {
      segments.push({
        type: "terminal",
        terminalId: record.terminalId,
        name: typeof record.name === "string" ? record.name : record.terminalId,
        ...(typeof record.projectRoot === "string" ? { projectRoot: record.projectRoot } : {}),
        ...(parseDisplayLineRange(record) ? { lineRange: parseDisplayLineRange(record)! } : {}),
        ...(typeof record.selectedText === "string" ? { selectedText: record.selectedText } : {}),
      });
      continue;
    }
    if (
      record.type === "image"
      && typeof record.data === "string"
      && typeof record.mimeType === "string"
      && record.mimeType.startsWith("image/")
    ) {
      segments.push({
        type: "image",
        data: record.data,
        mimeType: record.mimeType,
        name: typeof record.name === "string" ? record.name : "Image",
      });
      continue;
    }
    if (
      record.type === "attachment"
      && typeof record.data === "string"
      && typeof record.mimeType === "string"
      && !record.mimeType.startsWith("image/")
    ) {
      segments.push({
        type: "attachment",
        data: record.data,
        mimeType: record.mimeType,
        name: typeof record.name === "string" ? record.name : "Attachment",
      });
    }
  }
  return segments.length > 0 ? segments : undefined;
}

function decodeUploadedAttachmentData(data: string): string {
  const payload = data.startsWith("data:") ? data.split(",")[1] ?? "" : data;
  return Buffer.from(payload, "base64").toString("utf-8");
}

function buildUploadedAttachmentPromptBlock(
  attachments: Array<{ name: string; mimeType: string; data: string }>,
): string | null {
  const sections = attachments.flatMap((attachment) => {
    if (attachment.mimeType.startsWith("image/")) return [];
    const decoded = decodeUploadedAttachmentData(attachment.data);
    const truncated = decoded.length > 20_000;
    return [
      `[File: ${attachment.name} (${attachment.mimeType})]\n${decoded.slice(0, 20_000)}${truncated ? "\n[truncated]" : ""}`,
    ];
  });
  return sections.length > 0 ? `Uploaded file attachments:\n\n${sections.join("\n\n")}` : null;
}

function appendUploadedAttachmentPromptBlock(
  content: string,
  attachments: Array<{ name: string; mimeType: string; data: string }>,
): string {
  const block = buildUploadedAttachmentPromptBlock(attachments);
  if (!block) return content;
  return content.trim() ? `${content}\n\n${block}` : block;
}

function parseDisplayLineRange(record: Record<string, unknown>): UserDisplayLineRange | null {
  const candidate = record["lineRange"];
  if (!candidate || typeof candidate !== "object") return null;
  const range = candidate as Record<string, unknown>;
  const startLine = typeof range["startLine"] === "number" ? Math.floor(range["startLine"]) : 0;
  const endLine = typeof range["endLine"] === "number" ? Math.floor(range["endLine"]) : 0;
  if (startLine < 1 || endLine < startLine) return null;
  return { startLine, endLine };
}

function parseQueuedChatMessages(raw: unknown): QueuedChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const queue: QueuedChatMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.content !== "string" || !record.content.trim()) continue;
    const displaySegments = parseUserDisplaySegments(record.displaySegments);
    queue.push({
      id: typeof record.id === "string" ? record.id : undefined,
      content: record.content,
      mode: isValidChatMode(record.mode) ? record.mode : undefined,
      provider: record.provider === "jait" || record.provider === "codex" || record.provider === "claude-code"
        ? record.provider
        : undefined,
      runtimeMode: record.runtimeMode === "full-access" || record.runtimeMode === "supervised"
        ? record.runtimeMode
        : undefined,
      model: typeof record.model === "string" ? record.model : null,
      displaySegments,
    });
  }
  return queue;
}

// ── In-memory state ──────────────────────────────────────────────────

const sessionHistory = new Map<string, ChatMessage[]>();
const activeStreams = new Set<string>();
const sessionAbortControllers = new Map<string, AbortController>();
const drainingQueuedSessions = new Set<string>();

/**
 * Live streaming accumulator — holds the current assistant message's partial
 * content, tool calls, and segments while the stream is active.
 * Without this, a page reload during streaming would lose the already-streamed
 * content because the in-memory history only receives the assistant entry on
 * completion.  The snapshot builder reads this to synthesize a partial
 * assistant message for reconnecting clients.
 */
interface StreamingAccumulator {
  content: string;
  toolCalls: PersistedToolCall[];
  segments: Array<{ type: "text"; content: string } | { type: "thinking"; content: string } | { type: "toolGroup"; callIds: string[] }>;
  thinking: string;
}
const sessionStreamingState = new Map<string, StreamingAccumulator>();
const sessionStreamSeq = new Map<string, number>();

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function firstPathFromChanges(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const path = firstNonEmptyString(
      item["path"],
      item["file_path"],
      item["filePath"],
      item["file"],
      item["filename"],
      item["target_file"],
      item["targetFile"],
      item["relative_path"],
    );
    if (path) return path;
  }
  return undefined;
}

export function getExternalFileMutationPath(tool: string, args: unknown): string | null {
  const normalized = tool.trim().toLowerCase();
  const fileMutationTools = new Set([
    "edit",
    "multiedit",
    "file.write",
    "write",
    "create_file",
    "create-file",
    "replace_string_in_file",
    "replace-string-in-file",
    "insert_edit_into_file",
    "insert-edit-into-file",
  ]);
  if (!fileMutationTools.has(normalized)) return null;

  const input = args && typeof args === "object" && !Array.isArray(args)
    ? args as Record<string, unknown>
    : {};
  const nested = firstObject(input["action"], input["input"], input["arguments"]);
  const path = firstNonEmptyString(
    input["path"],
    input["file_path"],
    input["filePath"],
    input["file"],
    input["filename"],
    input["target_file"],
    input["targetFile"],
    input["relative_path"],
    firstPathFromChanges(input["changes"]),
    nested?.["path"],
    nested?.["file_path"],
    nested?.["filePath"],
    nested?.["file"],
    nested?.["filename"],
    nested?.["target_file"],
    nested?.["targetFile"],
    nested?.["relative_path"],
    firstPathFromChanges(nested?.["changes"]),
  );
  return typeof path === "string" && path.trim() ? path : null;
}

function getOrCreateAccumulator(sessionId: string): StreamingAccumulator {
  let acc = sessionStreamingState.get(sessionId);
  if (!acc) {
    acc = { content: "", toolCalls: [], segments: [], thinking: "" };
    sessionStreamingState.set(sessionId, acc);
  }
  return acc;
}

/** Append a text token to the streaming accumulator */
function accumulateToken(sessionId: string, token: string): void {
  const acc = getOrCreateAccumulator(sessionId);
  acc.content += token;
  const last = acc.segments[acc.segments.length - 1];
  if (last?.type === "text") {
    acc.segments[acc.segments.length - 1] = { type: "text", content: last.content + token };
  } else {
    acc.segments.push({ type: "text", content: token });
  }
}

/** Append a thinking/reasoning token to the streaming accumulator */
function accumulateThinking(sessionId: string, content: string): void {
  const acc = getOrCreateAccumulator(sessionId);
  acc.thinking += content;
  const last = acc.segments[acc.segments.length - 1];
  if (last?.type === "thinking") {
    acc.segments[acc.segments.length - 1] = { type: "thinking", content: last.content + content };
  } else {
    acc.segments.push({ type: "thinking", content });
  }
}

/** Record a tool call start in the streaming accumulator */
function accumulateToolStart(sessionId: string, callId: string, tool: string, args: unknown, parentCallId?: string): void {
  const acc = getOrCreateAccumulator(sessionId);
  // ACP agents can re-emit an enriched tool.start for the same callId
  // (progressive tool_call_update). Upgrade in place rather than duplicating.
  const existing = acc.toolCalls.find(t => t.callId === callId);
  if (existing) {
    existing.tool = tool;
    existing.args = args;
    if (parentCallId !== undefined) existing.parentCallId = parentCallId;
    return;
  }
  acc.toolCalls.push({ callId, parentCallId, tool, args, ok: true, message: "", startedAt: Date.now() });
  const last = acc.segments[acc.segments.length - 1];
  if (last?.type === "toolGroup") {
    if (!last.callIds.includes(callId)) {
      acc.segments[acc.segments.length - 1] = { type: "toolGroup", callIds: [...last.callIds, callId] };
    }
  } else {
    acc.segments.push({ type: "toolGroup", callIds: [callId] });
  }
}

function accumulateToolApproval(sessionId: string, requestId: string, tool: string, args: unknown): string {
  const callId = `approval-${requestId}`;
  const acc = getOrCreateAccumulator(sessionId);
  const existing = acc.toolCalls.find(t => t.callId === callId);
  if (!existing) {
    acc.toolCalls.push({
      callId,
      tool,
      args,
      ok: true,
      message: "Awaiting approval",
      status: "pending",
      approvalRequestId: requestId,
      approvalState: "pending",
      startedAt: Date.now(),
    });
  }
  const last = acc.segments[acc.segments.length - 1];
  if (last?.type === "toolGroup") {
    if (!last.callIds.includes(callId)) {
      acc.segments[acc.segments.length - 1] = { type: "toolGroup", callIds: [...last.callIds, callId] };
    }
  } else {
    acc.segments.push({ type: "toolGroup", callIds: [callId] });
  }
  return callId;
}

/** Record streaming output for a tool call */
function accumulateToolOutput(sessionId: string, callId: string, content: string): void {
  const acc = sessionStreamingState.get(sessionId);
  if (!acc) return;
  const tc = acc.toolCalls.find(t => t.callId === callId);
  if (tc) tc.message = (tc.message || "") + content;
}

/** Record a tool call completion */
function accumulateToolResult(sessionId: string, callId: string, ok: boolean, message: string, data?: unknown): void {
  const acc = sessionStreamingState.get(sessionId);
  if (!acc) return;
  const tc = acc.toolCalls.find(t => t.callId === callId);
  if (tc) {
    tc.ok = ok;
    tc.message = message;
    tc.data = data;
    tc.completedAt = Date.now();
  }
}

/** Persistent CLI provider sessions — kept alive across turns so the agent retains conversation context */
const activeCliSessions = new Map<string, { providerId: ProviderId; runtimeMode: RuntimeMode; providerSessionId: string; provider: CliProviderAdapter }>();

function parseRuntimeMode(raw: unknown): RuntimeMode {
  return raw === "supervised" ? "supervised" : "full-access";
}

function resolveProviderRuntimeMode(provider: CliProviderAdapter, requestedMode: RuntimeMode): RuntimeMode {
  return provider.info.modes.includes(requestedMode) ? requestedMode : (provider.info.modes[0] ?? "full-access");
}

function getRequestBaseUrl(request: FastifyRequest): string | undefined {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string"
    ? forwardedProto.split(",")[0]?.trim()
    : request.protocol;
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = typeof forwardedHost === "string"
    ? forwardedHost.split(",")[0]?.trim()
    : request.headers.host;
  if (!proto || !host) return undefined;
  return `${proto}://${host}`;
}

type StreamEvent =
  | { type: "token"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call_delta"; call_id: string; index: number; name_delta?: string; args_delta?: string }
  | { type: "tool_start"; tool: string; args: unknown; call_id: string; parent_call_id?: string }
  | { type: "tool_output"; call_id: string; content: string }
  | { type: "tool_result"; call_id: string; tool: string; ok: boolean; message: string; parent_call_id?: string; data?: unknown }
  | { type: "approval_required"; call_id: string; request_id: string; tool: string; args: unknown }
  | { type: "todo_list"; items: { id: number; title: string; status: "not-started" | "in-progress" | "completed" }[] }
  | { type: "context_usage"; system: number; history: number; toolResults: number; tools: number; total: number; limit: number; ratio: number; pruned?: boolean }
  | { type: "done"; session_id: string; prompt_count: number; remaining_prompts: null }
  | { type: "error"; message: string };
type SequencedStreamEvent = StreamEvent & { seq: number };
type StreamSubscriber = (event: SequencedStreamEvent) => void;
const sessionSubscribers = new Map<string, Set<StreamSubscriber>>();

const DEFAULT_UI_MESSAGE_LIMIT = 120;
const MAX_UI_MESSAGE_LIMIT = 500;

type UIMsg = { id: string; role: "user" | "assistant"; content: string; toolCalls?: unknown; segments?: unknown; contextFlow?: LlmContextFlow; thinking?: string };
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
    parentCallId: tc.parentCallId,
    tool: tc.tool,
    args: (typeof tc.args === "object" && tc.args !== null ? tc.args : {}),
    status: tc.status ?? (tc.ok ? "success" : "error"),
    ok: tc.ok,
    message: tc.message,
    approvalRequestId: tc.approvalRequestId,
    approvalState: tc.approvalState,
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

function nextStreamSeq(sessionId: string): number {
  const next = (sessionStreamSeq.get(sessionId) ?? 0) + 1;
  sessionStreamSeq.set(sessionId, next);
  return next;
}

function emitToSubscribers(sessionId: string, event: StreamEvent) {
  const subs = sessionSubscribers.get(sessionId);
  if (!subs || subs.size === 0) return;
  const sequenced = { ...event, seq: nextStreamSeq(sessionId) } as SequencedStreamEvent;
  for (const fn of subs) fn(sequenced);
}

function subscribe(sessionId: string, minSeqExclusive: number, fn: StreamSubscriber) {
  if (!sessionSubscribers.has(sessionId)) sessionSubscribers.set(sessionId, new Set());
  const wrapped: StreamSubscriber = (event) => {
    if (event.seq <= minSeqExclusive) return;
    fn(event);
  };
  sessionSubscribers.get(sessionId)!.add(wrapped);
  return () => {
    const subs = sessionSubscribers.get(sessionId);
    if (subs) {
      subs.delete(wrapped);
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

function windowMessages<T>(messages: T[], limit: number, before?: number): {
  messages: T[];
  total: number;
  hasMore: boolean;
} {
  const total = messages.length;
  if (typeof before === "number" && before >= 0 && before < total) {
    // Load `limit` messages ending at index `before` (exclusive)
    const end = before;
    const start = Math.max(end - limit, 0);
    return {
      messages: messages.slice(start, end),
      total,
      hasMore: start > 0,
    };
  }
  const start = Math.max(total - limit, 0);
  return {
    messages: messages.slice(start),
    total,
    hasMore: start > 0,
  };
}

function rowToUIMsg(sessionId: string, row: typeof messagesTable.$inferSelect, visibleIndex: number): UIMsg {
  const msg: UIMsg = {
    id: `${sessionId}-${visibleIndex}`,
    role: row.role as "user" | "assistant",
    content: typeof row.content === "string" ? row.content : String(row.content ?? ""),
  };
  if (row.toolCalls) {
    try { msg.toolCalls = JSON.parse(row.toolCalls); } catch { /* ignore */ }
  }
  if (row.segments) {
    try { msg.segments = JSON.parse(row.segments); } catch { /* ignore */ }
  }
  if (row.thinking) {
    msg.thinking = row.thinking;
  }
  if (row.contextFlow) {
    try {
      const parsed = JSON.parse(row.contextFlow) as unknown;
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rounds?: unknown }).rounds)) {
        msg.contextFlow = parsed as LlmContextFlow;
      }
    } catch { /* ignore */ }
  }
  return msg;
}

function persistedMessageWindow(
  db: JaitDB,
  sessionId: string,
  limit: number,
  before?: number,
): { messages: UIMsg[]; total: number; hasMore: boolean } {
  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(messagesTable)
    .where(eq(messagesTable.sessionId, sessionId))
    .get();
  const total = Number(totalRow?.count ?? 0);
  const end = typeof before === "number" && Number.isFinite(before) && before >= 0 && before < total
    ? Math.floor(before)
    : total;
  const start = Math.max(end - limit, 0);
  const rows = start < end
    ? db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.sessionId, sessionId))
      .orderBy(messagesTable.createdAt, messagesTable.id)
      .limit(end - start)
      .offset(start)
      .all()
    : [];
  return {
    messages: rows.map((row, index) => rowToUIMsg(sessionId, row, start + index)),
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
      segments: m.segments,
      contextFlow: m.contextFlow,
      thinking: m.thinking,
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
  const msgs = buildVisibleHistoryEntries(sessionId, history, options).map(({ id, role, content, toolCalls, segments, contextFlow, thinking }) => ({
    id,
    role,
    content,
    toolCalls,
    segments,
    contextFlow,
    thinking,
  }));

  // If there is a live streaming accumulator for this session, inject a
  // synthetic assistant message so that reconnecting clients see the partial
  // content that has been streamed so far.
  const acc = sessionStreamingState.get(sessionId);
  if (acc && (acc.content || acc.toolCalls.length > 0 || acc.thinking)) {
    const last = msgs[msgs.length - 1];
    // Merge into the last assistant message if it exists and has no content yet
    // (the snapshot builder may have emitted a stub). Otherwise append a new one.
    if (last && last.role === "assistant" && !last.content && !last.toolCalls) {
      last.content = acc.content;
      last.toolCalls = acc.toolCalls.length > 0 ? mapPersistedToolCallsForUI(acc.toolCalls) : undefined;
      last.segments = acc.segments.length > 0 ? acc.segments : undefined;
      last.thinking = acc.thinking || undefined;
    } else {
      msgs.push({
        id: `${sessionId}-streaming`,
        role: "assistant",
        content: acc.content,
        toolCalls: acc.toolCalls.length > 0 ? mapPersistedToolCallsForUI(acc.toolCalls) : undefined,
        segments: acc.segments.length > 0 ? acc.segments : undefined,
        contextFlow: undefined,
        thinking: acc.thinking || undefined,
      });
    }
  }

  return msgs;
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

/**
 * Resolve the max agentic loop iterations for a turn.
 * Per-user `JAIT_MAX_ROUNDS` setting takes precedence (clamped to a sane
 * ceiling to avoid runaway loops), then the gateway config default.
 */
const MAX_TOOL_ROUNDS_CEILING = 200;
function resolveMaxToolRounds(
  apiKeys?: Record<string, string>,
  fallback = 40,
): number {
  const raw = apiKeys?.["JAIT_MAX_ROUNDS"]?.trim();
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, MAX_TOOL_ROUNDS_CEILING);
  }
  return fallback;
}

// ── Module-level DB ref for persistence from extracted functions ──────
let _dbRef: JaitDB | undefined;
let _appRef: FastifyInstance | undefined;

// @ts-ignore TS6133 — reserved for upcoming global persistence refactor
function persistMessageGlobal(sessionId: string, role: string, content: string, toolCalls?: string, segments?: string, contextFlow?: string, thinking?: string): void {
  if (!_dbRef) return;
  try {
    _dbRef.insert(messagesTable)
      .values({
        id: randomUUID(),
        sessionId,
        role,
        content,
        toolCalls: toolCalls ?? null,
        segments: segments ?? null,
        contextFlow: contextFlow ?? null,
        thinking: thinking ?? null,
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
  ws?: WsControlPlane;
  sessionState?: SessionStateService;
  projectService?: ProjectService;
  providerRegistry?: ProviderRegistry;
  skillRegistry?: SkillRegistry;
  architectureDiagrams?: ArchitectureDiagramService;
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
  let ws: WsControlPlane | undefined;
  let sessionStateService: SessionStateService | undefined;
  let projectService: ProjectService | undefined;
  let providerRegistry: ProviderRegistry | undefined;
  let skillRegistry: SkillRegistry | undefined;
  let architectureDiagrams: ArchitectureDiagramService | undefined;

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
    ws = deps.ws;
    sessionStateService = deps.sessionState;
    projectService = deps.projectService;
    providerRegistry = deps.providerRegistry;
    skillRegistry = deps.skillRegistry;
    architectureDiagrams = deps.architectureDiagrams;
  } else {
    db = depsOrDb as JaitDB | undefined;
    sessionService = sessionServiceArg;
  }

  // Store refs for persistence from extracted functions
  _dbRef = db;
  _appRef = app;

  const hasTools = !!toolRegistry && toolRegistry.list().length > 0;

  const shouldAutoRenameSession = (name: string | null | undefined) => {
    const normalized = name?.trim() ?? "";
    return !normalized || normalized === "New Chat" || normalized.startsWith("Session ");
  };

  const deriveSessionTitle = (raw: string) => {
    const singleLine = raw
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
    if (!singleLine) return "";
    const cleaned = singleLine.replace(/\s+/g, " ").trim();
    return cleaned.length > 80 ? cleaned.slice(0, 77).trimEnd() + "..." : cleaned;
  };

  const broadcastQueuedMessagesState = (sessionId: string, value: QueuedChatMessage[] | null) => {
    if (!ws) return;
    ws.broadcast(sessionId, {
      type: "ui.state-sync",
      sessionId,
      timestamp: new Date().toISOString(),
      payload: { key: "queued_messages", value },
    });
  };

  const drainQueuedChatMessages = async (sessionId: string): Promise<void> => {
    if (!sessionStateService || !sessionService || !userService) return;
    if (!sessionId || drainingQueuedSessions.has(sessionId) || activeStreams.has(sessionId)) return;

    drainingQueuedSessions.add(sessionId);
    try {
      while (!activeStreams.has(sessionId)) {
        const session = sessionService.getById(sessionId);
        if (!session || session.status !== "active" || !session.userId) return;

        const state = sessionStateService.get(sessionId, ["queued_messages"]);
        const queue = parseQueuedChatMessages(state["queued_messages"]);
        if (queue.length === 0) return;

        const [nextMessage, ...rest] = queue;
        if (!nextMessage) return;

        const user = userService.findById(session.userId);
        if (!user) return;

        sessionStateService.set(sessionId, { queued_messages: rest.length > 0 ? rest : null });
        broadcastQueuedMessagesState(sessionId, rest.length > 0 ? rest : null);

        const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
        const response = await app.inject({
          method: "POST",
          url: "/api/chat",
          headers: { authorization: `Bearer ${token}` },
          payload: {
            content: nextMessage.content,
            sessionId,
            ...(nextMessage.mode ? { mode: nextMessage.mode } : {}),
            ...(nextMessage.provider ? { provider: nextMessage.provider } : {}),
            ...(nextMessage.runtimeMode ? { runtimeMode: nextMessage.runtimeMode } : {}),
            ...(nextMessage.model ? { model: nextMessage.model } : {}),
            ...(nextMessage.displaySegments ? { displaySegments: nextMessage.displaySegments } : {}),
            _queuedDrain: true,
          },
        });

        if (response.statusCode >= 400) {
          const restoredQueue = [nextMessage, ...rest];
          sessionStateService.set(sessionId, { queued_messages: restoredQueue });
          broadcastQueuedMessagesState(sessionId, restoredQueue);
          app.log.warn({ sessionId, statusCode: response.statusCode }, "Failed to process queued chat message");
          return;
        }
      }
    } finally {
      drainingQueuedSessions.delete(sessionId);
    }
  };

  const appWithQueueDrain = app as FastifyInstance & {
    drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    steerActiveSession?: (sessionId: string, message: string) => Promise<{ ok: boolean; reason?: string }>;
  };
  if (!appWithQueueDrain.drainQueuedChatMessages) {
    app.decorate("drainQueuedChatMessages", drainQueuedChatMessages);
  } else {
    appWithQueueDrain.drainQueuedChatMessages = drainQueuedChatMessages;
  }

  // ── Per-session steering controllers and executed tool call tracking ──
  const sessionSteeringControllers = new Map<string, SteeringController>();
  const sessionExecutedToolCalls = new Map<string, ExecutedToolCall[]>();
  /** Plans produced by plan mode — keyed by session ID */
  const sessionPlans = new Map<string, { id: string; summary: string; actions: PlannedAction[] }>();
  /** Tool-call fingerprints persisted across Continue turns — prevents identical re-calls */
  const sessionFingerprints = new Map<string, Map<string, number>>();

  const steerActiveSession = async (sessionId: string, message: string): Promise<{ ok: boolean; reason?: string }> => {
    if (!message.trim()) return { ok: false, reason: "empty-message" };
    if (!activeStreams.has(sessionId)) return { ok: false, reason: "not-streaming" };
    const controller = sessionSteeringControllers.get(sessionId);
    if (!controller) return { ok: false, reason: "no-controller" };
    controller.steer(message);
    return { ok: true };
  };

  if (!appWithQueueDrain.steerActiveSession) {
    app.decorate("steerActiveSession", steerActiveSession);
  } else {
    appWithQueueDrain.steerActiveSession = steerActiveSession;
  }

  app.log.info(`Chat route: ${hasTools ? toolRegistry!.list().length + " tools available for agent (tiered)" : "no tools (text-only mode)"}`);

  // Hydrate in-memory cache from DB if session not yet loaded
  function hydrateSession(sessionId: string): void {
    if (sessionHistory.has(sessionId)) return;
    if (!db) return;
    const rows = db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.sessionId, sessionId))
      .orderBy(messagesTable.createdAt, messagesTable.id)
      .all();
    if (rows.length > 0) {
      sessionHistory.set(sessionId, [
        { role: "system", content: SYSTEM_PROMPT },
        ...rows.map((r) => {
          let uiToolCalls: PersistedToolCall[] | undefined;
          let segments: unknown[] | undefined;
          let contextFlow: LlmContextFlow | undefined;
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
          if (r.segments) {
            try {
              const parsed = JSON.parse(r.segments) as unknown;
              if (Array.isArray(parsed)) {
                segments = parsed;
              }
            } catch { /* ignore */ }
          }
          if (r.contextFlow) {
            try {
              const parsed = JSON.parse(r.contextFlow) as unknown;
              if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rounds?: unknown }).rounds)) {
                contextFlow = parsed as LlmContextFlow;
              }
            } catch { /* ignore */ }
          }
          return {
            role: r.role as ChatMessage["role"],
            content: r.content,
            uiToolCalls,
            segments,
            contextFlow,
            thinking: r.thinking ?? undefined,
          };
        }),
      ]);
    }
  }

  function persistMessage(sessionId: string, role: string, content: string, toolCalls?: string, segments?: string, contextFlow?: string, thinking?: string): void {
    if (!db) return;
    try {
      db.insert(messagesTable)
        .values({
          id: randomUUID(),
          sessionId,
          role,
          content,
          toolCalls: toolCalls ?? null,
          segments: segments ?? null,
          contextFlow: contextFlow ?? null,
          thinking: thinking ?? null,
          createdAt: new Date().toISOString(),
        })
        .run();
    } catch (err) {
      app.log.error(err, "Failed to persist message");
    }
  }

  function updateLatestAssistantContextFlow(sessionId: string, contextFlow: string): void {
    if (!db) return;
    try {
      const rows = db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.sessionId, sessionId))
        .orderBy(messagesTable.createdAt, messagesTable.id)
        .all();
      const lastAssistant = [...rows].reverse().find((row) => row.role === "assistant");
      if (!lastAssistant) return;
      db.update(messagesTable)
        .set({ contextFlow })
        .where(eq(messagesTable.id, lastAssistant.id))
        .run();
    } catch (err) {
      app.log.error(err, "Failed to update assistant context flow");
    }
  }

  // ── Tool execution helper ──────────────────────────────────────────

  async function executeTool(
    toolName: string,
    args: unknown,
    sessionId: string,
    auth?: { userId?: string; apiKeys?: Record<string, string>; providerId?: string; model?: string; jaitBackend?: string; runtimeMode?: string },
    onOutputChunk?: (chunk: string, metadata?: ToolOutputStreamMetadata) => void,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    if (!toolRegistry) {
      return { ok: false, message: "Tool registry not available" };
    }
    if (signal?.aborted) {
      return { ok: false, message: "Cancelled" };
    }
    const sessionRecord = sessionService?.getById(sessionId);
    const projectRecord = sessionRecord?.projectId
      ? projectService?.getById(sessionRecord.projectId, auth?.userId)
      : null;
    const wsPath = projectRecord?.rootPath ?? sessionRecord?.projectPath;
    const context: ToolContext = {
      sessionId,
      actionId: uuidv7(),
      projectRoot: surfaceRegistry
        ? resolveProjectRoot(surfaceRegistry, sessionId, wsPath)
        : (wsPath?.trim() || process.cwd()),
      requestedBy: "agent",
      userId: auth?.userId,
      apiKeys: auth?.apiKeys,
      providerId: auth?.providerId,
      model: auth?.model,
      jaitBackend: auth?.jaitBackend,
      runtimeMode: auth?.runtimeMode,
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
          : randomUUID();
    const chatMode: ChatMode = isValidChatMode(body["mode"]) ? body["mode"] : "agent";
    const responseStyle: ResponseStyle = isResponseStyle(body["responseStyle"]) ? body["responseStyle"] : "normal";
    let requestProvider = typeof body["provider"] === "string"
      ? (body["provider"] as ProviderId)
      : undefined;
    const swarmWorkerProvider = chatMode === "swarm" && requestProvider && requestProvider !== "jait"
      ? requestProvider
      : undefined;
    if (swarmWorkerProvider) {
      requestProvider = "jait";
    }
    const requestRuntimeMode = parseRuntimeMode(body["runtimeMode"]);
    const displaySegments = parseUserDisplaySegments(body["displaySegments"]);
    const displaySegmentsJson = displaySegments ? JSON.stringify(displaySegments) : undefined;
    const isQueuedDrainRequest = body["_queuedDrain"] === true;

    // Parse file attachments (images / files sent as base64 from the client)
    const rawAttachments = Array.isArray(body["attachments"]) ? body["attachments"] as Array<Record<string, unknown>> : [];
    const attachments = rawAttachments
      .filter((a) => typeof a["name"] === "string" && typeof a["data"] === "string")
      .map((a) => ({
        name: String(a["name"]),
        mimeType: String(a["mimeType"] ?? a["type"] ?? "application/octet-stream"),
        data: String(a["data"]),
      }));

    if (!content.trim() && attachments.length === 0) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", details: "content is required" });
    }
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
      if (content.trim() && shouldAutoRenameSession(session.name)) {
        sessionService.update(sessionId, { name: deriveSessionTitle(content) }, authUser.id);
      }
    }
    const userSettings = userService?.getSettings(authUser.id);
    const userApiKeys = userSettings?.apiKeys ?? {};
    const requestBodyModel = typeof body["model"] === "string" ? (body["model"] as string).trim() : "";
    const jaitCoordinatorModel = swarmWorkerProvider ? "" : requestBodyModel;
    // Use the user's preferred backend, but fall back to the server-level config
    // when the user still has the initial default ("openai") and the server is
    // configured for a different provider (e.g. ollama-only deployments).
    const userBackend = userSettings?.jaitBackend;
    const jaitBackend = (userBackend && userBackend !== "openai")
      ? userBackend
      : (config.llmProvider ?? userBackend ?? "openai");
    let llmRuntime: ResolvedJaitLlmConfig;
    try {
      llmRuntime = resolveJaitLlmConfig({
        config,
        apiKeys: userApiKeys,
        requestedModel: jaitCoordinatorModel || undefined,
        jaitBackend,
      });
      if (!(jaitCoordinatorModel || userApiKeys["OPENAI_MODEL"]?.trim())) {
        llmRuntime = { ...llmRuntime, contextWindow: config.contextWindow };
      }
    } catch (error) {
      if (error instanceof JaitConfigError) {
        return reply.status(400).send({
          error: error.code,
          details: error.message,
        });
      }
      throw error;
    }

    // Set SSE headers (include CORS — reply.raw bypasses @fastify/cors)
    const reqOrigin = request.headers.origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Prevent reverse proxies (nginx etc.) from buffering the SSE stream,
      // which would otherwise swallow chunks and let the connection time out.
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": reqOrigin,
      "Access-Control-Allow-Credentials": "true",
    });

    // Build model endpoint for prompt resolution
    const modelEndpoint: ModelEndpoint = {
      model: llmRuntime.openaiModel,
      baseUrl: llmRuntime.openaiBaseUrl,
      backend: llmRuntime.backend,
    };

    // Build conversation history (hydrate from DB if needed)
    hydrateSession(sessionId);

    // Resolve project root so the system prompt includes it
    const sessionRecord = sessionService?.getById(sessionId);
    const projectRecord = sessionRecord?.projectId
      ? projectService?.getById(sessionRecord.projectId, authUser.id)
      : null;
    const wsRoot = surfaceRegistry
      ? resolveProjectRoot(surfaceRegistry, sessionId, projectRecord?.rootPath ?? sessionRecord?.projectPath)
      : ((projectRecord?.rootPath ?? sessionRecord?.projectPath)?.trim() || process.cwd());
    // Graphify: surface the saved project architecture graph so the agent
    // understands the codebase layout up front (generated via architecture.generate).
    let architectureGraph: string | undefined;
    if (architectureDiagrams && wsRoot) {
      try {
        architectureGraph = architectureDiagrams.getByProject(wsRoot, authUser.id)?.diagram
          ?? architectureDiagrams.getByProject(wsRoot)?.diagram;
      } catch {
        architectureGraph = undefined;
      }
    }
    const promptCtx: PromptContext = {
      projectRoot: wsRoot,
      skills: skillRegistry?.listEnabled(),
      architectureGraph,
      responseStyle,
      backend: llmRuntime.backend,
    };

    if (!sessionHistory.has(sessionId)) {
      sessionHistory.set(sessionId, [
        { role: "system", content: buildSystemPrompt(chatMode, modelEndpoint, promptCtx) },
      ]);
    } else {
      // Update system prompt if mode/model/project changed mid-session
      const h = sessionHistory.get(sessionId)!;
      const modePrompt = buildSystemPrompt(chatMode, modelEndpoint, promptCtx);
      if (h[0]?.role === "system" && h[0].content !== modePrompt) {
        h[0] = { role: "system", content: modePrompt };
      }
    }
    const history = sessionHistory.get(sessionId)!;

    // Build user message — multimodal if attachments are present
    if (attachments.length > 0) {
      const contentParts: unknown[] = [];
      if (content.trim()) {
        contentParts.push({ type: "text", text: content });
      }
      for (const att of attachments) {
        if (att.mimeType.startsWith("image/")) {
          const dataUrl = att.data.startsWith("data:") ? att.data : `data:${att.mimeType};base64,${att.data}`;
          contentParts.push({ type: "image_url", image_url: { url: dataUrl, detail: "auto" } });
        } else {
          // Text/code file — decode and include as text
          const decoded = att.data.startsWith("data:")
            ? Buffer.from(att.data.split(",")[1] ?? "", "base64").toString("utf-8")
            : Buffer.from(att.data, "base64").toString("utf-8");
          contentParts.push({ type: "text", text: `[File: ${att.name}]\n${decoded}` });
        }
      }
      history.push({ role: "user", content: contentParts as unknown as string, segments: displaySegments });
      persistMessage(sessionId, "user", content + attachments.map((a) => ` [attached: ${a.name}]`).join(""), undefined, displaySegmentsJson);
    } else {
      history.push({ role: "user", content, segments: displaySegments });
      persistMessage(sessionId, "user", content, undefined, displaySegmentsJson);
    }
    try {
      sessionService?.touch(sessionId);
      if (sessionRecord?.projectId) {
        projectService?.touch(sessionRecord.projectId);
      }
    } catch { /* session may not exist */ }

    const streamAbort = new AbortController();
    sessionAbortControllers.set(sessionId, streamAbort);

    let fullContent = "";
    let partialToolCalls: PersistedToolCall[] = [];
    let resultSegmentsJson: string | undefined;
    let contextFlowJson: string | undefined;
    let hitMaxRounds = false;
    // Whether the agentic loop already persisted the assistant message via its
    // onPersist callback. The post-loop fallback persists must be skipped when
    // this is true to avoid writing a duplicate DB row (which scrambled message
    // order on reload because the rows share createdAt down to the millisecond).
    let loopPersisted = false;
    activeStreams.add(sessionId);
    // Reset streaming accumulator for this turn so reload snapshots start fresh
    sessionStreamingState.delete(sessionId);
    sessionStreamSeq.set(sessionId, 0);
    if (isQueuedDrainRequest && ws) {
      ws.broadcast(sessionId, {
        type: "message.started" as const,
        sessionId,
        timestamp: new Date().toISOString(),
        payload: { source: "queued_messages" },
      });
    }

    let clientDisconnected = false;
    reply.raw.on("close", () => { clientDisconnected = true; });

    const safeWrite = (data: string) => {
      if (!clientDisconnected) {
        try { reply.raw.write(data); } catch { clientDisconnected = true; }
      }
    };

    // ── SSE keepalive heartbeat ──
    // While the agentic loop runs a long tool or waits for a slow LLM response,
    // no SSE data events are emitted and the connection can go idle for tens of
    // seconds. Browsers and reverse proxies then close the socket, surfacing as
    // "fetch failed" on the frontend and dropping the in-progress assistant
    // message. Emit an SSE comment (": keepalive\n\n") every 15s — comments are
    // ignored by the EventSource/reader parser but keep the TCP connection alive.
    const keepalive = setInterval(() => {
      if (clientDisconnected) { clearInterval(keepalive); return; }
      safeWrite(`: keepalive\n\n`);
    }, 15_000);
    reply.raw.on("close", () => { clearInterval(keepalive); });

    const matchedSkillIds = new Set(matchSkills(content, promptCtx.skills ?? []));
    const matchedSkills = (promptCtx.skills ?? []).filter((skill) => matchedSkillIds.has(skill.id));
    const turnSkillToolCall = buildSyntheticSkillToolCall(matchedSkills);
    emitSyntheticSkillToolCall(sessionId, turnSkillToolCall, safeWrite, emitToSubscribers);
    const memoryToolCall = buildSyntheticMemoryToolCall(content, memoryService);
    emitSyntheticToolStart(sessionId, memoryToolCall, safeWrite, emitToSubscribers);
    let relevantMemory: Awaited<ReturnType<typeof retrieveRelevantMemoryContext>>;
    try {
      relevantMemory = await retrieveRelevantMemoryContext(memoryService, content);
    } catch (err) {
      emitSyntheticToolResult(
        sessionId,
        memoryToolCall,
        false,
        err instanceof Error ? err.message : "Memory search failed",
        undefined,
        safeWrite,
        emitToSubscribers,
      );
      throw err;
    }
    emitSyntheticToolResult(
      sessionId,
      memoryToolCall,
      true,
      relevantMemory?.flow.retrieved.length
        ? `Loaded ${relevantMemory.flow.retrieved.length} relevant memories`
        : "No relevant memories found",
      relevantMemory?.flow ?? null,
      safeWrite,
      emitToSubscribers,
    );
    const memoryFlow = relevantMemory?.flow;
    const memoryBlock = relevantMemory?.block;
    const syntheticToolCalls = [turnSkillToolCall, memoryToolCall].filter((call): call is PersistedToolCall => !!call);

    const providerLabel = requestProvider === "codex"
      ? "Codex"
      : requestProvider === "claude-code"
        ? "Claude Code"
        : config.llmProvider === "openai" ? "OpenAI" : "Ollama";

    // Create steering controller for this session
    const steering = new SteeringController();
    sessionSteeringControllers.set(sessionId, steering);
    const unregisterInterventionResume = interventionRunResumeRegistry.registerChatSession(sessionId, (message) => {
      if (!activeStreams.has(sessionId)) return { status: "not-running" as const };
      const controller = sessionSteeringControllers.get(sessionId);
      if (!controller) return { status: "not-running" as const };
      controller.steer(message);
      return { status: "steered" as const };
    });

    try {
      let usedCliProvider = false;
      // ══ CLI Provider path (codex / claude-code via MCP) ══════════
      if (requestProvider && requestProvider !== "jait" && providerRegistry) {
        const cliWsRoot = surfaceRegistry
          ? resolveProjectRoot(surfaceRegistry, sessionId, projectRecord?.rootPath ?? sessionRecord?.projectPath)
          : ((projectRecord?.rootPath ?? sessionRecord?.projectPath)?.trim() || process.cwd());

        // Detect if the project lives on a remote node (e.g. Windows
        // desktop) and route the CLI provider session there instead of
        // trying to spawn codex/claude-code locally on the gateway.
        const pathExistsLocally = existsSync(cliWsRoot);
        let cliProvider: CliProviderAdapter | null = null;
        let isRemote = false;
        let remoteNodeInfo: { nodeId: string; nodeName: string; platform: string } | null = null;

        if (!pathExistsLocally && ws) {
          // Match path platform to connected FsNodes
          const isWindowsPath = /^[A-Za-z]:[\\/]/.test(cliWsRoot);
          const expectedPlatform = isWindowsPath ? "windows" : null;
          for (const node of ws.getFsNodes()) {
            if (node.isGateway) continue;
            if (expectedPlatform && node.platform !== expectedPlatform) continue;
            if (!node.providers?.includes(requestProvider)) continue;
            cliProvider = new RemoteCliProvider(ws, node.id, requestProvider);
            isRemote = true;
            remoteNodeInfo = { nodeId: node.id, nodeName: node.name, platform: node.platform };
            break;
          }
        }

        // Fall back to the local provider if path exists on the gateway
        if (!cliProvider) {
          cliProvider = providerRegistry.get(requestProvider) ?? null;
        }

        if (!cliProvider) {
          clearInterval(keepalive);
          safeWrite(`data: ${JSON.stringify({ type: "error", message: `Unknown provider: ${requestProvider}` })}\n\n`);
          reply.raw.end();
          return;
        }

        const runtimeMode = resolveProviderRuntimeMode(cliProvider, requestRuntimeMode);

        const available = await cliProvider.checkAvailability();
        if (!available) {
          // Provider is offline or not installed — fall back to Jait
          const reason = cliProvider.info.unavailableReason ?? "CLI not found";
          console.log(`[chat/cli] Provider ${requestProvider} unavailable (${reason}), falling back to jait`);
          safeWrite(`data: ${JSON.stringify({ type: "provider_fallback", from: requestProvider, to: "jait", reason })}\n\n`);
        } else {

        console.log(`[chat/cli] session=${sessionId} wsRoot="${cliWsRoot}" session.projectPath="${sessionRecord?.projectPath}" surfaces=${surfaceRegistry?.getBySession(sessionId)?.length ?? 0}`);

        // Ensure a FileSystemSurface exists for this session so we can
        // back up files before CLI providers (Codex/Claude) write them,
        // enabling the keep/discard (undo) flow.
        // Use _skipBroadcast so the UI doesn't open the project panel.
        let cliFsSurface: FileSystemSurface | null = null;
        if (surfaceRegistry) {
          const fsId = `fs-${sessionId}`;
          const existing = surfaceRegistry.getSurface(fsId);
          if (existing instanceof FileSystemSurface && existing.state === "running") {
            cliFsSurface = existing;
          } else {
            try {
              const prevHandler = surfaceRegistry.onSurfaceStarted;
              surfaceRegistry.onSurfaceStarted = null as any;
              const started = await surfaceRegistry.startSurface("filesystem", fsId, {
                sessionId,
                projectRoot: cliWsRoot,
              });
              surfaceRegistry.onSurfaceStarted = prevHandler;
              cliFsSurface = started as FileSystemSurface;
            } catch { /* best effort */ }
          }
        }

        const mcpServers = [providerRegistry.buildJaitMcpServerRef(config, getRequestBaseUrl(request), {
          sessionId,
          projectRoot: cliWsRoot,
        })];

        // ── Reuse an existing CLI session if one is alive for this Jait session ──
        const cachedCliSession = activeCliSessions.get(sessionId);
        let providerSessionId: string;
        let isNewCliSession = false;

        if (cachedCliSession && cachedCliSession.providerId === requestProvider && cachedCliSession.runtimeMode === runtimeMode) {
          // Existing session with the same provider — try to reuse it
          providerSessionId = cachedCliSession.providerSessionId;
          cliProvider = cachedCliSession.provider;
          console.log(`[chat/cli] Reusing ${requestProvider}/${runtimeMode} session ${providerSessionId} for ${sessionId}`);
        } else {
          // If the user switched providers, stop the old session first
          if (cachedCliSession) {
            try { await cachedCliSession.provider.stopSession(cachedCliSession.providerSessionId); } catch { /* best effort */ }
            activeCliSessions.delete(sessionId);
          }

          const session = await cliProvider.startSession({
            threadId: sessionId,
            workingDirectory: cliWsRoot,
            mode: runtimeMode,
            model: typeof body["model"] === "string" ? body["model"] as string : undefined,
            mcpServers,
          });
          providerSessionId = session.id;
          isNewCliSession = true;
          activeCliSessions.set(sessionId, { providerId: requestProvider, runtimeMode, providerSessionId, provider: cliProvider });
          console.log(`[chat/cli] Started new ${requestProvider}/${runtimeMode}${isRemote ? " (remote)" : ""} session ${providerSessionId} for ${sessionId}`);
        }

        // Tell the frontend about the execution context (node, project)
        safeWrite(`data: ${JSON.stringify({
          type: "session_info",
          provider: requestProvider,
          projectPath: cliWsRoot,
          isRemote,
          ...(remoteNodeInfo ? { remoteNode: remoteNodeInfo } : {}),
        })}\n\n`);

        // Collect full content from CLI provider events
        const contentChunks: string[] = [];
        /** Bytes received via streaming `token` events for the current message block.
         *  Reset when a tool starts so we can correctly detect the next message block. */
        let tokenBytesThisBlock = 0;

        // ── Accumulate tool calls + segments for persistence ──
        const cliToolCalls: PersistedToolCall[] = syntheticToolCalls.map((call) => ({ ...call }));
        const cliSegments: Array<{ type: "text"; content: string } | { type: "toolGroup"; callIds: string[] } | { type: "error"; content: string }> = [];
        /** Error message from a session.error event — persisted instead of normal content. */
        let sessionError: string | null = null;
        /** Track the current pending tool-group callIds (batched between text tokens) */
        let pendingToolGroup: string[] = syntheticToolCalls.map((call) => call.callId);
        let lastSegmentWasText = false;

        /** Flush any buffered text into a text segment */
        const flushTextSegment = () => {
          if (lastSegmentWasText) return; // already flushed
          const text = contentChunks.join("");
          // Only create a segment if there's new text since the last tool group
          const prevTextLen = cliSegments
            .filter((s): s is { type: "text"; content: string } => s.type === "text")
            .reduce((n, s) => n + s.content.length, 0);
          const newText = text.slice(prevTextLen);
          if (newText) {
            cliSegments.push({ type: "text", content: newText });
          }
          lastSegmentWasText = true;
        };

        /** Flush any pending tool group into a segment */
        const flushToolGroup = () => {
          if (pendingToolGroup.length > 0) {
            // Before adding a tool group, flush any preceding text
            flushTextSegment();
            cliSegments.push({ type: "toolGroup", callIds: [...pendingToolGroup] });
            pendingToolGroup = [];
            lastSegmentWasText = false;
          }
        };

        const unsubscribe = cliProvider.onEvent((event: ProviderEvent) => {
          if (event.sessionId !== providerSessionId) {
            return;
          }

          // Map provider events to SSE events the frontend understands
          switch (event.type) {
            case "token":
              // If there's a pending tool group, flush it first
              flushToolGroup();
              contentChunks.push(event.content);
              tokenBytesThisBlock += event.content.length;
              lastSegmentWasText = false; // new text arrived
              accumulateToken(sessionId, event.content);
              safeWrite(`data: ${JSON.stringify({ type: "token", content: event.content })}\n\n`);
              emitToSubscribers(sessionId, { type: "token", content: event.content } as StreamEvent);
              break;
            case "tool.start": {
              // Reset token counter — any subsequent message event for a NEW
              // agent response (after tools run) should be emitted if no
              // tokens were streamed for it.
              tokenBytesThisBlock = 0;
              const callId = event.callId ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              // Accumulate for persistence. ACP agents may re-emit an enriched
              // tool.start for the same callId (progressive tool_call_update),
              // so upgrade the existing entry in place instead of duplicating.
              const existingCliCall = cliToolCalls.find(t => t.callId === callId);
              if (existingCliCall) {
                existingCliCall.tool = event.tool;
                existingCliCall.args = event.args ?? {};
                if (event.parentCallId !== undefined) existingCliCall.parentCallId = event.parentCallId;
              } else {
                cliToolCalls.push({
                  callId,
                  parentCallId: event.parentCallId,
                  tool: event.tool,
                  args: event.args ?? {},
                  ok: true,
                  message: "",
                  startedAt: Date.now(),
                });
                pendingToolGroup.push(callId);
              }

              // Save backup of the original file before external providers mutate it.
              const mutationPath = getExternalFileMutationPath(event.tool, event.args);
              if (mutationPath && cliFsSurface) {
                cliFsSurface.saveExternalBackup(mutationPath).catch(() => {});
              }

              safeWrite(`data: ${JSON.stringify({ type: "tool_start", call_id: callId, parent_call_id: event.parentCallId, tool: event.tool, args: event.args })}\n\n`);
              emitToSubscribers(sessionId, { type: "tool_start", call_id: callId, parent_call_id: event.parentCallId, tool: event.tool, args: event.args } as unknown as StreamEvent);
              accumulateToolStart(sessionId, callId, event.tool, event.args ?? {}, event.parentCallId);
              break;
            }
            case "tool.output": {
              // Accumulate streaming output on the matching tool call
              const tc = cliToolCalls.find(t => t.callId === event.callId);
              if (tc) {
                tc.message = (tc.message || "") + event.content;
              }
              accumulateToolOutput(sessionId, event.callId ?? "", event.content);
              safeWrite(`data: ${JSON.stringify({ type: "tool_output", call_id: event.callId, content: event.content })}\n\n`);
              break;
            }
            case "tool.result": {
              const resultCallId = event.callId ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              // Update the matching tool call record
              const tc = cliToolCalls.find(t => t.callId === resultCallId);
              if (tc) {
                tc.ok = event.ok;
                tc.message = event.message || tc.message;
                tc.data = event.data;
                tc.completedAt = Date.now();
              }
              safeWrite(`data: ${JSON.stringify({ type: "tool_result", call_id: resultCallId, parent_call_id: event.parentCallId, tool: event.tool, ok: event.ok, message: event.message, data: event.data })}\n\n`);
              emitToSubscribers(sessionId, { type: "tool_result", call_id: resultCallId, parent_call_id: event.parentCallId, tool: event.tool, ok: event.ok, message: event.message, data: event.data } as StreamEvent);
              accumulateToolResult(sessionId, resultCallId, event.ok, event.message || "", event.data);

              const todoItems = event.ok
                ? extractTodoResultItems(tc?.tool ?? event.tool, event.data, tc?.args)
                : null;
              if (todoItems) {
                const todoListEvent = { type: "todo_list", items: todoItems };
                safeWrite(`data: ${JSON.stringify(todoListEvent)}\n\n`);
                emitToSubscribers(sessionId, todoListEvent as StreamEvent);
                if (sessionStateService) {
                  try { sessionStateService.set(sessionId, { "todo_list": todoItems }); } catch { /* ignore */ }
                }
                if (ws) {
                  ws.broadcast(sessionId, {
                    type: "ui.state-sync",
                    sessionId,
                    timestamp: new Date().toISOString(),
                    payload: { key: "todo_list", value: todoItems },
                  });
                }
              }

              // Emit file_changed for successful external file mutations.
              const mutationPath = getExternalFileMutationPath(tc?.tool ?? event.tool, tc?.args ?? {});
              if (event.ok && mutationPath) {
                  const editName = mutationPath.split(/[/\\]/).pop() ?? mutationPath;
                  safeWrite(`data: ${JSON.stringify({ type: "file_changed", path: mutationPath, name: editName })}\n\n`);
                  // Broadcast to other session clients
                  if (ws) {
                    ws.broadcast(sessionId, {
                      type: "ui.state-sync",
                      sessionId,
                      timestamp: new Date().toISOString(),
                      payload: { key: "file_changed", value: { path: mutationPath, name: editName } },
                    });
                  }
                  // Persist cumulative changed files list
                  if (sessionStateService) {
                    try {
                      const existing = sessionStateService.get(sessionId, ["changed_files"]);
                      const files = Array.isArray(existing["changed_files"]) ? existing["changed_files"] as { path: string; name: string; state?: string }[] : [];
                      if (!files.some((f: { path: string }) => f.path === mutationPath)) {
                        files.push({ path: mutationPath, name: editName, state: "undecided" });
                        sessionStateService.set(sessionId, { changed_files: files });
                      }
                    } catch { /* ignore */ }
                  }
              }
              break;
            }
            case "tool.approval-required": {
              const callId = accumulateToolApproval(sessionId, event.requestId, event.tool, event.args);
              const approvalEvent = { type: "approval_required", call_id: callId, request_id: event.requestId, tool: event.tool, args: event.args } as const;
              safeWrite(`data: ${JSON.stringify(approvalEvent)}\n\n`);
              emitToSubscribers(sessionId, approvalEvent as StreamEvent);
              break;
            }
            case "message":
              if (event.role === "assistant" && event.content) {
                flushToolGroup();
                // `message` events carry the *complete* text of an agent message.
                // If token deltas already streamed this content, skip to avoid
                // doubling the persisted text. Only use as fallback when Codex
                // sends a complete message without preceding token deltas.
                if (tokenBytesThisBlock === 0) {
                  contentChunks.push(event.content);
                  safeWrite(`data: ${JSON.stringify({ type: "token", content: event.content })}\n\n`);
                  emitToSubscribers(sessionId, { type: "token", content: event.content } as StreamEvent);
                }
                lastSegmentWasText = false;
              }
              break;
            case "session.error":
              sessionError = normalizeProviderSessionError(event.error);
              safeWrite(`data: ${JSON.stringify({ type: "error", message: sessionError })}\n\n`);
              emitToSubscribers(sessionId, { type: "error", message: sessionError });
              break;
          }
        });

        const responseStyleBlock = getResponseStyleInstructions(responseStyle);
        const cliSystemPrompt = buildCliProviderSystemPrompt(
          requestProvider,
          typeof body["model"] === "string" ? body["model"] : undefined,
          chatMode,
          promptCtx,
        );
        const cliContentWithAttachments = appendUploadedAttachmentPromptBlock(content, attachments);
        const cliUserContent = memoryBlock ? `${memoryBlock}\n\n${cliContentWithAttachments}` : cliContentWithAttachments;
        const recentContextBlock = isNewCliSession ? buildExternalProviderRecentContext(history) : null;
        let cliContent = cliUserContent;
        if (isNewCliSession) {
          cliContent = formatExternalProviderFirstTurn(cliSystemPrompt, cliUserContent, recentContextBlock);
        } else if (responseStyleBlock) {
          cliContent = `<responseStyle>\n${responseStyleBlock}\n</responseStyle>\n\n${cliContent}`;
        }

        // Register the turn-completion listener BEFORE sending so we never
        // miss a synchronous turn.completed emitted inside sendTurn().
        let turnDoneResolve: (() => void) | null = null;
        const turnDonePromise = new Promise<void>((resolve) => { turnDoneResolve = resolve; });
        const checkDone = cliProvider!.onEvent((event: ProviderEvent) => {
          if (event.sessionId !== providerSessionId) return;
          if (event.type === "session.completed" || event.type === "session.error" || event.type === "turn.completed") {
            if (event.type === "session.error") {
              activeCliSessions.delete(sessionId);
            }
            checkDone();
            turnDoneResolve?.();
          }
        });
        streamAbort.signal.addEventListener("abort", () => {
          cliProvider!.interruptTurn(providerSessionId).catch(() => {});
          checkDone();
          turnDoneResolve?.();
        });

        // Send the turn — with recovery if the cached session died between messages
        try {
          const sentAt = new Date().toISOString();
          const setupContent = [
            "CLI provider session setup captured by Jait.",
            `provider=${requestProvider}`,
            `runtimeMode=${runtimeMode}`,
            `workingDirectory=${cliWsRoot}`,
            `session=${isNewCliSession ? "new" : "reused"}`,
            `remote=${isRemote}`,
            `mcpServers=${JSON.stringify(mcpServers)}`,
            isNewCliSession
              ? "Jait pasted its external-provider system prompt into this new provider session turn."
              : "Jait did not paste its internal system prompt into this provider turn.",
            "Provider-native hidden system prompts may still exist inside the CLI provider and are not visible to Jait.",
          ].join("\n");
          const cliContextFlow = buildExternalProviderContextFlow(
            requestProvider,
            typeof body["model"] === "string" ? body["model"] : undefined,
            setupContent,
            cliSystemPrompt,
            cliUserContent,
            sentAt,
            "CLI providers keep their own session context. This captures the Jait setup metadata, the external-provider system prompt, and the user turn content. On reused CLI sessions, the system prompt is shown for inspection even though it was only sent when Jait initialized or recovered the provider session.",
            memoryFlow,
            recentContextBlock,
          );
          contextFlowJson = JSON.stringify(cliContextFlow);
          safeWrite(`data: ${JSON.stringify({ type: "context_flow", ...cliContextFlow })}\n\n`);
          emitToSubscribers(sessionId, { type: "context_flow", ...cliContextFlow } as unknown as StreamEvent);
          await cliProvider.sendTurn(providerSessionId, cliContent);
        } catch (sendErr) {
          // Session likely died (process exited) — start a fresh one
          console.warn(`[chat/cli] sendTurn failed on cached session, recovering:`, sendErr);
          activeCliSessions.delete(sessionId);
          // Unsubscribe stale listener before recovery creates a new session
          checkDone();

          const freshSession = await cliProvider.startSession({
            threadId: sessionId,
            workingDirectory: cliWsRoot,
            mode: runtimeMode,
            model: typeof body["model"] === "string" ? body["model"] as string : undefined,
            mcpServers,
          });
          providerSessionId = freshSession.id;
          activeCliSessions.set(sessionId, { providerId: requestProvider, runtimeMode, providerSessionId, provider: cliProvider });
          console.log(`[chat/cli] Recovered with new ${requestProvider}/${runtimeMode} session ${providerSessionId}`);

          // Re-register listener for the new session
          const checkDone2 = cliProvider!.onEvent((event: ProviderEvent) => {
            if (event.sessionId !== providerSessionId) return;
            if (event.type === "session.completed" || event.type === "session.error" || event.type === "turn.completed") {
              if (event.type === "session.error") {
                activeCliSessions.delete(sessionId);
              }
              checkDone2();
              turnDoneResolve?.();
            }
          });

          const refreshedSystemPrompt = buildCliProviderSystemPrompt(
            requestProvider,
            typeof body["model"] === "string" ? body["model"] : undefined,
            chatMode,
            promptCtx,
          );
          const recoveryContextBlock = buildExternalProviderRecentContext(history);
          const recoveryContent = formatExternalProviderFirstTurn(refreshedSystemPrompt, cliUserContent, recoveryContextBlock);
          const sentAt = new Date().toISOString();
          const setupContent = [
            "CLI provider recovery session setup captured by Jait.",
            `provider=${requestProvider}`,
            `runtimeMode=${runtimeMode}`,
            `workingDirectory=${cliWsRoot}`,
            "session=new",
            `remote=${isRemote}`,
            `mcpServers=${JSON.stringify(mcpServers)}`,
            "Jait pasted its external-provider system prompt into this recovery provider session turn.",
            "Provider-native hidden system prompts may still exist inside the CLI provider and are not visible to Jait.",
          ].join("\n");
          const cliContextFlow = buildExternalProviderContextFlow(
            requestProvider,
            typeof body["model"] === "string" ? body["model"] : undefined,
            setupContent,
            refreshedSystemPrompt,
            cliUserContent,
            sentAt,
            "CLI providers keep their own session context. This captures the Jait recovery setup metadata, the current Jait session system prompt, and the user turn content.",
            memoryFlow,
            recoveryContextBlock,
          );
          contextFlowJson = JSON.stringify(cliContextFlow);
          safeWrite(`data: ${JSON.stringify({ type: "context_flow", ...cliContextFlow })}\n\n`);
          emitToSubscribers(sessionId, { type: "context_flow", ...cliContextFlow } as unknown as StreamEvent);
          await cliProvider.sendTurn(providerSessionId, recoveryContent);
        }

        // Wait for the turn-completion event (may already be resolved if
        // turn.completed fired synchronously inside sendTurn)
        await turnDonePromise;

        // ── Drain steering messages: send follow-up turns for any messages
        // injected via the /steer endpoint while the CLI provider was running. ──
        while (!streamAbort.signal.aborted && !sessionError) {
          const steered = steering.drain();
          if (steered.length === 0) break;

          const steerContent = steered.map(m => `[STEERING] ${m}`).join("\n\n");
          app.log.info(`[chat/cli] Steering follow-up for session ${sessionId}: ${steerContent.slice(0, 100)}`);

          // Set up a new turn-completion listener
          let steerDoneResolve: (() => void) | null = null;
          const steerDonePromise = new Promise<void>((resolve) => { steerDoneResolve = resolve; });
          const unsubSteerDone = cliProvider!.onEvent((event: ProviderEvent) => {
            if (event.sessionId !== providerSessionId) return;
            if (event.type === "session.completed" || event.type === "session.error" || event.type === "turn.completed") {
              if (event.type === "session.error") {
                sessionError = normalizeProviderSessionError(
                  typeof (event as any).error === "string"
                    ? (event as any).error
                    : typeof (event as any).message === "string"
                      ? (event as any).message
                      : "Session error",
                );
                activeCliSessions.delete(sessionId);
              }
              unsubSteerDone();
              steerDoneResolve?.();
            }
          });

          await cliProvider!.sendTurn(providerSessionId, steerContent);
          await steerDonePromise;
        }

        unsubscribe();
        fullContent = contentChunks.join("");

        // Flush any remaining tool group / trailing text into segments
        flushToolGroup();
        flushTextSegment();

        // Build persistence JSON
        const cliTcJson = cliToolCalls.length > 0 ? JSON.stringify(cliToolCalls) : undefined;
        const cliSegJson = cliSegments.length > 0 ? JSON.stringify(cliSegments) : undefined;

        // Also stash on the outer scope so the done handler can emit them
        partialToolCalls = cliToolCalls;
        resultSegmentsJson = cliSegJson;

        // Persist assistant message with tool calls and segments
        if (sessionError) {
          // A session.error was received — persist the error message so it's visible on reload.
          const errSegJson = JSON.stringify([{ type: "error", content: sessionError }]);
          history.push({
            role: "assistant",
            content: sessionError,
            contextFlow: contextFlowJson ? JSON.parse(contextFlowJson) as LlmContextFlow : undefined,
          });
          persistMessage(sessionId, "assistant", sessionError, undefined, errSegJson, contextFlowJson);
        } else {
          history.push({
            role: "assistant",
            content: fullContent,
            uiToolCalls: cliToolCalls.length > 0 ? cliToolCalls : undefined,
            segments: cliSegments.length > 0 ? cliSegments : undefined,
            contextFlow: contextFlowJson ? JSON.parse(contextFlowJson) as LlmContextFlow : undefined,
          });
          persistMessage(sessionId, "assistant", fullContent, cliTcJson, cliSegJson, contextFlowJson);
        }

        // Session stays alive for the next turn — do NOT stop it.
        // It will be cleaned up on session error, provider switch, or server shutdown.

        usedCliProvider = true;
        } // end availability else

      }

      if (!usedCliProvider) {
        // ══ Agentic loop (OpenAI-compat — works for OpenAI, Ollama, OpenRouter) ═════

        // Build tiered schemas per request — respects user-disabled tools
        const userSettings = userService?.getSettings(authUser.id);
        const disabledTools = userSettings?.disabledTools?.length
          ? new Set(userSettings.disabledTools)
          : undefined;
        const isOllama = llmRuntime.backend === "ollama";
        const toolSchemas = toolRegistry
          ? buildTieredToolSchemas(toolRegistry, disabledTools, { ollamaEssentials: isOllama })
          : [];

        const onEvent = (event: AgentLoopEvent) => {
          emitToSubscribers(sessionId, event as StreamEvent);
          safeWrite(`data: ${JSON.stringify(event)}\n\n`);

          // ── Update streaming accumulator so reload snapshots include partial content ──
          if (event.type === "token") accumulateToken(sessionId, event.content);
          else if (event.type === "thinking") accumulateThinking(sessionId, event.content);
          else if (event.type === "tool_start") accumulateToolStart(sessionId, event.call_id, event.tool, event.args, event.parent_call_id);
          else if (event.type === "tool_output") accumulateToolOutput(sessionId, event.call_id, event.content);
          else if (event.type === "tool_result") accumulateToolResult(sessionId, event.call_id, event.ok, event.message, event.data);

          // ── Cross-client sync: persist & broadcast state changes ──
          const ev = event as Record<string, unknown>;

          // Broadcast todo list updates to all session clients and persist to DB
          if (ev.type === "todo_list" && Array.isArray(ev.items)) {
            if (sessionStateService) {
              try { sessionStateService.set(sessionId, { "todo_list": ev.items }); } catch { /* ignore */ }
            }
            if (ws) {
              ws.broadcast(sessionId, {
                type: "ui.state-sync",
                sessionId,
                timestamp: new Date().toISOString(),
                payload: { key: "todo_list", value: ev.items },
              });
            }
          }

          // Broadcast file change events and persist cumulative list
          if (ev.type === "file_changed" && typeof ev.path === "string") {
            if (ws) {
              ws.broadcast(sessionId, {
                type: "ui.state-sync",
                sessionId,
                timestamp: new Date().toISOString(),
                payload: { key: "file_changed", value: { path: ev.path, name: ev.name } },
              });
            }
            // Persist cumulative changed files list
            if (sessionStateService) {
              try {
                const existing = sessionStateService.get(sessionId, ["changed_files"]);
                const files = Array.isArray(existing["changed_files"]) ? existing["changed_files"] as { path: string; name: string; state?: string }[] : [];
                if (!files.some((f: { path: string }) => f.path === ev.path)) {
                  files.push({ path: ev.path as string, name: (ev.name as string) ?? "", state: "undecided" });
                  sessionStateService.set(sessionId, { "changed_files": files });
                }
              } catch { /* ignore */ }
            }
          }
        };
        const contextRounds: LlmContextFlowRound[] = [];
        const injectedMemoryMessage: ChatMessage | null = memoryBlock
          ? { role: "system", content: memoryBlock }
          : null;
        if (injectedMemoryMessage) history.push(injectedMemoryMessage);
        let result: Awaited<ReturnType<typeof runAgentLoop>>;
        try {
          result = await runAgentLoop(
            {
              llm: llmRuntime,
              history,
              toolSchemas,
              hasTools,
              sessionId,
              auth: {
                userId: authUser.id,
                apiKeys: userApiKeys,
                providerId: swarmWorkerProvider ?? requestProvider,
                model: requestBodyModel || undefined,
                jaitBackend,
                runtimeMode: requestRuntimeMode ?? undefined,
              },
              abort: streamAbort,
              maxRounds: resolveMaxToolRounds(userSettings?.apiKeys, config.agentMaxRounds),
              parallel: true,
              toolRegistry,
              disabledTools,
              mode: chatMode,
              onEvent,
              onContext: (round) => {
                contextRounds.push(round);
                contextFlowJson = JSON.stringify({
                  provider: "jait",
                  model: llmRuntime.openaiModel,
                  rounds: contextRounds,
                  ...(memoryFlow ? { memory: memoryFlow } : {}),
                } satisfies LlmContextFlow);
                const event = {
                  type: "context_flow",
                  provider: "jait",
                  model: llmRuntime.openaiModel,
                  rounds: contextRounds,
                  ...(memoryFlow ? { memory: memoryFlow } : {}),
                };
                emitToSubscribers(sessionId, event as unknown as StreamEvent);
                safeWrite(`data: ${JSON.stringify(event)}\n\n`);
              },
              onPersist: (sid, role, content, tc, seg, thinking) => persistMessage(sid, role, content, tc, seg, contextFlowJson, thinking),
              priorFingerprints: sessionFingerprints.get(sessionId),
              log: app.log,
            },
            executeTool,
            steering,
          );
        } finally {
          if (injectedMemoryMessage) {
            const index = history.indexOf(injectedMemoryMessage);
            if (index >= 0) history.splice(index, 1);
          }
        }
        fullContent = result.content;
        partialToolCalls = result.executedToolCalls as unknown as PersistedToolCall[];
        if (syntheticToolCalls.length > 0) {
          partialToolCalls = [...syntheticToolCalls.map((call) => ({ ...call })), ...partialToolCalls];
        }
        const resultSegments = result.segments.length > 0 ? [...result.segments] : [];
        if (syntheticToolCalls.length > 0) {
          resultSegments.unshift({ type: "toolGroup", callIds: syntheticToolCalls.map((call) => call.callId) });
        }
        resultSegmentsJson = resultSegments.length > 0 ? JSON.stringify(resultSegments) : undefined;
        hitMaxRounds = result.hitMaxRounds;
        loopPersisted = result.persisted === true;
        // Persist fingerprints so a Continue turn reuses them
        sessionFingerprints.set(sessionId, result.fingerprints);

        // Re-serialize contextFlow now that round metrics have been attached
        if (contextRounds.length > 0) {
          contextFlowJson = JSON.stringify({
            provider: "jait",
            model: llmRuntime.openaiModel,
            rounds: contextRounds,
            ...(memoryFlow ? { memory: memoryFlow } : {}),
          } satisfies LlmContextFlow);
          const finalEvent = {
            type: "context_flow",
            provider: "jait",
            model: llmRuntime.openaiModel,
            rounds: contextRounds,
            ...(memoryFlow ? { memory: memoryFlow } : {}),
          };
          emitToSubscribers(sessionId, finalEvent as unknown as StreamEvent);
          safeWrite(`data: ${JSON.stringify(finalEvent)}\n\n`);
        }

        if (contextFlowJson) {
          const lastAssistant = [...history].reverse().find((msg) => msg.role === "assistant");
          if (lastAssistant) {
            lastAssistant.contextFlow = JSON.parse(contextFlowJson) as LlmContextFlow;
          }
          updateLatestAssistantContextFlow(sessionId, contextFlowJson);
        }
        // Track executed tool calls for retry API
        sessionExecutedToolCalls.set(sessionId, result.executedToolCalls);
        // Store plan if plan mode produced one
        if (result.plan) {
          sessionPlans.set(sessionId, result.plan);
        }
      }
    } catch (err) {
      // The OpenAI agentic loop now handles AbortError internally and returns
      // partial results.  This catch only fires for non-abort errors (OpenAI)
      // or for Ollama stream errors (including abort).
      const wasCancelled = err instanceof Error && err.name === "AbortError";
      if (!wasCancelled) app.log.error(err, `${providerLabel} streaming error`);

      // Save partial content for real (non-cancel) errors — but only if the
      // agentic loop didn't already persist this turn's assistant message.
      if (!wasCancelled && !loopPersisted && (fullContent || partialToolCalls.length > 0)) {
        const tcJson = partialToolCalls.length > 0 ? JSON.stringify(partialToolCalls) : undefined;
        persistMessage(sessionId, "assistant", fullContent || "", tcJson, resultSegmentsJson, contextFlowJson);
      } else if (!wasCancelled && !loopPersisted) {
        // No partial content — persist the error message itself so it's visible on reload.
        const errMsg2 = err instanceof Error ? err.message : `Failed to reach ${providerLabel}`;
        persistMessage(sessionId, "assistant", errMsg2, undefined, JSON.stringify([{ type: "error", content: errMsg2 }]), contextFlowJson);
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
    // Skip when the agentic loop already persisted via onPersist (avoids a
    // duplicate row that scrambled message order on reload).
    if (streamAbort.signal.aborted && !loopPersisted && (fullContent || partialToolCalls.length > 0)) {
      const tcJson = partialToolCalls.length > 0 ? JSON.stringify(partialToolCalls) : undefined;
      persistMessage(sessionId, "assistant", fullContent || "", tcJson, resultSegmentsJson, contextFlowJson);
    }

    // Stop the SSE keepalive heartbeat now that the turn is finishing.
    clearInterval(keepalive);

    activeStreams.delete(sessionId);
    sessionAbortControllers.delete(sessionId);
    sessionSteeringControllers.delete(sessionId);
    unregisterInterventionResume();
    sessionStreamingState.delete(sessionId);
    sessionStreamSeq.delete(sessionId);

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

    // Detect whether any tool timed out during this turn
    const hasTimedOutTools = (partialToolCalls ?? []).some(
      (tc) => typeof tc.message === "string" && tc.message.includes("timed out"),
    );

    // Final done event
    const doneEvent = {
      type: "done" as const,
      session_id: sessionId,
      prompt_count: history.filter(m => m.role === "user").length,
      remaining_prompts: null,
      hit_max_rounds: hitMaxRounds,
      has_timed_out_tools: hasTimedOutTools,
    };
    emitToSubscribers(sessionId, doneEvent);
    safeWrite(`data: ${JSON.stringify(doneEvent)}\n\n`);

    try { reply.raw.end(); } catch { /* already closed */ }

    // Notify all WS-subscribed clients that the chat is done so they can refresh.
    if (ws) {
      ws.broadcast(sessionId, {
        type: "message.complete" as const,
        sessionId,
        timestamp: new Date().toISOString(),
        payload: {},
      });
    }
    void drainQueuedChatMessages(sessionId);
  });

  app.post("/api/sessions/:sessionId/approve", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as Record<string, unknown>;
    const requestId = typeof body["requestId"] === "string" ? body["requestId"] : "";
    const approved = body["approved"] !== false;
    if (!requestId) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "requestId is required" });
    }
    if (sessionService) {
      const session = sessionService.getById(sessionId, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
    }
    const activeCliSession = activeCliSessions.get(sessionId);
    if (!activeCliSession) {
      return reply.status(409).send({ error: "CONFLICT", details: "No active provider session for approval" });
    }
    await activeCliSession.provider.respondToApproval(activeCliSession.providerSessionId, requestId, approved);
    return reply.status(200).send({ ok: true });
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
      // The frontend messageFromEnd count can be off by 1 when it includes an
      // optimistic/streaming assistant message that the backend hasn't persisted.
      // Walk backwards to find the nearest user message as a fallback.
      let adjusted = targetVisibleIndex - 1;
      while (adjusted >= 0 && visibleEntries[adjusted]!.role !== "user") adjusted--;
      if (adjusted < 0) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", details: "Only user messages can be edited/restarted" });
      }
      targetVisibleIndex = adjusted;
    }

    if (memoryService) {
      const toFlush = visibleEntries
        .slice(targetVisibleIndex)
        .filter((entry) => typeof entry.content === "string" && entry.content.trim().length > 0)
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
        .orderBy(messagesTable.createdAt, messagesTable.id)
        .all();
      const rowsToDelete = rows.slice(Math.max(0, target.historyIndex - 1));
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
    const query = request.query as { limit?: number | string; before?: number | string };
    const limit = parseMessageLimit(query?.limit);
    const before = typeof query?.before === "number"
      ? query.before
      : typeof query?.before === "string"
        ? Number.parseInt(query.before, 10)
        : undefined;
    const streaming = activeStreams.has(sessionId);
    const windowed = db && !streaming
      ? persistedMessageWindow(db, sessionId, limit, Number.isFinite(before) ? before : undefined)
      : (() => {
          hydrateSession(sessionId);
          const history = sessionHistory.get(sessionId) ?? [];
          const visible = buildVisibleHistoryMessages(sessionId, history, { includePendingAssistantToolCalls: streaming });
          return windowMessages(visible, limit, Number.isFinite(before) ? before : undefined);
        })();
    return {
      sessionId,
      streaming,
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

    const reqOrigin = request.headers.origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": reqOrigin,
      "Access-Control-Allow-Credentials": "true",
    });

    const isStreaming = activeStreams.has(sessionId);
    // Only the DB-windowed idle path can skip hydrating. Sessions without a DB
    // (in-memory history) still need their completed messages loaded from the
    // sessionHistory map, and streaming sessions need partial content too.
    let history: ChatMessage[] = [];
    if (!db || isStreaming) {
      hydrateSession(sessionId);
      history = sessionHistory.get(sessionId) ?? [];
    }

    // Build snapshot. While streaming, prefer in-memory history so partial assistant
    // content is visible immediately (DB persistence may lag until stream completion).
    let snapshotMessages: UIMsg[];
    let total = 0;
    let hasMore = false;
    if (db && !isStreaming) {
      const windowed = persistedMessageWindow(db, sessionId, limit);
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
        seq: sessionStreamSeq.get(sessionId) ?? 0,
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
    const snapshotSeq = sessionStreamSeq.get(sessionId) ?? 0;
    let closed = false;
    let unsubscribe = () => {};
    let keepalive: ReturnType<typeof setInterval> | null = null;
    const closeStream = () => {
      if (closed) return;
      closed = true;
      if (keepalive) clearInterval(keepalive);
      unsubscribe();
      try { reply.raw.end(); } catch { /* already closed */ }
    };

    reply.raw.on("close", () => {
      closeStream();
    });

    // Keep the SSE connection alive during idle periods (long tool runs / slow
    // LLM responses) so browsers/proxies don't drop it with "fetch failed".
    keepalive = setInterval(() => {
      if (closed) return;
      try { reply.raw.write(`: keepalive\n\n`); } catch { closeStream(); }
    }, 15_000);

    unsubscribe = subscribe(sessionId, snapshotSeq, (event) => {
      if (closed) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "done" || event.type === "error") {
          closeStream();
        }
      } catch {
        closeStream();
      }
    });

    // Clean up subscription if client disconnects before stream finishes
    request.raw.on("close", () => {
      closeStream();
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
        .orderBy(messagesTable.createdAt, messagesTable.id)
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
