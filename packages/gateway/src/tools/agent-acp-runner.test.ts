import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { runAcpSpecialistTurn } from "./agent-acp-runner.js";
import { ProviderRegistry } from "../providers/registry.js";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../providers/contracts.js";

/** Minimal CliProviderAdapter test double driven by an EventEmitter. */
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access", "supervised"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  stoppedSessionIds: string[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];
  behavior: "success" | "error" | "error-after-work" | "hang" | "with-tools" = "success";

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    if (this.behavior === "hang") {
      await new Promise(() => { /* never resolves */ });
      return;
    }
    if (this.behavior === "error") {
      this.emitter.emit("event", { type: "session.error", sessionId, error: "boom" } satisfies ProviderEvent);
      throw new Error("boom");
    }
    if (this.behavior === "error-after-work") {
      this.emitter.emit("event", { type: "token", sessionId, content: "looking into it" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1" } satisfies ProviderEvent);
      throw new Error("transport died");
    }
    if (this.behavior === "with-tools") {
      this.emitter.emit("event", { type: "token", sessionId, content: "start" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1", data: { output: "ok!" } } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "token", sessionId, content: "finished" } satisfies ProviderEvent);
      return;
    }
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] " } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: "done" } satisfies ProviderEvent);
  }

  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId);
  }
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}

const config = { host: "127.0.0.1", port: 8000 };

describe("runAcpSpecialistTurn", () => {
  it("runs a turn against the provider and returns accumulated output", async () => {
    const provider = new FakeAcpProvider();
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-1",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    expect(result.ok).toBe(true);
    // The [INFORM] performative tag is parsed out of the visible message.
    expect(result.message).toBe("done");

    // The result carries a structured sub-agent message payload — the same
    // shape a jait-backend specialist produces — so the parent turn can persist
    // and reload it like a normal chat turn.
    const data = result.data as Record<string, unknown>;
    expect(data.subAgentId).toBe("sub-1");
    expect(data.provider).toBe("claude-code");
    expect(data.performative).toBe("inform");
    expect(data.content).toBe("[INFORM] done");
    // Two consecutive text tokens are merged into a single text segment.
    expect(data.segments).toEqual([{ type: "text", content: "done" }]);
    expect(data.toolCalls).toEqual([]);
    expect(typeof data.durationMs).toBe("number");

    expect(provider.startedSessions).toHaveLength(1);
    expect(provider.startedSessions[0]?.threadId).toBe("session-1:sub:sub-1");
    expect(provider.sentTurns[0]?.message).toBe("do the thing");
    // Always tears the scoped session down — it's a one-shot delegation, not a persistent chat.
    expect(provider.stoppedSessionIds).toHaveLength(1);
  });

  it("collects tool calls and their results into ordered segments for persistence", async () => {
    const provider = new FakeAcpProvider();
    provider.behavior = "with-tools";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-tools",
      projectRoot: "/repo",
      prompt: "use a tool",
    });

    expect(result.ok).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.segments).toEqual([
      { type: "text", content: "start" },
      { type: "toolGroup", callIds: ["call-1"] },
      { type: "text", content: "finished" },
    ]);
    expect(data.toolCalls).toHaveLength(1);
    const call = (data.toolCalls as Array<Record<string, unknown>>)[0]!;
    expect(call.callId).toBe("call-1");
    expect(call.tool).toBe("bash");
    expect(call.ok).toBe(true);
    expect(call.message).toBe("ok!");
    expect(typeof call.completedAt).toBe("number");
  });

  it("returns ok:false when the provider reports a session error", async () => {
    const provider = new FakeAcpProvider();
    provider.behavior = "error";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-2",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("boom");
    expect(provider.stoppedSessionIds).toHaveLength(1);
  });

  it("keeps the transcript streamed before the turn threw so it can still be persisted", async () => {
    const provider = new FakeAcpProvider();
    provider.behavior = "error-after-work";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-partial",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    expect(result.ok).toBe(false);
    const data = result.data as Record<string, unknown>;
    expect(data.subAgentId).toBe("sub-partial");
    // Text + tool call up to the failure, then the error itself — not just a
    // bare error message with the work discarded.
    expect(data.segments).toEqual([
      { type: "text", content: "looking into it" },
      { type: "toolGroup", callIds: ["call-1"] },
      { type: "error", content: expect.stringContaining("transport died") },
    ]);
    expect(data.toolCalls).toHaveLength(1);
    expect(data.content).toBe("looking into it");
  });

  it("times out and stops the session instead of hanging forever", async () => {
    const provider = new FakeAcpProvider();
    provider.behavior = "hang";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-3",
      projectRoot: "/repo",
      prompt: "do the thing",
      timeoutMs: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("timed out");
    expect(provider.stoppedSessionIds).toHaveLength(1);
  });

  it("returns ok:false for an unknown or inaccessible provider without throwing", async () => {
    const registry = new ProviderRegistry();

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-4",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not available");
  });
});
