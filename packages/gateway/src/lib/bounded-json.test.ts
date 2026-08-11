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
});
