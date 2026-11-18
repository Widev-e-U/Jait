import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop, toolDefsToSchemas, fromOpenAIName, type AgentMessage } from "./agent-loop.js";
import { ToolRegistry } from "./registry.js";
import { createTeamChatTool } from "./team-chat-tools.js";
import type { TeamChatService } from "../services/team-chat.js";
import type { SessionService } from "../services/sessions.js";

afterEach(() => vi.restoreAllMocks());

function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}

describe("tool recovery regression", () => {
  it("routes a runtime-discovered GitHub token alias to its exact name", async () => {
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => [
      response("tools_search", { query: "GitHub token" }),
      response("agent_github_token"),
      response(),
    ][round++]!);
    const execute = vi.fn(async (name: string) => name === "tools.search"
      ? { ok: true, message: "Found token tool", data: { matches: [{ name: "agent.github.token", description: "Mint token", parameters: { type: "object", properties: {} } }] } }
      : { ok: name === "agent.github.token", message: name });
    await runAgentLoop({
      llm: { openaiApiKey: "test", openaiBaseUrl: "https://llm.test", openaiModel: "test", contextWindow: 100000 },
      history: [{ role: "system", content: "Use tools" }, { role: "user", content: "Get the GitHub token" }],
      toolSchemas: toolDefsToSchemas([{ name: "tools.search", description: "Search tools", parameters: { type: "object", properties: {} } }]),
      hasTools: true, sessionId: "discovery-repro", abort: new AbortController(), maxRounds: 5,
    }, execute);
    expect(execute.mock.calls.map(call => call[0])).toEqual(["tools.search", "agent.github.token"]);
  });

  it("never guesses an unknown alias or rewrites a canonical name", () => {
    expect(fromOpenAIName("unknown_tool_with_underscores")).toBe("unknown_tool_with_underscores");
    expect(fromOpenAIName("custom.tool_with_underscores")).toBe("custom.tool_with_underscores");
  });

  it("blocks the first unchanged invalid retry and permits a corrected call", async () => {
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => [
      response("unknown_recovery_tool", { value: "bad" }),
      response("unknown_recovery_tool", { value: "bad" }),
      response("read", { path: "fixed.md" }),
      response(),
    ][round++]!);
    const execute = vi.fn(async (name: string) => name === "read"
      ? { ok: true, message: "Read succeeded" }
      : { ok: false, message: "Unknown tool: " + name });
    const history: AgentMessage[] = [{ role: "system", content: "Use tools" }, { role: "user", content: "Read the file" }];
    await runAgentLoop({
      llm: { openaiApiKey: "test", openaiBaseUrl: "https://llm.test", openaiModel: "test", contextWindow: 100000 },
      history, toolSchemas: toolDefsToSchemas([{ name: "read", description: "Read", parameters: { type: "object", properties: {} } }]),
      hasTools: true, sessionId: "invalid-retry-repro", abort: new AbortController(), maxRounds: 6,
    }, execute);
    expect(execute.mock.calls.map(call => call[0])).toEqual(["unknown_recovery_tool", "read"]);
    expect(history.some(entry => entry.role === "tool" && entry.content.includes("Change the tool name or arguments"))).toBe(true);
  });

  it("allows corrected goal criteria immediately after suppressing an invalid repeat", async () => {
    const room = { id: "room" };
    const service = { workForSession: vi.fn(), get: vi.fn().mockReturnValue(room), sender: vi.fn(),
      setGoal: vi.fn().mockReturnValue(room) };
    const registry = new ToolRegistry();
    const tool = createTeamChatTool(service as unknown as TeamChatService, {} as SessionService);
    registry.register(tool);
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => [
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars" }),
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars" }),
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars" }),
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars", criteria: ["Mention shows avatar"] }),
      response(),
    ][round++]!);
    const execute = vi.fn(async (name: string, input: unknown) => registry.execute(name, input, {
      userId: "owner", sessionId: "goal-recovery", actionId: "test", projectRoot: "/project", requestedBy: "test",
    }));
    const history: AgentMessage[] = [{ role: "system", content: "Use tools" }, { role: "user", content: "Set the goal" }];
    const result = await runAgentLoop({
      llm: { openaiApiKey: "test", openaiBaseUrl: "https://llm.test", openaiModel: "test", contextWindow: 100000 },
      history, toolRegistry: registry, toolSchemas: toolDefsToSchemas([tool]),
      hasTools: true, sessionId: "goal-recovery", abort: new AbortController(), maxRounds: 6,
    }, execute);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(service.setGoal).toHaveBeenCalledTimes(1);
    expect(result.executedToolCalls.map(call => call.ok)).toEqual([false, false, false, true]);
    expect(result.executedToolCalls[1]?.message).toContain("Change the tool name or arguments");
  });

  it("resolves ambiguous aliases without throwing and never advertises a duplicate", () => {
    const registry = new ToolRegistry();
    const first = { name: "recovery.a_b", description: "first", parameters: { type: "object" as const, properties: {} },
      execute: async () => ({ ok: true, message: "first" }) };
    const second = { ...first, name: "recovery_a.b" };

    // Registration must never fail: the registry legitimately exposes legacy
    // alias pairs such as `os.tool` / `os_tool`, and a collision is not fatal.
    registry.register(first);
    registry.register(second);

    // Only one schema reaches the provider, so no duplicate function is advertised.
    const schemas = toolDefsToSchemas([first, second]);
    const names = schemas.map(schema => schema.function.name);
    expect(names).toEqual(["recovery_a_b"]);

    // The advertised alias always resolves to a registered, executable tool.
    const resolved = fromOpenAIName(names[0]!);
    expect(["recovery.a_b", "recovery_a.b"]).toContain(resolved);
    expect(registry.isExecutable(resolved)).toBe(true);
  });

  it.each([undefined, [], [""], [" "], null, Array(21).fill("criterion"), ["x".repeat(2001)]])("validates goal criteria before touching room state: %j", async criteria => {
    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("criteria");
    expect(service.workForSession).not.toHaveBeenCalled();
    expect(service.setGoal).not.toHaveBeenCalled();
  });
});
