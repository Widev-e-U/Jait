import Fastify from "fastify";
import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type { CliProviderAdapter, ProviderEvent, ProviderInfo, ProviderSession, StartSessionOptions } from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { ThreadService } from "../services/threads.js";
import { registerThreadRoutes } from "./threads.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}


it("persists completed thread diff stats with no configured base or branch", async () => {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const threadService = new ThreadService(db);
  const thread = threadService.create({ userId: "user-1", title: "Diff counters", providerId: "codex", workingDirectory: process.cwd() });
  const provider = new MockThreadProvider();
  const registry = new ProviderRegistry();
  registry.register(provider);
  const diffStats = vi.fn(async () => ({ files: 2, insertions: 12, deletions: 3, hasChanges: true }));
  const app = Fastify();
  const config = loadConfig();
  registerThreadRoutes(app, config, {
    threadService, providerRegistry: registry,
    gitService: { diffStats, runStackedAction: vi.fn() },
  });
  try {
    const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`,
      headers: await authHeader(config.jwtSecret, "user-1"), payload: { message: "Work", titleTask: "" } });
    expect(response.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length === 1);
    provider.emit({ type: "session.completed", sessionId: "mock-session-1" });
    await waitFor(() => threadService.getById(thread.id)?.changeFiles === 2);
    expect(diffStats).toHaveBeenCalledWith(process.cwd(), undefined, undefined);
    expect(threadService.getById(thread.id)).toMatchObject({ status: "completed", changeFiles: 2, changeInsertions: 12, changeDeletions: 3 });
  } finally {
    await app.close();
    sqlite.close();
  }
});
