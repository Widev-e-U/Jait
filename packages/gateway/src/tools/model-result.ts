import type { ToolResult } from "./contracts.js";

export const MODEL_RESULT_MAX_CHARS = 30_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Preserve the UI result; only the copy entering model history loses display echoes. */
export function projectModelData(data: unknown): unknown {
  if (!record(data)) return data;
  const copy = { ...data };
  delete copy.terminalOutputAnsi;
  // terminalOutput can contain useful output when no canonical output exists.
  if (typeof copy.output === "string") delete copy.terminalOutput;
  return copy;
}

/** Bound structured data without cutting its serialized JSON into invalid fragments. */
function prefix(text: string, length: number): string {
  const value = text.slice(0, length);
  const last = value.charCodeAt(value.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? value.slice(0, -1) : value;
}

export function boundModelData(data: unknown, maxChars = MODEL_RESULT_MAX_CHARS): unknown {
  const serialized = JSON.stringify(data);
  if (!serialized || serialized.length <= maxChars) return data;
  const result: Record<string, unknown> = {
    truncated: true,
    originalChars: serialized.length,
    preview: "",
  };
  // Retain execution/evidence status even when the bulk payload is clipped.
  if (record(data)) for (const key of ["ok", "exitCode", "timedOut", "needsInteraction", "terminalId", "executionId", "status", "yielded", "isBackground", "watched", "outputOffset", "outputEndOffset"]) {
    if (["boolean", "number", "string"].includes(typeof data[key]) || data[key] === null) result[key] = typeof data[key] === "string" ? prefix(data[key], 128) : data[key];
  }
  // Small diagnostic/coverage fields survive even when output comes first.
  if (record(data)) for (const key of ["error", "errors", "warnings", "coverage", "limitations", "total", "count", "hasMore", "nextOffset"]) {
    const value = data[key];
    const encoded = JSON.stringify(value);
    if (encoded && encoded.length <= Math.min(1024, Math.floor(maxChars / 4))) {
      result[key] = value;
      if (JSON.stringify(result).length > maxChars / 2) delete result[key];
    }
  }
  // Terminal diagnostics often occur at the end. Label omissions explicitly.
  const text = record(data) && typeof data.output === "string" ? data.output : serialized;
  const excerpt = (length: number): string => {
    if (length >= text.length) return text;
    const head = Math.ceil(length / 2), tail = Math.floor(length / 2);
    const suffix = text.slice(text.length - tail).replace(/^[\uDC00-\uDFFF]/, "");
    return prefix(text, head) + (maxChars < 256 ? "…" : "\n… [omitted middle; full evidence available] …\n") + suffix;
  };
  let lower = 0, upper = text.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    result.preview = excerpt(middle);
    if (JSON.stringify(result).length <= maxChars) lower = middle;
    else upper = middle - 1;
  }
  result.preview = lower ? excerpt(lower) : "";
  return result;
}

export function serializeToolResultForModel(result: Pick<ToolResult, "ok" | "message" | "data">): string {
  let data = projectModelData(result.data);
  if (record(data)) {
    data = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== result.message));
    if (!Object.keys(data as object).length) data = undefined;
  }
  return JSON.stringify(boundModelData({
    ok: result.ok, message: result.message, ...(data === undefined ? {} : { data }),
  }));
}
