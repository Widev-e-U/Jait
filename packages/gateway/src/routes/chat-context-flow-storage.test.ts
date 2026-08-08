import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { __chatTestUtils } from "./chat.js";

describe("persisted context-flow size guard", () => {
  it("does not let completion-time metrics reserialize uncapped rounds", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./chat.ts", import.meta.url)),
      "utf8",
    );
    const completionStart = source.indexOf("// Re-serialize through the same storage cap");
    const completionEnd = source.indexOf("if (contextFlowJson)", completionStart);
    const completionBlock = source.slice(completionStart, completionEnd);

    expect(completionStart).toBeGreaterThanOrEqual(0);
    expect(completionBlock).toContain("serializePersistedContextFlow");
    expect(completionBlock).not.toContain("contextFlowJson = JSON.stringify");
    expect(source).not.toContain("contextFlowJson = JSON.stringify");
  });

  it("keeps metrics while bounding a single oversized round", () => {
    const stored = __chatTestUtils.serializePersistedContextFlow({
      provider: "jait",
      model: "test-model",
      rounds: [{
        round: 1,
        createdAt: new Date().toISOString(),
        model: "test-model",
        messages: [{ role: "tool", content: "x".repeat(2_000_000) }],
        metrics: { durationMs: 250, completionTokens: 10 },
      }],
    });
    const parsed = JSON.parse(stored) as {
      rounds: Array<{ metrics?: { completionTokens?: number }; messages: Array<{ content?: string }> }>;
    };

    expect(Buffer.byteLength(stored, "utf8")).toBeLessThanOrEqual(512_000);
    expect(parsed.rounds[0]?.metrics?.completionTokens).toBe(10);
    expect(parsed.rounds[0]?.messages[0]?.content).toContain("[Stored context truncated]");
  });
});
