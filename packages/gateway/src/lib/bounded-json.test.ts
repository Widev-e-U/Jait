import { describe, expect, it } from "vitest";
import { limitSerializedJson, limitUtf8, serializeBoundedJson } from "./bounded-json.js";

describe("bounded JSON persistence", () => {
  it("keeps small serializable values unchanged", () => {
    const value = { tool: "file.read", data: { path: "README.md" } };
    expect(serializeBoundedJson(value, 1_024)).toBe(JSON.stringify(value));
  });

  it("compacts oversized strings below the byte ceiling", () => {
    const serialized = serializeBoundedJson({ output: "x".repeat(100_000) }, 4_096);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(4_096);
    expect(serialized).toContain("truncated by Jait");
  });

  it("bounds UTF-8 text without splitting the byte ceiling", () => {
    const limited = limitUtf8("🙂".repeat(1_000), 257);
    expect(Buffer.byteLength(limited, "utf8")).toBeLessThanOrEqual(257);
    expect(limited).toContain("truncated by Jait");
  });

  it("handles circular values without throwing", () => {
    const value: Record<string, unknown> = { name: "cycle" };
    value["self"] = value;

    const serialized = serializeBoundedJson(value, 1_024);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(1_024);
    expect(serialized).toContain("circular reference");
  });

  it("bounds already-serialized invalid JSON", () => {
    const serialized = limitSerializedJson("not-json-" + "x".repeat(50_000), 2_048);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(2_048);
    expect(JSON.parse(serialized)).toBeTruthy();
  });

  it("handles tiny byte limits and malformed Unicode without splitting pairs", () => {
    expect(limitUtf8("abc", 0)).toBe("");
    expect(limitUtf8("é🙂x", 3)).toBe("é");
    expect([...limitUtf8("\ud800x", 3, "")].map((char) => char.charCodeAt(0))).toEqual([0xd800]);
    expect([...limitUtf8("\udc00x", 3, "")].map((char) => char.charCodeAt(0))).toEqual([0xdc00]);
  });

  it("compacts large collections and non-JSON values", () => {
    const value = { items: Array.from({ length: 150 }, (_, i) => i), big: 42n, missing: undefined, nested: { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } } };
    const result = JSON.parse(serializeBoundedJson(value, 2_000));
    expect(result.big).toBe("42");
    expect(result.items).toContain("[50 more item(s) truncated]");
    expect(result).not.toHaveProperty("missing");
  });

  it("reports truncated object entries and falls back when compacted values still exceed the limit", () => {
    const many = Object.fromEntries(Array.from({ length: 110 }, (_, i) => [`key${i}`, i]));
    const compact = JSON.parse(serializeBoundedJson({ ...many, big: 1n }, 4096));
    expect(compact.__jait_truncated_entries__).toBe(11);
    const fallback = JSON.parse(serializeBoundedJson(Array.from({ length: 100 }, () => "x".repeat(1000)), 128));
    expect(fallback.__jait_truncated__).toBe(true);
    expect(fallback.originalBytes).toBeGreaterThan(128);
  });

});
