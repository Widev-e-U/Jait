import { describe, expect, it } from "vitest";
import {
  computeContextUsage,
  estimateJsonTokens,
  estimateToolSchemaTokens,
} from "./token-estimator.js";

describe("token-estimator", () => {
  it("estimates non-json values without throwing", () => {
    expect(estimateJsonTokens(undefined)).toBeGreaterThan(0);
    expect(estimateJsonTokens(Symbol("tool"))).toBeGreaterThan(0);
    expect(estimateJsonTokens(() => undefined)).toBeGreaterThan(0);
    expect(estimateJsonTokens(1n)).toBeGreaterThan(0);
  });

  it("estimates circular json-like values without throwing", () => {
    const schema: Record<string, unknown> = { name: "recursive-tool" };
    schema.self = schema;

    expect(estimateJsonTokens(schema)).toBeGreaterThan(0);
    expect(estimateToolSchemaTokens([schema])).toBeGreaterThan(0);
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
