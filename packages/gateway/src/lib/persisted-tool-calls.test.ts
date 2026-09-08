import { describe, expect, it } from "vitest";
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
});
