import Fastify from "fastify";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import type { GitStepResult } from "../services/git.js";
import { ThreadService } from "../services/threads.js";
import { registerThreadRoutes } from "./threads.js";
import type { WsControlPlane } from "../ws.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

class MockThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
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

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}

describe("thread routes", () => {
  it("lists threads with a bounded page and hasMore", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    threadService.create({ userId: "user-1", title: "Thread 1", providerId: "codex" });
    threadService.create({ userId: "user-1", title: "Thread 2", providerId: "codex" });
    threadService.create({ userId: "user-1", title: "Thread 3", providerId: "codex" });

    const response = await app.inject({
      method: "GET",
      url: "/api/threads?limit=2",
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      hasMore: true,
      threads: [
        { title: "Thread 3" },
        { title: "Thread 2" },
      ],
    });

    await app.close();
    sqlite.close();
  });

  it("rejects create-pr while a thread is not completed", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
      commit: { status: "skipped_no_changes" },
      push: { status: "skipped_not_requested" },
      branch: { status: "skipped_not_requested" },
      pr: { status: "skipped_not_requested" },
    }));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      gitService: { runStackedAction },
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "Thread must be completed before creating a pull request.",
    });
    expect(runStackedAction).not.toHaveBeenCalled();

    await app.close();
    sqlite.close();
  });

  it("creates a PR for a completed thread and updates thread metadata", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const prUrl = "https://github.com/acme/repo/pull/42";
    const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
      commit: { status: "created", commitSha: "abc123", subject: "feat: implement feature" },
      push: { status: "pushed", branch: "feature/awesome" },
      branch: { status: "skipped_not_requested" },
      pr: {
        status: "created",
        url: prUrl,
        number: 42,
        baseBranch: "main",
        headBranch: "feature/awesome",
        title: "feat: implement feature",
      },
    }));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      gitService: { runStackedAction },
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.markCompleted(thread.id);

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: `Pull request ready: ${prUrl}`,
      prUrl,
    });
    expect(runStackedAction).toHaveBeenCalledWith(
      process.cwd(),
      "commit_push_pr",
      "feat: implement feature",
      false,
      "main",
      undefined,
    );

    const updated = threadService.getById(thread.id);
    expect(updated?.prUrl).toBe(prUrl);
    expect(updated?.prNumber).toBe(42);
    expect(updated?.prTitle).toBe("feat: implement feature");
    expect(updated?.prState).toBe("open");

    await app.close();
    sqlite.close();
  });

  it("adds existing PR instructions to follow-up send turns", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider();
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
      branch: "feature/existing-pr",
    });
    threadService.update(thread.id, {
      providerSessionId: "mock-session-1",
      prUrl: "https://github.com/acme/repo/pull/42",
      prState: "open",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/send`,
      headers,
      payload: { message: "Address the review feedback" },
    });

    expect(response.statusCode).toBe(200);
    expect(provider.sendTurn).toHaveBeenCalledWith(
      "mock-session-1",
      expect.stringContaining("This thread already has an open pull request: https://github.com/acme/repo/pull/42."),
      undefined,
    );
    expect(provider.sendTurn).toHaveBeenCalledWith(
      "mock-session-1",
      expect.stringContaining("commit and push them to the same branch"),
      undefined,
    );

    await app.close();
    sqlite.close();
  });

  it("adds existing PR instructions when restarting a completed thread with a new message", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider();
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
      branch: "feature/existing-pr",
    });
    threadService.update(thread.id, {
      status: "completed",
      providerSessionId: null,
      prUrl: "https://github.com/acme/repo/pull/42",
      prState: "open",
      completedAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Fix the failing test" },
    });

    expect(response.statusCode).toBe(200);
    expect(provider.sendTurn).toHaveBeenCalledWith(
      "mock-session-1",
      expect.stringContaining("Apply this follow-up work to the existing PR on branch `feature/existing-pr`."),
      undefined,
    );

    await app.close();
    sqlite.close();
  });

  it("broadcasts the full thread row with running status updates", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider());
    const broadcastAll = vi.fn();
    const ws = {
      broadcastAll,
    } as unknown as WsControlPlane;

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.markInterrupted(thread.id);

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
    });

    expect(response.statusCode).toBe(200);

    const statusCall = broadcastAll.mock.calls.find(
      ([event]) => (event as { type?: string }).type === "thread.status",
    );
    expect(statusCall).toBeTruthy();
    expect(statusCall?.[0]).toMatchObject({
      type: "thread.status",
      payload: {
        threadId: thread.id,
        status: "running",
        thread: expect.objectContaining({
          id: thread.id,
          status: "running",
          providerSessionId: "mock-session-1",
        }),
      },
    });

    await app.close();
    sqlite.close();
  });
});
