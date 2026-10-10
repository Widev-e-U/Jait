import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./registry.js";
import { createAgentSpawnTool } from "./agent-tools.js";
import { createAgentTool } from "./core/agent.js";
import type { ToolContext } from "./contracts.js";

function completion(delta: unknown, finishReason: string) {
  return new Response([
    `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\n`,
    "data: [DONE]\n\n",
  ].join(""), { headers: { "Content-Type": "text/event-stream" } });
}
const context: ToolContext = {
  sessionId: "agent-execution-tests", actionId: "agent-action", requestedBy: "test",
  projectRoot: "/owned/project", userId: "owner-1", providerId: "jait",
  executionNodeId: "owned-node", sandboxContainerName: "owned-thread-sandbox",
};
afterEach(() => { vi.unstubAllGlobals(); });

describe.each([
  ["agent", createAgentTool],
  ["agent.spawn", createAgentSpawnTool],
] as const)("%s execution", (_name, createTool) => {
  it("runs a delegated tool on the parent's execution node and sandbox", async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn().mockResolvedValue({ ok: true, message: "Owned project inspected" });
    registry.register({
      name: "fixture.inspect", description: "Inspect this owned project fixture",
      parameters: { type: "object", properties: {} }, execute,
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(completion({ tool_calls: [{ index: 0, id: "inspect-call", type: "function", function: { name: "fixture_inspect", arguments: "{}" } }] }, "tool_calls"))
      .mockResolvedValueOnce(completion({ content: "[INFORM] Inspection complete" }, "stop"));
    vi.stubGlobal("fetch", fetch);
    const onNestedEvent = vi.fn();
    const tool = createTool({
      toolRegistry: registry,
      getLLMConfig: () => ({ openaiApiKey: "fixture-key", openaiBaseUrl: "https://model.example.test/v1", openaiModel: "fixture-model", contextWindow: 32768 }),
    });
    const result = await tool.execute({ prompt: "Inspect the owned project", description: "Inspect project fixture", allowedTools: "fixture.inspect" }, { ...context, onNestedEvent });
    expect(result).toMatchObject({ ok: true, message: "Inspection complete", data: {
      performative: "inform", toolCalls: [{ tool: "fixture.inspect", ok: true, message: "Owned project inspected" }],
    } });
    expect(execute).toHaveBeenCalledWith({}, expect.objectContaining({
      executionNodeId: context.executionNodeId, sandboxContainerName: context.sandboxContainerName,
      projectRoot: context.projectRoot, userId: context.userId, signal: expect.any(AbortSignal),
    }));
    expect(onNestedEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "tool_start", tool: "fixture.inspect" }));
    expect(onNestedEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "tool_result", tool: "fixture.inspect", ok: true }));
  });

  it("rejects unknown requested tools before calling the model", async () => {
    const getLLMConfig = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const tool = createTool({ toolRegistry: new ToolRegistry(), getLLMConfig });
    const result = await tool.execute({ prompt: "Inspect the owned project", description: "Inspect project fixture", allowedTools: "missing.inspect" }, context);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing.inspect");
    expect(fetch).not.toHaveBeenCalled();
    expect(getLLMConfig).not.toHaveBeenCalled();
  });
});
