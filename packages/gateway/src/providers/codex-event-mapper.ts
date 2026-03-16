/**
 * Shared mapping from raw Codex CLI JSON-RPC notifications to ProviderEvents.
 *
 * Used by both the local CodexProvider and the RemoteCliProvider so that the
 * same set of event methods is handled regardless of whether the child process
 * is local or proxied via WS.
 */

import type { ProviderEvent } from "./contracts.js";

// ── Public API ───────────────────────────────────────────────────────

/**
 * Convert a raw Codex JSON-RPC notification into zero or more ProviderEvents.
 * Returns an empty array for notifications that should be silently ignored
 * (noisy / redundant / user-echo events).
 */
export function mapCodexNotification(
  method: string,
  params: Record<string, unknown>,
  sessionId: string,
): ProviderEvent[] {
  switch (method) {
    // ── Streaming text tokens ──
    case "item/agentMessage/delta":
    case "codex/event/agent_message_content_delta": {
      const delta =
        typeof params.delta === "string" ? params.delta
          : typeof params.text === "string" ? params.text
            : "";
      if (delta) return [{ type: "token", sessionId, content: delta }];
      return [];
    }

    // ── Reasoning / chain-of-thought tokens — too granular ──
    case "item/reasoning/textDelta":
    case "item/reasoning/summaryTextDelta":
      return [];

    // ── Tool/command output deltas ──
    case "item/commandExecution/outputDelta":
    case "item/fileChange/outputDelta": {
      const delta = typeof params.delta === "string" ? params.delta : "";
      if (delta) {
        const itemId = extractItemId(params);
        if (itemId) return [{ type: "tool.output", sessionId, callId: itemId, content: delta }];
      }
      return [];
    }

    // ── Item lifecycle for tool calls ──
    case "item/started": {
      const item = (params.item ?? params) as Record<string, unknown>;
      const itemId = extractItemId(params);
      const itemType = normalizeItemType(typeof item.type === "string" ? item.type : "");
      if (isToolItemType(itemType)) {
        const category = mapItemTypeToCategory(itemType);
        return [{ type: "tool.start", sessionId, tool: category, args: buildToolArgs(item, category), callId: itemId }];
      }
      return [];
    }

    case "item/completed": {
      const item = (params.item ?? params) as Record<string, unknown>;
      const itemId = extractItemId(params);
      const itemType = normalizeItemType(typeof item.type === "string" ? item.type : "");
      if (isToolItemType(itemType)) {
        const category = mapItemTypeToCategory(itemType);
        const status = typeof item.status === "string" ? item.status : "completed";
        const output = typeof item.output === "string" ? item.output
          : typeof item.summary === "string" ? item.summary
            : "";
        return [{
          type: "tool.result", sessionId, tool: category,
          ok: status !== "error" && status !== "failed",
          message: output, callId: itemId,
        }];
      }
      // Non-tool item completed (e.g. agent message)
      const itemRole = typeof item.role === "string" ? item.role : "";
      const rawType = typeof item.type === "string" ? item.type : "";
      const isUserItem = itemRole === "user" || /user/i.test(rawType);
      if (!isUserItem) {
        const text = extractTextContent(item);
        if (text) return [{ type: "message", sessionId, role: "assistant", content: text }];
      }
      return [];
    }

    case "item/mcpToolCall/progress": {
      const itemId = extractItemId(params);
      const toolName =
        typeof params.name === "string" ? params.name
          : typeof params.toolName === "string" ? params.toolName
            : "mcp-tool";
      return [{ type: "tool.start", sessionId, tool: toolName, args: params.arguments ?? params.args ?? {}, callId: itemId }];
    }

    // ── codex/event item lifecycle (codex 0.111.0+ envelope format) ──
    case "codex/event/item_started": {
      const msg = (params.msg ?? params) as Record<string, unknown>;
      const itemId = extractCodexEventItemId(params);
      const itemType = normalizeItemType(
        typeof msg.type === "string" ? msg.type
          : typeof msg.kind === "string" ? msg.kind
            : "",
      );
      if (isToolItemType(itemType)) {
        const category = mapItemTypeToCategory(itemType);
        return [{ type: "tool.start", sessionId, tool: category, args: buildToolArgs(msg, category), callId: itemId }];
      }
      return [];
    }

    case "codex/event/item_completed": {
      const msg = (params.msg ?? params) as Record<string, unknown>;
      const itemId = extractCodexEventItemId(params);
      const itemType = normalizeItemType(
        typeof msg.type === "string" ? msg.type
          : typeof msg.kind === "string" ? msg.kind
            : "",
      );
      if (isToolItemType(itemType)) {
        const category = mapItemTypeToCategory(itemType);
        const status = typeof msg.status === "string" ? msg.status : "completed";
        const output = typeof msg.output === "string" ? msg.output
          : typeof msg.summary === "string" ? msg.summary
            : typeof msg.last_agent_message === "string" ? msg.last_agent_message
              : "";
        return [{
          type: "tool.result", sessionId, tool: category,
          ok: status !== "error" && status !== "failed",
          message: output, callId: itemId,
        }];
      }
      // Non-tool item completed (e.g. agent message)
      const msgRole = typeof msg.role === "string" ? msg.role : "";
      const rawType = typeof msg.type === "string" ? msg.type : "";
      const isUserItem = msgRole === "user" || /user/i.test(rawType);
      if (!isUserItem) {
        const text = extractTextContent(msg);
        if (text) return [{ type: "message", sessionId, role: "assistant", content: text }];
      }
      return [];
    }

    // ── Turn lifecycle ──
    case "turn/started":
      return [{ type: "turn.started", sessionId }];

    case "turn/completed": {
      const turn = params.turn as Record<string, unknown> | undefined;
      const status = typeof turn?.status === "string" ? turn.status : "";
      const errorObj = turn?.error as Record<string, unknown> | undefined;
      if (status === "failed" && errorObj?.message) {
        return [{ type: "session.error", sessionId, error: String(errorObj.message) }];
      }
      return [{ type: "turn.completed", sessionId }];
    }

    // ── Errors ──
    case "error": {
      const errorObj = params.error as Record<string, unknown> | undefined;
      const message = typeof errorObj?.message === "string" ? errorObj.message : "Codex error";
      return [{ type: "session.error", sessionId, error: message }];
    }

    // ── Agent complete messages ──
    case "codex/event/agent_message": {
      const text =
        typeof params.content === "string" ? params.content
          : typeof params.text === "string" ? params.text
            : typeof params.message === "string" ? params.message
              : typeof params.delta === "string" ? params.delta
                : "";
      if (text) return [{ type: "message", sessionId, role: "assistant", content: text }];
      return [];
    }

    // ── User echo — ignore ──
    case "codex/event/user_message":
      return [];

    // ── Noisy / redundant events — skip ──
    case "item/plan/delta":
    case "turn/plan/updated":
    case "turn/diff/updated":
    case "thread/tokenUsage/updated":
    case "codex/event/token_count":
    case "codex/event/agent_message_delta":
      return [];

    // ── Known lifecycle / status notifications → emit as activity ──
    case "thread/started":
    case "thread/status/changed":
    case "thread/name/updated":
    case "model/rerouted":
    case "configWarning":
    case "deprecationNotice":
    case "account/updated":
    case "skills/changed":
    case "codex/event/mcp_startup_complete":
    case "codex/event/skills_update_available":
      return [{ type: "activity", sessionId, kind: method, summary: `Codex: ${method}`, payload: params }];

    case "codex/event/task_started":
      return [
        { type: "turn.started", sessionId },
        { type: "activity", sessionId, kind: method, summary: `Codex: ${method}`, payload: params },
      ];
    case "codex/event/task_complete":
    case "codex/event/agent_reasoning":
      return [{ type: "activity", sessionId, kind: method, summary: `Codex: ${method}`, payload: params }];

    // ── Session completed (from child.on("exit") wrapper) ──
    case "session/completed":
      return [{ type: "session.completed", sessionId }];

    // ── Turn diff — codex envelope format ──
    case "codex/event/turn_diff":
      return []; // noisy

    default:
      return [{ type: "activity", sessionId, kind: method, summary: `Codex: ${method}`, payload: params }];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

let _nextFallbackId = 1;

function extractItemId(params: Record<string, unknown>): string {
  const item = params.item as Record<string, unknown> | undefined;
  return (
    asString(params.itemId) ??
    asString(item?.id) ??
    asString(params.id) ??
    `codex-item-${_nextFallbackId++}`
  );
}

function extractCodexEventItemId(params: Record<string, unknown>): string {
  const msg = params.msg as Record<string, unknown> | undefined;
  return (
    asString(msg?.item_id) ??
    asString(msg?.itemId) ??
    asString(params.id) ??
    asString(msg?.id) ??
    `codex-evt-${_nextFallbackId++}`
  );
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function extractTextContent(item: Record<string, unknown>): string {
  if (typeof item.content === "string" && item.content.trim()) return item.content;
  if (typeof item.text === "string" && item.text.trim()) return item.text;
  if (typeof item.message === "string" && item.message.trim()) return item.message;
  if (typeof item.output === "string" && item.output.trim()) return item.output;
  if (typeof item.last_agent_message === "string" && item.last_agent_message.trim()) return item.last_agent_message;
  if (Array.isArray(item.content)) {
    const texts = (item.content as Array<Record<string, unknown>>)
      .filter((p) => p.type === "text" || p.type === "output_text")
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .filter(Boolean);
    if (texts.length > 0) return texts.join("\n");
  }
  return "";
}

function normalizeItemType(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-/]+/g, " ")
    .toLowerCase()
    .trim();
}

function isToolItemType(normalized: string): boolean {
  return (
    normalized.includes("command") ||
    normalized.includes("tool") ||
    normalized.includes("function") ||
    normalized.includes("file change") ||
    normalized.includes("file_change") ||
    normalized.includes("patch") ||
    normalized.includes("edit") ||
    normalized.includes("mcp") ||
    normalized.includes("web search")
  );
}

function mapItemTypeToCategory(normalizedType: string): string {
  if (normalizedType.includes("command")) return "execute";
  if (normalizedType.includes("file change") || normalizedType.includes("file_change") ||
    normalizedType.includes("patch") || normalizedType.includes("edit")) return "edit";
  if (normalizedType.includes("file read") || normalizedType.includes("file_read")) return "read";
  if (normalizedType.includes("web search") || normalizedType.includes("web_search")) return "web";
  if (normalizedType.includes("mcp")) return "mcp-tool";
  if (normalizedType.includes("function") || normalizedType.includes("tool")) return "execute";
  return normalizedType || "tool";
}

function buildToolArgs(
  item: Record<string, unknown>,
  category: string,
): Record<string, unknown> {
  const nested = firstObject(item.action, item.input, item.arguments)
  switch (category) {
    case "execute": {
      const cmd =
        asString(item.command) ??
        asString(item.commandLine) ??
        (Array.isArray(item.command) ? (item.command as string[]).join(" ") : undefined) ??
        asString(nested?.command) ??
        asString(item.name) ?? asString(item.title) ?? "";
      return { command: cmd, ...item };
    }
    case "edit":
    case "read": {
      const path =
        asString(item.path) ??
        asString(item.file_path) ??
        asString(item.filePath) ??
        asString(item.file) ??
        asString(item.filename) ??
        asString(item.target_file) ??
        asString(item.targetFile) ??
        asString(item.name) ??
        asString(item.title) ??
        asString(nested?.path) ??
        asString(nested?.file_path) ??
        asString(nested?.filePath) ??
        asString(nested?.file) ??
        asString(nested?.filename) ??
        "";
      const search =
        asString(item.search) ??
        asString(item.old_string) ??
        asString(item.oldString) ??
        asString(nested?.search) ??
        asString(nested?.old_string) ??
        asString(nested?.oldString);
      const replace =
        asString(item.replace) ??
        asString(item.new_string) ??
        asString(item.newString) ??
        asString(nested?.replace) ??
        asString(nested?.new_string) ??
        asString(nested?.newString);
      const content =
        asString(item.content) ??
        asString(item.new_file_contents) ??
        asString(item.newFileContents) ??
        asString(nested?.content) ??
        asString(nested?.new_file_contents) ??
        asString(nested?.newFileContents);
      return { path, ...(search ? { search } : {}), ...(replace ? { replace } : {}), ...(content ? { content } : {}), ...item };
    }
    case "web": {
      const query =
        asString(item.query) ??
        asString(item.search_query) ??
        asString(item.searchQuery) ??
        asString(item.q) ??
        asString(nested?.query) ??
        asString(nested?.search_query) ??
        asString(nested?.searchQuery) ??
        asString(nested?.q) ??
        asString(item.name) ??
        "";
      const url =
        asString(item.url) ??
        asString(item.uri) ??
        asString(nested?.url) ??
        asString(nested?.uri) ??
        "";
      return { ...(query ? { query } : {}), ...(url ? { url } : {}), ...item };
    }
    default:
      return { ...item };
  }
}

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}
