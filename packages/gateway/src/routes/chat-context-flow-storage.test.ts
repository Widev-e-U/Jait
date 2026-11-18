import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { __chatTestUtils } from "./chat.js";

describe("chat persistence size guards", () => {
  it("bounds persisted tool-call output while retaining call metadata", () => {
    const stored = __chatTestUtils.serializePersistedToolCalls(JSON.stringify([{
      callId: "call-large",
      tool: "terminal.run",
      status: "completed",
      ok: true,
      message: "done",
      output: "x".repeat(2_000_000),
    }]));
    const parsed = JSON.parse(stored!) as Array<Record<string, unknown>>;

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.every((entry) => entry && typeof entry === "object")).toBe(true);
    expect(Buffer.byteLength(stored!, "utf8")).toBeLessThanOrEqual(512_000);
    expect(parsed[0]).toMatchObject({
      callId: "call-large",
      tool: "terminal.run",
      status: "completed",
      ok: true,
      message: "done",
    });
  });

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


describe("context flow compaction tiers", () => {
  const round = (n: number) => ({ round: n, createdAt: "2026-10-20T00:00:00Z", model: "test",
    messages: [{ role: "user", content: "x".repeat(200_000), thinking: "y".repeat(20_000),
      tool_calls: [{ function: { name: "tool", arguments: "z".repeat(20_000) } }] }],
    tools: [{ name: "tool" }],
  });

  it("retains the first and last two rounds and bounds tool payloads", () => {
    const flow = { provider: "test", rounds: [1, 2, 3, 4].map(round) };
    const stored = __chatTestUtils.serializePersistedContextFlow(flow);
    const parsed = JSON.parse(stored);
    expect(parsed.truncatedRounds).toBe(4);
    expect(parsed.rounds.map((r: { round: number }) => r.round)).toEqual([1, 3, 4]);
    expect(parsed.rounds[0].messages[0].tool_calls).toEqual([{ truncated: true }]);
    expect(parsed.rounds[0].messages[0].thinking).toContain("[Stored context truncated]");
    expect(parsed.rounds.every((r: { tools?: unknown }) => r.tools === undefined)).toBe(true);
    expect(flow.rounds[0]!.messages[0]!.content).toHaveLength(200_000);
    expect(Buffer.byteLength(stored)).toBeLessThanOrEqual(512_000);
  });

  it("reduces message count and memory text under severe compaction", () => {
    const memory = { query: "q".repeat(20_000), injectedIds: ["m"], ignoredIds: [], savedIds: [],
      retrieved: [{ id: "m", scope: "session" as const, source: "test", sourceType: "test",
        sourceId: "s", sourceSurface: "chat", updatedAt: "2026-10-20", content: "m".repeat(10_000) }],
    };
    const rounds = [1, 2, 3].map(n => ({ ...round(n), messages: Array.from({ length: 20 },
      (_, i) => ({ role: "user", content: `${i}:` + "x".repeat(20_000) })) }));
    const stored = __chatTestUtils.serializePersistedContextFlow({ provider: "test", rounds, memory });
    const parsed = JSON.parse(stored);
    expect(parsed.truncated).toBe(true);
    expect(parsed.rounds[0].messages).toHaveLength(10);
    expect(parsed.rounds[0].messages[0].content).toMatch(/^0:/);
    expect(parsed.rounds[0].messages[1].content).toMatch(/^11:/);
    expect(parsed.memory.query).toBe("q".repeat(2000) + "\n[Stored context truncated]");
    expect(parsed.memory.retrieved[0].content).toBe("m".repeat(1000) + "\n[Stored context truncated]");
    expect(parsed.memory.injectedIds).toEqual(["m"]);
    expect(Buffer.byteLength(stored)).toBeLessThanOrEqual(512_000);
  });

  it("omits irreducibly large message fields as a last resort", () => {
    const stored = __chatTestUtils.serializePersistedContextFlow({ provider: "test", rounds: [{
      ...round(1), messages: [{ role: "tool", content: { payload: "x".repeat(600_000) } }],
    }] });
    const parsed = JSON.parse(stored);
    expect(parsed.rounds[0].messages).toEqual([{ role: "system", content: "[Stored context omitted: size limit exceeded]" }]);
    expect(parsed.truncated).toBe(true);
    expect(Buffer.byteLength(stored)).toBeLessThanOrEqual(512_000);
  });
});
