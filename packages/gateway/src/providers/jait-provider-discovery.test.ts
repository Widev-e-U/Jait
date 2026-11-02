import { describe, expect, it, vi } from "vitest";
const runAgentLoopMock = vi.hoisted(() => vi.fn());
vi.mock("../tools/index.js", async (importOriginal) => ({ ...(await importOriginal<typeof import("../tools/index.js")>()), runAgentLoop: runAgentLoopMock }));
import { JaitProvider, prepareJaitThreadSandboxToolInput } from "./jait-provider.js";
describe("sandbox input validation", () => {
  it("leaves malformed command inputs unchanged for downstream validation", () => {
    const invalid = ["not", "an object"];
    expect(prepareJaitThreadSandboxToolInput("execute", invalid)).toBe(invalid);
    expect(prepareJaitThreadSandboxToolInput("execute", null)).toBeNull();
  });

});
describe("JaitProvider tool discovery", () => {
  it("retains only the most recent valid discovered tool names", async () => {
    const names = Array.from({ length: 25 }, (_, i) => `tool.${i}`);
    runAgentLoopMock.mockResolvedValueOnce({ content: "ok", executedToolCalls: [
      { tool: "other", ok: true, data: { matches: [{ name: "ignored" }] } },
      { tool: "tools.search", ok: false, data: { matches: [{ name: "failed" }] } },
      { tool: "tools.search", ok: true, data: { matches: names.map(name => ({ name })) } },
      { tool: "jait.catalog", ok: true, data: { matches: [{ name: 42 }, { name: "tool.10" }] } },
    ] });
    const provider = new JaitProvider({
      config: { openaiApiKey: "test", openaiBaseUrl: "http://localhost:11434/v1", openaiModel: "test", ollamaUrl: "http://localhost:11434", ollamaModel: "test", ollamaContextWindow: 0, agentMaxRounds: 0 } as any,
      threadService: { getById: () => ({ userId: "user-1" }) } as any,
      userService: { getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }) } as any,
    });
    const session = await provider.startSession({ threadId: "thread-1", workingDirectory: "/repo-worktree", mode: "full-access" });
    await provider.sendTurn(session.id, "discover");
    const activated = [...(provider as any).sessions.get(session.id).activatedToolNames];
    expect(activated).toHaveLength(20);
    expect(activated).not.toContain("tool.0");
    expect(activated.at(-1)).toBe("tool.10");
    expect(activated).not.toContain("ignored");
    expect(activated).not.toContain("failed");
  });
});
