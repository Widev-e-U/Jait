import { describe, expect, it } from "vitest";
import { extractSubAgentPayloads, stripSubAgentPayloads } from "./sub-agent-persistence.js";

const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};

describe("extractSubAgentPayloads", () => {
  it("returns [] for empty, null, or invalid JSON", () => {
    expect(extractSubAgentPayloads(undefined)).toEqual([]);
    expect(extractSubAgentPayloads(null)).toEqual([]);
    expect(extractSubAgentPayloads("")).toEqual([]);
    expect(extractSubAgentPayloads("not-json")).toEqual([]);
  });

  it("extracts a sub-agent payload from an array of tool calls", () => {
    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
      { callId: "call-2", tool: "agent", data: fullSubAgentData },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      subAgentId: "sub-1",
      content: "full body text",
      performative: "delegation",
      rounds: 3,
      durationMs: 1200,
      segments: fullSubAgentData.segments,
      toolCalls: fullSubAgentData.toolCalls,
    });
  });

  it("falls back to partialContent when content is absent", () => {
    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "agent", data: { subAgentId: "sub-2", partialContent: "partial body" } },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    expect(payloads[0]?.content).toBe("partial body");
  });

  it("handles a single (non-array) tool-call object", () => {
    const toolCalls = JSON.stringify({ callId: "call-1", tool: "agent", data: fullSubAgentData });

    const payloads = extractSubAgentPayloads(toolCalls);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.subAgentId).toBe("sub-1");
  });

  it("skips entries without a subAgentId", () => {
    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
      { callId: "call-2", tool: "agent", data: { subAgentId: "sub-1" } },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.subAgentId).toBe("sub-1");
  });

  it("ignores non-object entries and non-object data", () => {
    const toolCalls = JSON.stringify([
      "plain-string",
      { callId: "call-1", tool: "agent", data: "not-an-object" },
      { callId: "call-2", tool: "agent", data: { subAgentId: "sub-1" } },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.subAgentId).toBe("sub-1");
  });
});

describe("stripSubAgentPayloads", () => {
  it("returns undefined for empty, null, or invalid JSON", () => {
    expect(stripSubAgentPayloads(undefined)).toBeUndefined();
    expect(stripSubAgentPayloads(null)).toBeUndefined();
    expect(stripSubAgentPayloads("")).toBeUndefined();
    expect(stripSubAgentPayloads("not-json")).toBeUndefined();
  });

  it("replaces full sub-agent data with a lightweight stub", () => {
    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
      { callId: "call-2", tool: "agent", data: fullSubAgentData },
    ]);

    const stripped = stripSubAgentPayloads(toolCalls)!;
    const parsed = JSON.parse(stripped) as Array<Record<string, unknown>>;

    expect(parsed).toHaveLength(2);
    // Non-sub-agent entry is untouched.
    expect(parsed[0]).toEqual({ callId: "call-1", tool: "file.read", data: { path: "a.ts" } });
    // Sub-agent entry keeps only the stub fields.
    expect(parsed[1]).toEqual({
      callId: "call-2",
      tool: "agent",
      data: { subAgentId: "sub-1", performative: "delegation", rounds: 3, durationMs: 1200 },
    });
  });

  it("keeps only the subAgentId when optional fields are absent", () => {
    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "agent", data: { subAgentId: "sub-1", content: "body" } },
    ]);

    const parsed = JSON.parse(stripSubAgentPayloads(toolCalls)!) as Array<Record<string, unknown>>;
    expect(parsed[0]?.data).toEqual({ subAgentId: "sub-1" });
  });

  it("handles a single (non-array) tool-call object", () => {
    const toolCalls = JSON.stringify({ callId: "call-1", tool: "agent", data: fullSubAgentData });

    const parsed = JSON.parse(stripSubAgentPayloads(toolCalls)!) as Record<string, unknown>;
    expect(parsed["data"]).toEqual({
      subAgentId: "sub-1",
      performative: "delegation",
      rounds: 3,
      durationMs: 1200,
    });
  });

  it("leaves entries without a subAgentId unchanged", () => {
    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
    ]);

    expect(stripSubAgentPayloads(toolCalls)).toBe(toolCalls);
  });
});
