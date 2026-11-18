const TRUNCATION_SUFFIX = "… [truncated by Jait]";

interface CompactLimits {
  maxDepth: number;
  maxStringChars: number;
  maxArrayItems: number;
  maxObjectEntries: number;
}

/**
 * Slice without ever splitting a UTF-16 surrogate pair. Truncating mid-pair
 * would emit a lone surrogate, which is malformed UTF-16 and encodes to a
 * 3-byte replacement character in strict UTF-8 encoders.
 */
function safeSlice(value: string, end: number): string {
  if (end <= 0) return "";
  if (end >= value.length) return value;
  const code = value.charCodeAt(end - 1);
  const next = value.charCodeAt(end);
  const splitsPair = code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  return value.slice(0, splitsPair ? end - 1 : end);
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const keep = Math.max(0, maxChars - TRUNCATION_SUFFIX.length);
  return safeSlice(value, keep) + TRUNCATION_SUFFIX;
}

function compactJsonValue(
  value: unknown,
  limits: CompactLimits,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return truncateString(value, limits.maxStringChars);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (depth >= limits.maxDepth) return "[nested value truncated]";

  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular reference]";
  seen.add(value);

  if (Array.isArray(value)) {
    const compact = value
      .slice(0, limits.maxArrayItems)
      .map((entry) => compactJsonValue(entry, limits, depth + 1, seen));
    if (value.length > limits.maxArrayItems) {
      compact.push(`[${value.length - limits.maxArrayItems} more item(s) truncated]`);
    }
    return compact;
  }

  const entries = Object.entries(value);
  const compact: Record<string, unknown> = {};
  for (const [key, entry] of entries.slice(0, limits.maxObjectEntries)) {
    const next = compactJsonValue(entry, limits, depth + 1, seen);
    if (next !== undefined) compact[key] = next;
  }
  if (entries.length > limits.maxObjectEntries) {
    compact["__jait_truncated_entries__"] = entries.length - limits.maxObjectEntries;
  }
  return compact;
}

/**
 * Deterministic UTF-8 byte length independent of the host runtime: Bun counts a
 * lone surrogate as 2 bytes (WTF-8) while Node encodes it as a 3-byte U+FFFD.
 * Counting code points directly keeps the ceiling honest everywhere and lets
 * Rust match it exactly.
 */
function byteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3; // lone high surrogate -> U+FFFD
      }
    } else {
      bytes += 3; // BMP char or lone low surrogate
    }
  }
  return bytes;
}

export function limitUtf8(value: string, maxBytes: number, suffix = TRUNCATION_SUFFIX): string {
  const ceiling = Math.max(0, Math.floor(maxBytes));
  if (byteLength(value) <= ceiling) return value;
  if (ceiling === 0) return "";

  const effectiveSuffix = byteLength(suffix) <= ceiling ? suffix : "";
  const contentCeiling = ceiling - byteLength(effectiveSuffix);
  let low = 0;
  let high = value.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (byteLength(value.slice(0, midpoint)) <= contentCeiling) low = midpoint;
    else high = midpoint - 1;
  }
  return safeSlice(value, low) + effectiveSuffix;
}

function tryStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return null;
  }
}

/**
 * Serialize JSON while enforcing a hard storage ceiling.
 *
 * Values below the limit keep their exact shape. Oversized or circular values
 * are compacted in progressively stricter passes; the final fallback records
 * only that truncation occurred and the original serialized size when known.
 */
export function serializeBoundedJson(value: unknown, maxBytes: number): string {
  const ceiling = Math.max(128, Math.floor(maxBytes));
  const original = tryStringify(value);
  if (original !== null && byteLength(original) <= ceiling) return original;

  const passes: CompactLimits[] = [
    { maxDepth: 8, maxStringChars: 16_000, maxArrayItems: 100, maxObjectEntries: 100 },
    { maxDepth: 5, maxStringChars: 2_000, maxArrayItems: 25, maxObjectEntries: 50 },
    { maxDepth: 3, maxStringChars: 256, maxArrayItems: 10, maxObjectEntries: 20 },
  ];

  for (const limits of passes) {
    const compact = compactJsonValue(value, limits, 0, new WeakSet<object>());
    const serialized = tryStringify(compact);
    if (serialized !== null && byteLength(serialized) <= ceiling) return serialized;
  }

  const fallback = JSON.stringify({
    __jait_truncated__: true,
    ...(original !== null ? { originalBytes: byteLength(original) } : { reason: "unserializable" }),
  });
  return byteLength(fallback) <= ceiling ? fallback : "null";
}

export function limitSerializedJson(json: string, maxBytes: number): string {
  if (byteLength(json) <= maxBytes) return json;
  try {
    return serializeBoundedJson(JSON.parse(json), maxBytes);
  } catch {
    return serializeBoundedJson({
      __jait_truncated__: true,
      reason: "invalid JSON",
      preview: json,
    }, maxBytes);
  }
}
