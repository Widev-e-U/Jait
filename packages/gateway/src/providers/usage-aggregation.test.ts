import { describe, expect, it } from "vitest";
import { summarizeUsage } from "./usage.js";

describe("summarizeUsage", () => {
  it("aggregates cache counters and estimates only when every round is known", () => {
    const metrics = { durationMs: 1, promptTokens: 100, cachedPromptTokens: 60, cacheWriteTokens: 20, completionTokens: 5, cost: { amount: 0.01, currency: "USD", basis: "configured-rates" as const } };
    expect(summarizeUsage([{ metrics }, { metrics }])).toMatchObject({ promptTokens: 200, cachedPromptTokens: 120, cacheWriteTokens: 40, cost: { amount: 0.02, currency: "USD" } });
    const incomplete = summarizeUsage([{ metrics }, { metrics: { durationMs: 1, completionTokens: 2 } }]);
    expect(incomplete?.promptTokens).toBeUndefined();
    expect(incomplete?.cachedPromptTokens).toBeUndefined();
    expect(incomplete?.cacheWriteTokens).toBeUndefined();
    expect(incomplete?.cost).toBeUndefined();
  });
});
