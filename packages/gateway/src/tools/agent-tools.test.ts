import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createAgentSpawnTool } from "./agent-tools.js";
import { createAgentTool } from "./core/agent.js";
import { ProviderRegistry } from "../providers/registry.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolContext } from "./contracts.js";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../providers/contracts.js";
import type { LLMConfig } from "./agent-loop.js";

class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return { id: "sess-1", providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string): Promise<void> {
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] specialist result" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}

const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
  userId: "user-1",
};

describe("createAgentSpawnTool provider routing", () => {
  it("routes to the ACP provider when the context picked a non-jait provider", async () => {
    const provider = new FakeAcpProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);

    const getLLMConfig = vi.fn<() => LLMConfig>();
    const tool = createAgentSpawnTool({
      toolRegistry: {} as ToolRegistry,
      getLLMConfig,
      providerRegistry,
      gatewayAddress: { host: "127.0.0.1", port: 8000 },
    });

    const result = await tool.execute(
      { prompt: "do the thing", description: "test task" },
      { ...baseContext, providerId: "claude-code", model: "opus" },
    );

    expect(result.ok).toBe(true);
    expect(result.message).toBe("specialist result");
    // Must never touch the HTTP LLM path for an ACP provider — that's the
    // exact bug (bare CLI alias like "opus" sent to the wrong HTTP backend).
    expect(getLLMConfig).not.toHaveBeenCalled();
  });

  it("fails clearly instead of silently falling back to the HTTP path when ACP deps are missing", async () => {
    const getLLMConfig = vi.fn<() => LLMConfig>();
    const tool = createAgentSpawnTool({
      toolRegistry: {} as ToolRegistry,
      getLLMConfig,
    });

    const result = await tool.execute(
      { prompt: "do the thing", description: "test task" },
      { ...baseContext, providerId: "claude-code", model: "opus" },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("claude-code");
    expect(getLLMConfig).not.toHaveBeenCalled();
  });

  it("still uses the HTTP LLM path for the built-in jait provider", async () => {
    const toolRegistry = {
      has: () => true,
      list: () => [],
      execute: vi.fn(),
    } as unknown as ToolRegistry;
    const getLLMConfig = vi.fn<() => LLMConfig>().mockReturnValue({
      openaiApiKey: "key",
      openaiBaseUrl: "http://127.0.0.1:11434/v1",
      openaiModel: "deepseek-v4-flash:0731-cloud",
      contextWindow: 32768,
    });

    const tool = createAgentSpawnTool({ toolRegistry, getLLMConfig });

    // Pre-aborted signal so the loop short-circuits right after resolving
    // the LLM config instead of making a real network call — this test only
    // cares that the "jait" provider still reaches getLLMConfig (the HTTP
    // path), not that a full sub-agent turn succeeds.
    const result = await tool.execute(
      { prompt: "do the thing", description: "test task", allowedTools: "" },
      { ...baseContext, providerId: "jait", signal: AbortSignal.abort() },
    );

    expect(result.message).toContain("Cancelled");
    expect(getLLMConfig).toHaveBeenCalled();
  });
});

describe("sub-agents run uncapped", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes no round-cap parameter for the model to set", () => {
    const spawn = createAgentSpawnTool({ toolRegistry: {} as ToolRegistry, getLLMConfig: vi.fn<() => LLMConfig>() });
    const core = createAgentTool({ toolRegistry: {} as ToolRegistry, getLLMConfig: vi.fn<() => LLMConfig>() });

    // A cap the model can set is a cap the model *will* set — it truncates the
    // specialist mid-task and the partial work comes back looking finished.
    for (const def of [spawn, core]) {
      const props = (def.parameters as { properties: Record<string, unknown> }).properties;
      expect(Object.keys(props)).not.toContain("maxRounds");
    }
  });

  it("keeps a specialist running past any round count a caller tries to impose", async () => {
    // Four tool rounds, then a final tagged answer. If a cap were still applied
    // the run would stop at round 2 with truncated, untagged output.
    const toolRound = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const finalRound = [
      'data: {"choices":[{"delta":{"content":"[INFORM] implemented and verified"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = round++ < 4 ? toolRound : finalRound;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const fileReadDef = {
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: {} },
    };
    let call = 0;
    const toolRegistry = {
      has: () => true,
      get: () => fileReadDef,
      list: () => [fileReadDef],
      // Vary the result so duplicate-call loop detection doesn't end the run.
      execute: async () => ({ ok: true, message: `finding ${++call}` }),
    } as unknown as ToolRegistry;

    const tool = createAgentSpawnTool({
      toolRegistry,
      getLLMConfig: () => ({
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      }),
    });

    const result = await tool.execute(
      // Passed anyway — the schema no longer advertises it, so it must be ignored.
      { prompt: "implement the thing", description: "Developer", allowedTools: "file.read", maxRounds: 2 } as never,
      { ...baseContext, providerId: "jait" },
    );

    expect(result.ok).toBe(true);
    expect(result.message).toBe("implemented and verified");
    expect(result.data).toMatchObject({ performative: "inform" });
    expect(round).toBeGreaterThan(2);
  });
});

describe("sub-agent result chronology", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the run's ordered segments so the UI can replay it as a chat", async () => {
    const rounds = [
      [
        'data: {"choices":[{"delta":{"content":"Looking at the config first."}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"[INFORM] the config sets the port"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = rounds[Math.min(round++, rounds.length - 1)]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const fileReadDef = { name: "file.read", description: "Read a file", parameters: { type: "object", properties: {} } };
    const toolRegistry = {
      has: () => true,
      get: () => fileReadDef,
      list: () => [fileReadDef],
      execute: async () => ({ ok: true, message: "port = 8000" }),
    } as unknown as ToolRegistry;

    const tool = createAgentSpawnTool({
      toolRegistry,
      getLLMConfig: () => ({
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      }),
    });

    const result = await tool.execute(
      { prompt: "find the port", description: "Researcher", allowedTools: "file.read" },
      { ...baseContext, providerId: "jait" },
    );

    // The prose the specialist wrote before delegating to a tool has to stay
    // *before* that tool call — this ordering is the whole point of shipping
    // segments, since the flat toolCalls list can only be rendered as one lump.
    expect(result.data).toMatchObject({
      segments: [
        { type: "text", content: "Looking at the config first." },
        { type: "toolGroup", callIds: ["call-1"] },
        // Performative tag is parent-agent bookkeeping, never rendered.
        { type: "text", content: "the config sets the port" },
      ],
    });
  });
});
