import { beforeEach, describe, expect, it, vi } from "vitest";

const runAgentLoopMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
import type { ToolContext } from "../tools/contracts.js";
import type { ProviderEvent } from "./contracts.js";
import { JaitProvider, prepareJaitThreadSandboxToolInput } from "./jait-provider.js";

beforeEach(() => {
  runAgentLoopMock.mockReset();
});

describe("prepareJaitThreadSandboxToolInput", () => {
  it("forces command tools through the read-write sandbox", () => {
    expect(prepareJaitThreadSandboxToolInput("execute", {
      command: "bun test",
      explanation: "Run tests",
    })).toMatchObject({
      command: "bun test",
      explanation: "Run tests",
      sandbox: true,
      sandboxMountMode: "read-write",
    });

    expect(prepareJaitThreadSandboxToolInput("terminal.run", {
      command: "git status",
      sandbox: false,
    })).toMatchObject({
      command: "git status",
      sandbox: true,
      sandboxMountMode: "read-write",
    });
  });

  it("leaves non-command tools unchanged", () => {
    const input = { path: "packages/gateway/src/providers/jait-provider.ts" };
    expect(prepareJaitThreadSandboxToolInput("file.read", input)).toBe(input);
  });
});

describe("JaitProvider reasoning effort", () => {
  it("carries the session selection into the native agent loop", async () => {
    runAgentLoopMock.mockResolvedValueOnce({ content: "ok", executedToolCalls: [] });
    const provider = new JaitProvider({
      config: {
        openaiApiKey: "test",
        openaiBaseUrl: "http://localhost:11434/v1",
        openaiModel: "test",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "test",
        ollamaContextWindow: 0,
        agentMaxRounds: 0,
      } as any,
      threadService: { getById: () => ({ userId: "user-1" }) } as any,
      userService: {
        getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }),
      } as any,
    });

    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: "/repo-worktree",
      mode: "full-access",
      reasoningEffort: "high",
    });
    await provider.sendTurn(session.id, "test");

    expect(runAgentLoopMock).toHaveBeenCalledOnce();
    expect(runAgentLoopMock.mock.calls[0]?.[0].auth.reasoningEffort).toBe("high");
  });
});

describe("JaitProvider context flow", () => {
  it("emits one bounded context snapshot after a long turn", async () => {
    const emitted: ProviderEvent[] = [];
    let serializedContextBytes = 0;
    runAgentLoopMock.mockImplementationOnce(async (options) => {
      for (let round = 1; round <= 40; round++) {
        options.onContext?.({
          round,
          createdAt: new Date().toISOString(),
          model: "test",
          messages: [{ role: "assistant", content: "x".repeat(8_000) }],
        });
      }
      return { content: "ok", executedToolCalls: [] };
    });
    const provider = new JaitProvider({
      config: {
        openaiApiKey: "test",
        openaiBaseUrl: "http://localhost:11434/v1",
        openaiModel: "test",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "test",
        ollamaContextWindow: 0,
        agentMaxRounds: 0,
      } as any,
      threadService: { getById: () => ({ userId: "user-1" }) } as any,
      userService: {
        getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }),
      } as any,
    });
    provider.onEvent((event) => {
      emitted.push(event);
      if (event.type === "activity" && event.kind === "context_flow") {
        serializedContextBytes += Buffer.byteLength(JSON.stringify(event), "utf8");
      }
    });

    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: "/repo-worktree",
      mode: "full-access",
    });
    await provider.sendTurn(session.id, "test");

    const contextEvents = emitted.filter(
      (event) => event.type === "activity" && event.kind === "context_flow",
    );
    expect(contextEvents).toHaveLength(1);
    expect(serializedContextBytes).toBeLessThan(500_000);
    expect(contextEvents[0]).toMatchObject({
      payload: {
        rounds: expect.arrayContaining([
          expect.objectContaining({ round: 1 }),
          expect.objectContaining({ round: 40 }),
        ]),
      },
    });
  });
});

describe("JaitProvider command sandboxing", () => {
  it("lazily starts and reuses a thread sandbox for command tools", async () => {
    const starts: string[] = [];
    const stops: string[] = [];
    const executions: Array<{ toolName: string; input: unknown; context: ToolContext }> = [];
    const provider = new JaitProvider({
      config: {} as any,
      threadService: { getById: () => undefined } as any,
      toolRegistry: {} as any,
      sandboxManager: {
        startCommandSandbox: async (options) => {
          starts.push(options.projectRoot);
          return {
            containerName: "jait-agent-sb-test",
            projectRoot: options.projectRoot,
            sandboxProjectRoot: "/project",
          };
        },
        stopContainer: async (containerName) => {
          stops.push(containerName);
        },
      },
      toolExecutor: async (toolName, input, context) => {
        executions.push({ toolName, input, context });
        return { ok: true, message: "ok" };
      },
    });

    (provider as any).sessions.set("session-1", {
      session: {
        id: "session-1",
        providerId: "jait",
        threadId: "thread-1",
        status: "running",
        startedAt: "2026-05-03T00:00:00.000Z",
      },
      threadId: "thread-1",
      workingDirectory: "/repo-worktree",
      history: [],
    });

    await (provider as any).executeTool(
      "terminal.run",
      { command: "pwd", sandbox: false },
      "session-1",
      undefined,
      undefined,
      undefined,
      "/repo-worktree",
    );
    await (provider as any).executeTool(
      "execute",
      { command: "ls", explanation: "List files" },
      "session-1",
      undefined,
      undefined,
      undefined,
      "/repo-worktree",
    );

    expect(starts).toEqual(["/repo-worktree"]);
    expect(executions[0].input).toMatchObject({
      command: "pwd",
      sandbox: true,
      sandboxMountMode: "read-write",
    });
    expect(executions[0].context.sandboxContainerName).toBe("jait-agent-sb-test");
    expect(executions[1].context.sandboxContainerName).toBe("jait-agent-sb-test");

    await provider.stopSession("session-1");
    expect(stops).toEqual(["jait-agent-sb-test"]);
  });
});
