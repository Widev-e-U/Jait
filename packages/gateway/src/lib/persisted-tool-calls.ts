import { limitUtf8, serializeBoundedJson } from "./bounded-json.js";

export interface PersistedToolCallSerializationOptions {
  maxBytes?: number;
  forceCompact?: boolean;
  detailBytes?: number;
  textBytes?: number;
  markCompacted?: boolean;
}

const DEFAULT_MAX_BYTES = 512_000;

function compactPersistedToolCall(
  value: unknown,
  index: number,
  detailBytes: number,
  textBytes: number,
  markCompacted: boolean,
): Record<string, unknown> {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const compactJson = (field: unknown) =>
    JSON.parse(serializeBoundedJson(field, detailBytes)) as unknown;
  const compact: Record<string, unknown> = {
    callId: limitUtf8(
      typeof record["callId"] === "string" ? record["callId"] : `truncated-${index}`,
      1_024,
      "",
    ),
    tool: limitUtf8(typeof record["tool"] === "string" ? record["tool"] : "unknown", 1_024, ""),
    args: compactJson(record["args"] ?? {}),
    ok: record["ok"] === true,
    message: limitUtf8(typeof record["message"] === "string" ? record["message"] : "", textBytes),
  };

  for (const key of ["parentCallId", "status", "approvalRequestId", "approvalState"] as const) {
    if (typeof record[key] === "string") compact[key] = limitUtf8(record[key], 1_024, "");
  }
  for (const key of ["startedAt", "completedAt", "retryCount"] as const) {
    if (typeof record[key] === "number" && Number.isFinite(record[key])) compact[key] = record[key];
  }
  if (typeof record["output"] === "string") {
    compact["output"] = limitUtf8(record["output"], textBytes);
  }
  if (record["data"] !== undefined) compact["data"] = compactJson(record["data"]);
  if (markCompacted) compact["storageCompacted"] = true;
  return compact;
}

export function serializePersistedToolCalls(
  toolCalls: string | undefined,
  options: PersistedToolCallSerializationOptions = {},
): string | null {
  if (!toolCalls) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCalls);
  } catch {
    return "[]";
  }
  if (!Array.isArray(parsed)) return "[]";

  const maxBytes = Math.max(1_024, Math.floor(options.maxBytes ?? DEFAULT_MAX_BYTES));
  if (!options.forceCompact && Buffer.byteLength(toolCalls, "utf8") <= maxBytes) return toolCalls;

  const initialDetailBytes = Math.max(128, Math.floor(options.detailBytes ?? 32_000));
  const initialTextBytes = Math.max(128, Math.floor(options.textBytes ?? 8_000));
  const passes = [
    [initialDetailBytes, initialTextBytes],
    [Math.min(initialDetailBytes, 4_000), Math.min(initialTextBytes, 2_000)],
    [Math.min(initialDetailBytes, 512), Math.min(initialTextBytes, 512)],
  ] as const;

  for (const [detailBytes, textBytes] of passes) {
    const compact = parsed.map((entry, index) =>
      compactPersistedToolCall(
        entry,
        index,
        detailBytes,
        textBytes,
        options.markCompacted === true,
      ));
    const serialized = JSON.stringify(compact);
    if (Buffer.byteLength(serialized, "utf8") <= maxBytes) return serialized;
  }

  const metadataOnly: Record<string, unknown>[] = [];
  for (const [index, entry] of parsed.entries()) {
    const compact = compactPersistedToolCall(
      entry,
      index,
      128,
      128,
      options.markCompacted === true,
    );
    delete compact["data"];
    delete compact["output"];
    const candidate = JSON.stringify([...metadataOnly, compact]);
    if (Buffer.byteLength(candidate, "utf8") > maxBytes) break;
    metadataOnly.push(compact);
  }
  return JSON.stringify(metadataOnly);
}
