import type { JaitDB } from "../db/index.js";
import { subAgentHistory } from "../db/schema.js";

/**
 * Extraction / persistence helpers for sub-agent (nested agent) payloads that
 * ride inside tool-call `data`. The full sub-agent body (content segments,
 * executed tool calls, etc.) is stored in its own `sub_agent_history` row so
 * the parent message's `tool_calls` column can stay small. The message keeps a
 * light stub (`{ subAgentId, performative, rounds, durationMs }`) which the UI
 * uses to render a collapsed summary and lazy-load the rest.
 */

export interface SubAgentPayload {
  subAgentId: string;
  content?: string;
  performative?: string;
  rounds?: number;
  durationMs?: number;
  segments?: unknown;
  toolCalls?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function collectFromData(data: Record<string, unknown> | undefined, out: SubAgentPayload[]): void {
  if (!data) return;
  const subAgentId = data["subAgentId"];
  if (typeof subAgentId !== "string" || !subAgentId) return;
  out.push({
    subAgentId,
    content:
      typeof data["content"] === "string"
        ? data["content"]
        : typeof data["partialContent"] === "string"
          ? data["partialContent"]
          : undefined,
    performative: typeof data["performative"] === "string" ? data["performative"] : undefined,
    rounds: typeof data["rounds"] === "number" ? data["rounds"] : undefined,
    durationMs: typeof data["durationMs"] === "number" ? data["durationMs"] : undefined,
    segments: Array.isArray(data["segments"]) ? data["segments"] : undefined,
    toolCalls: Array.isArray(data["toolCalls"]) ? data["toolCalls"] : undefined,
  });
}

/** Extract all sub-agent payloads from a tool-calls JSON string. */
export function extractSubAgentPayloads(toolCallsJson: string | undefined | null): SubAgentPayload[] {
  if (!toolCallsJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCallsJson);
  } catch {
    return [];
  }
  const out: SubAgentPayload[] = [];
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const rec = asRecord(entry);
      if (!rec) continue;
      collectFromData(asRecord(rec["data"]), out);
    }
  } else {
    const rec = asRecord(parsed);
    if (rec) collectFromData(asRecord(rec["data"]), out);
  }
  return out;
}

/** Replace full sub-agent `data` bodies with lightweight stubs in a tool-calls JSON string. */
export function stripSubAgentPayloads(toolCallsJson: string | undefined | null): string | undefined {
  if (!toolCallsJson) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCallsJson);
  } catch {
    return undefined;
  }
  const rewrite = (entry: unknown): unknown => {
    const rec = asRecord(entry);
    if (!rec) return entry;
    const data = asRecord(rec["data"]);
    const subAgentId = data?.["subAgentId"];
    if (typeof subAgentId !== "string" || !subAgentId) return entry;
    const stub: Record<string, unknown> = { subAgentId };
    if (typeof data["performative"] === "string") stub["performative"] = data["performative"];
    if (typeof data["rounds"] === "number") stub["rounds"] = data["rounds"];
    if (typeof data["durationMs"] === "number") stub["durationMs"] = data["durationMs"];
    return { ...rec, data: stub };
  };
  if (Array.isArray(parsed)) {
    return JSON.stringify(parsed.map(rewrite));
  }
  return JSON.stringify(rewrite(parsed));
}

/** Persist each sub-agent payload into `sub_agent_history`, keyed by subAgentId. */
export function persistSubAgentHistories(
  db: JaitDB,
  sessionId: string,
  messageId: string,
  toolCallsJson: string | undefined | null,
): void {
  const payloads = extractSubAgentPayloads(toolCallsJson);
  if (payloads.length === 0) return;
  const createdAt = new Date().toISOString();
  for (const p of payloads) {
    try {
      db.insert(subAgentHistory)
        .values({
          subAgentId: p.subAgentId,
          sessionId,
          messageId,
          content: p.content ? JSON.stringify(p.content) : null,
          performative: p.performative ?? null,
          rounds: p.rounds ?? null,
          durationMs: p.durationMs ?? null,
          segments: p.segments ? JSON.stringify(p.segments) : null,
          toolCalls: p.toolCalls ? JSON.stringify(p.toolCalls) : null,
          createdAt,
        })
        .onConflictDoUpdate({
          target: subAgentHistory.subAgentId,
          set: {
            sessionId,
            messageId,
            content: p.content ? JSON.stringify(p.content) : null,
            performative: p.performative ?? null,
            rounds: p.rounds ?? null,
            durationMs: p.durationMs ?? null,
            segments: p.segments ? JSON.stringify(p.segments) : null,
            toolCalls: p.toolCalls ? JSON.stringify(p.toolCalls) : null,
          },
        })
        .run();
    } catch {
      // Persistence of sub-agent history must never break message write.
    }
  }
}
