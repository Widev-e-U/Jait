import { describe, expect, it } from "vitest";

import {
  computeContextUsage,
  estimateHistoryTokens,
  estimateJsonTokens,
  estimateMessageTokens,
  estimateTokens,
  estimateToolSchemaTokens,
} from "./token-estimator.js";

describe("token-estimator", () => {
  it("estimates plain text and JSON payloads with stable rounding", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(2);
    expect(estimateJsonTokens("abcd")).toBe(1);
    expect(estimateJsonTokens({ a: "abcd" })).toBe(3);
  });

  it("treats JSON-unsupported values as empty instead of throwing", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    expect(estimateJsonTokens(undefined)).toBe(0);
    expect(estimateJsonTokens(() => "ignored")).toBe(0);
    expect(estimateJsonTokens(circular)).toBe(0);
  });

  it("includes message overhead and structured tool-call payloads", () => {
    const toolCalls = [{ name: "read_file", args: { path: "README.md" } }];

    expect(estimateMessageTokens({ role: "user", content: "abcd" })).toBe(6);
    expect(estimateMessageTokens({
      role: "assistant",
      content: "abcd",
      tool_calls: toolCalls,
    })).toBeGreaterThan(estimateMessageTokens({ role: "assistant", content: "abcd" }));
  });

  it("adds request priming tokens for message history", () => {
    expect(estimateHistoryTokens([
      { role: "system", content: "abcd" },
      { role: "user", content: "abcd" },
    ])).toBe(15);
  });

  it("breaks down context usage by message category and caps the ratio", () => {
    const usage = computeContextUsage([
      { role: "system", content: "abcd" },
      { role: "user", content: "abcd" },
      { role: "tool", content: "" },
    ], [{ name: "read" }], 16);

    expect(usage.system).toBe(6);
    expect(usage.history).toBe(6);
    expect(usage.toolResults).toBe(4);
    expect(usage.tools).toBe(31);
    expect(usage.total).toBe(47);
    expect(usage.limit).toBe(16);
    expect(usage.ratio).toBe(1);
  });

  it("estimates empty tool schema lists as zero", () => {
    expect(estimateToolSchemaTokens([])).toBe(0);
  });

  it("breaks context usage down by message category and caps the ratio", () => {
    const usage = computeContextUsage(
      [
        { role: "system", content: "Follow the project rules." },
        { role: "user", content: "Inspect the code." },
        { role: "assistant", content: "I will read the relevant files." },
        { role: "tool", content: "packages/gateway/src/tools/token-estimator.ts" },
      ],
      [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read a file",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
      10,
    );

    expect(usage.system).toBeGreaterThan(0);
    expect(usage.history).toBeGreaterThan(usage.system);
    expect(usage.toolResults).toBeGreaterThan(0);
    expect(usage.tools).toBeGreaterThan(0);
    expect(usage.total).toBe(usage.system + usage.history + usage.toolResults + usage.tools);
    expect(usage.limit).toBe(10);
    expect(usage.ratio).toBe(1);
  });
});
