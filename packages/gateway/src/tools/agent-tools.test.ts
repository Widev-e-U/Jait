import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createAgentSpawnTool } from "./agent-tools.js";
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
