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
  behavior: "success" | "error" | "hang" = "success";

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
    expect(result.message).toBe("[INFORM] done");
    expect(provider.startedSessions).toHaveLength(1);
    expect(provider.startedSessions[0]?.threadId).toBe("session-1:sub:sub-1");
    expect(provider.sentTurns[0]?.message).toBe("do the thing");
    // Always tears the scoped session down — it's a one-shot delegation, not a persistent chat.
    expect(provider.stoppedSessionIds).toHaveLength(1);
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
