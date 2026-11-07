import { describe, expect, it, vi } from "vitest";
import { serializePersistedToolCalls } from "./persisted-tool-calls.js";

describe("serializePersistedToolCalls", () => {
  it("returns null for empty input", () => {
    expect(serializePersistedToolCalls(undefined)).toBeNull();
    expect(serializePersistedToolCalls("")).toBeNull();
  });

  it("returns [] for invalid JSON", () => {
    expect(serializePersistedToolCalls("not-json")).toBe("[]");
  });

  it("returns [] for non-array JSON", () => {
    expect(serializePersistedToolCalls('{"tool":"file.read"}')).toBe("[]");
  });

  it("keeps small payloads unchanged when under the byte ceiling", () => {
    const payload = JSON.stringify([
      { callId: "c1", tool: "file.read", args: { path: "README.md" }, ok: true },
    ]);
    expect(serializePersistedToolCalls(payload)).toBe(payload);
  });

  it("compacts oversized payloads below the byte ceiling", () => {
    const payload = JSON.stringify([
      {
        callId: "c1",
        tool: "file.read",
        args: { path: "README.md" },
        ok: true,
        output: "x".repeat(200_000),
      },
    ]);
    const serialized = serializePersistedToolCalls(payload, { maxBytes: 4_096 });
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(4_096);
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    expect(parsed[0]["callId"]).toBe("c1");
    expect(parsed[0]["tool"]).toBe("file.read");
  });

  it("force-compacts even when the payload is small", () => {
    const payload = JSON.stringify([
      { callId: "c1", tool: "file.read", args: { path: "README.md" }, ok: true },
    ]);
    const serialized = serializePersistedToolCalls(payload, { forceCompact: true });
    expect(serialized).not.toBe(payload);
    expect(JSON.parse(serialized)).toEqual([
      { callId: "c1", tool: "file.read", args: { path: "README.md" }, ok: true, message: "" },
    ]);
  });

  it("marks compacted output when markCompacted is set", () => {
    const payload = JSON.stringify([
      { callId: "c1", tool: "file.read", args: { path: "README.md" }, ok: true },
    ]);
    const serialized = serializePersistedToolCalls(payload, {
      forceCompact: true,
      markCompacted: true,
    });
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    expect(parsed[0]["storageCompacted"]).toBe(true);
  });

  it("drops data/output in the metadata-only fallback when nothing fits", () => {
    const entry = {
      callId: "c1",
      tool: "file.read",
      args: { path: "README.md" },
      ok: true,
      data: { huge: "x".repeat(1_000_000) },
      output: "y".repeat(1_000_000),
    };
    // Multiple oversized entries so even the smallest compaction pass exceeds the ceiling.
    const payload = JSON.stringify([entry, entry, entry, entry, entry]);
    const serialized = serializePersistedToolCalls(payload, { maxBytes: 1_024 });
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(1_024);
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const item of parsed) {
      expect(item["callId"]).toBe("c1");
      expect(item["data"]).toBeUndefined();
      expect(item["output"]).toBeUndefined();
    }
  });

  it("keeps image.view results usable by surviving on their path", () => {
    // Inline base64 is not compaction-safe: the string passes are byte-limited,
    // so an inlined data URI comes back truncated and the chat renders a broken
    // image. `image.view` therefore only inlines small images and otherwise
    // reports the path, which is tiny enough to survive every pass.
    const base64 = "A".repeat(120_000);
    const dataUri = `data:image/png;base64,${base64}`;
    const filler = {
      callId: "c2",
      tool: "terminal",
      ok: true,
      args: {},
      output: "x".repeat(200_000),
    };

    const inlineResult = serializePersistedToolCalls(JSON.stringify([
      {
        callId: "img",
        tool: "image.view",
        ok: true,
        args: { path: "big.png" },
        data: { path: "big.png", mimeType: "image/png", size: 90_000, dataUri, base64 },
      },
      filler,
    ]), { maxBytes: 4_096 });
    const inlineData = (JSON.parse(inlineResult) as Array<Record<string, unknown>>)[0]["data"] as Record<string, unknown>;
    expect(inlineData["dataUri"]).not.toBe(dataUri);
    expect((inlineData["dataUri"] as string).length).toBeLessThan(dataUri.length);

    const pathResult = serializePersistedToolCalls(JSON.stringify([
      {
        callId: "img",
        tool: "image.view",
        ok: true,
        args: { path: "big.png" },
        data: { path: "big.png", mimeType: "image/png", size: 90_000, inline: false },
      },
      filler,
    ]), { maxBytes: 4_096 });
    expect(Buffer.byteLength(pathResult, "utf8")).toBeLessThanOrEqual(4_096);
    const pathData = (JSON.parse(pathResult) as Array<Record<string, unknown>>)[0]["data"];
    expect(pathData).toEqual({ path: "big.png", mimeType: "image/png", size: 90_000, inline: false });
  });

  it("preserves numeric and string metadata fields", () => {
    const payload = JSON.stringify([
      {
        callId: "c1",
        tool: "file.read",
        args: {},
        ok: true,
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_000_100,
        retryCount: 2,
        status: "completed",
      },
    ]);
    const serialized = serializePersistedToolCalls(payload, { forceCompact: true });
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    expect(parsed[0]["startedAt"]).toBe(1_700_000_000_000);
    expect(parsed[0]["completedAt"]).toBe(1_700_000_000_100);
    expect(parsed[0]["retryCount"]).toBe(2);
    expect(parsed[0]["status"]).toBe("completed");
  });
  it("serializes long metadata fallbacks with linear work", () => {
    const entries = Array.from({ length: 1_500 }, (_, i) => ({
      callId: `call-${i}`, tool: "read", args: {}, ok: true,
      message: "🦀".repeat(200), output: "x".repeat(1_000), data: { body: "x".repeat(1_000) },
    }));
    const raw = JSON.stringify(entries);
    const stringify = JSON.stringify;
    let arrayItems = 0;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown) => {
      if (Array.isArray(value)) arrayItems += value.length;
      return stringify(value);
    }) as typeof JSON.stringify);
    let serialized: string | null;
    try {
      serialized = serializePersistedToolCalls(raw);
    } finally {
      spy.mockRestore();
    }
    expect(arrayItems).toBeLessThanOrEqual(entries.length * 4);
    expect(Buffer.byteLength(serialized!, "utf8")).toBeLessThanOrEqual(512_000);
    const result = JSON.parse(serialized!);
    expect(result.length).toBeGreaterThan(500);
    expect(result[0].callId).toBe("call-0");
    expect(result.at(-1).callId).toBe(`call-${result.length - 1}`);
    expect(result.every((entry: Record<string, unknown>) => !("data" in entry) && !("output" in entry))).toBe(true);
  });

  it("assigns safe defaults to malformed entries during compaction", () => {
    const result = JSON.parse(serializePersistedToolCalls(JSON.stringify([null, 1, {}]), { forceCompact: true, markCompacted: true })!);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ callId: "truncated-0", tool: "unknown", args: {}, ok: false, storageCompacted: true });
  });

});
