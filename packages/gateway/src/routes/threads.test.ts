import Fastify from "fastify";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { SessionStateService } from "../services/session-state.js";
import { SkillRegistry } from "../skills/index.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { registerThreadRoutes } from "./threads.js";
import type { WsControlPlane } from "../ws.js";
import { interventionRunResumeRegistry } from "../services/intervention-run-resume.js";

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

function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  expect(message).toEqual(expect.stringContaining(startsWith));
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

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}

describe("thread routes", () => {
  afterEach(() => {
    interventionRunResumeRegistry.clearForTests();
  });

  it("creates threads in idle state until a provider session actually starts", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider());

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", providerId: "codex", kind: "delegation" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      title: "Helper",
      status: "idle",
      providerSessionId: null,
    });

    await app.close();
    sqlite.close();
  });

  it("creates a literal jait thread when jait is selected", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("thread-user", "secret");
    users.updateSettings(user.id, { chatProvider: "jait" });
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider("jait"));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", providerId: "jait", kind: "delegation" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      title: "Helper",
      providerId: "jait",
      status: "idle",
      providerSessionId: null,
    });

    await app.close();
    sqlite.close();
  });

  it("creates threads from the selected chat provider, model, and runtime mode by default", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const sessionState = new SessionStateService(db);
    const user = users.createUser("selected-defaults-user", "secret");
    users.updateSettings(user.id, { chatProvider: "codex" });
    sessionState.set("session-selected-defaults", {
      "chat.providerRuntimeMode": "supervised",
      "chat.cliModels": { codex: "gpt-5-codex" },
    });
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider("codex"));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
      sessionState,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", sessionId: "session-selected-defaults", kind: "delegation" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      title: "Helper",
      providerId: "codex",
      model: "gpt-5-codex",
      runtimeMode: "supervised",
      status: "idle",
      providerSessionId: null,
    });

    await app.close();
    sqlite.close();
  });

  it("starts a literal jait thread when jait is selected", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("thread-user", "secret");
    users.updateSettings(user.id, { chatProvider: "jait" });
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("jait");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const thread = threadService.create({
      userId: user.id,
      title: "Helper",
      providerId: "jait",
      workingDirectory: process.cwd(),
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "inspect ui", titleTask: "" },
    });

    expect(response.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    expect(provider.sendTurn.mock.calls[0]?.[0]).toBe("mock-session-1");
    expectThreadTurnMessage(provider.sendTurn.mock.calls[0]?.[1], "inspect ui");
    expect(provider.sendTurn.mock.calls[0]?.[2]).toBeUndefined();

    await app.close();
    sqlite.close();
  });

  it("prepends the auto-matched skills block on the first thread turn", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);
    const skillRegistry = new SkillRegistry();
    skillRegistry.add({
      id: "word-docx",
      name: "Word / DOCX",
      description: "Handle DOCX files without formatting drift.",
      filePath: "C:/skills/word-docx/SKILL.md",
      source: "user",
      enabled: true,
    });

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      skillRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "DOCX helper",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Inspect the DOCX template", titleTask: "" },
    });

    expect(response.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    const turnMessage = provider.sendTurn.mock.calls.at(-1)?.[1] as string;
    expect(turnMessage).toContain("<available_skills>");
    expect(turnMessage).toContain("<name>Word / DOCX</name>");
    expect(turnMessage).toContain("Inspect the DOCX template");

    await app.close();
    sqlite.close();
  });

  it("uses thread-specific pinned skills when provided", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);
    const skillRegistry = new SkillRegistry();
    skillRegistry.add({
      id: "word-docx",
      name: "Word / DOCX",
      description: "Handle DOCX files without formatting drift.",
      filePath: "C:/skills/word-docx/SKILL.md",
      source: "user",
      enabled: true,
    });
    skillRegistry.add({
      id: "browser-research",
      name: "Browser Research",
      description: "Use the browser for deep web research.",
      filePath: "C:/skills/browser-research/SKILL.md",
      source: "user",
      enabled: true,
    });

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      skillRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "DOCX helper",
      providerId: "codex",
      workingDirectory: process.cwd(),
      skillIds: ["word-docx"],
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Inspect the template", titleTask: "" },
    });

    expect(response.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    const turnMessage = provider.sendTurn.mock.calls.at(-1)?.[1] as string;
    expect(turnMessage).toContain("<name>Word / DOCX</name>");
    expect(turnMessage).not.toContain("<name>Browser Research</name>");

    await app.close();
    sqlite.close();
  });

  it("starts and sends turns through claude-code threads", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("claude-code");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Claude helper", providerId: "claude-code", kind: "delegation" },
    });

    expect(createResponse.statusCode).toBe(201);
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "inspect ui", titleTask: "" },
    });

    expect(startResponse.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    expect(provider.sendTurn.mock.calls[0]?.[0]).toBe("mock-session-1");
    expectThreadTurnMessage(provider.sendTurn.mock.calls[0]?.[1], "inspect ui");
    expect(provider.sendTurn.mock.calls[0]?.[2]).toBeUndefined();

    threadService.update(thread.id, {
      status: "completed",
      error: null,
      completedAt: new Date().toISOString(),
    });

    const sendResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/send`,
      headers,
      payload: { message: "address the follow-up" },
    });

    expect(sendResponse.statusCode).toBe(200);
    expect(provider.sendTurn.mock.calls[1]?.[0]).toBe("mock-session-1");
    expectThreadTurnMessage(provider.sendTurn.mock.calls[1]?.[1], "address the follow-up");
    expect(provider.sendTurn.mock.calls[1]?.[2]).toBeUndefined();

    await app.close();
    sqlite.close();
  });

  it("queues an intervention resume note onto the same running thread session", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("claude-code");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Claude helper", providerId: "claude-code", kind: "delegation" },
    });
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "inspect ui", titleTask: "" },
    });

    expect(startResponse.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const resume = await interventionRunResumeRegistry.resumeThread(
      thread.id,
      "User completed intervention on browser session bs_123. Note: Continue from the current page.",
    );
    expect(resume).toEqual({ status: "queued" });

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });

    await waitFor(() => provider.sendTurn.mock.calls.length >= 2);
    expect(provider.sendTurn).toHaveBeenNthCalledWith(
      2,
      "mock-session-1",
      "User completed intervention on browser session bs_123. Note: Continue from the current page.",
    );
    expect(threadService.getById(thread.id)?.status).toBe("running");

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
    await waitFor(() => threadService.getById(thread.id)?.status === "completed");

    await app.close();
    sqlite.close();
  });

  it("wakes an already-completed thread via /send when a background command finishes late", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("background-cmd-user", "secret");
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("claude-code");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Claude helper", providerId: "claude-code", kind: "delegation" },
    });
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "kick off a background build", titleTask: "" },
    });
    expect(startResponse.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    // The agent ends its own turn right after starting the background command,
    // so the thread flips to "completed" well before the command finishes.
    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
    await waitFor(() => threadService.getById(thread.id)?.status === "completed");

    // The background command finishes afterwards; this is the notification
    // path backgroundCommandMonitor's completion handler drives in chat.ts.
    const resume = await interventionRunResumeRegistry.resumeThread(
      thread.id,
      "Background command finished: build succeeded.",
    );
    expect(resume).toEqual({ status: "queued" });

    await waitFor(() => provider.sendTurn.mock.calls.length >= 2);
    expect(provider.sendTurn.mock.calls[1]?.[0]).toBe("mock-session-1");
    expectThreadTurnMessage(provider.sendTurn.mock.calls[1]?.[1], "Background command finished: build succeeded.");
    expect(threadService.getById(thread.id)?.status).toBe("running");

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
    await waitFor(() => threadService.getById(thread.id)?.status === "completed");

    await app.close();
    sqlite.close();
  });

  it("drains persisted queued thread messages after the current turn completes", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const user = users.createUser("queued-thread-user", "secret");
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      sessionState,
      userService: users,
    });

    const sessionId = "session-with-thread-queue";
    const headers = await authHeader(config.jwtSecret, user.id);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Queued thread", providerId: "codex", sessionId },
    });
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "first message", titleTask: "" },
    });
    expect(startResponse.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    sessionState.set(sessionId, {
      queued_thread_messages: {
        [thread.id]: [
          {
            id: "queued-1",
            content: "second message",
            fullContent: "second message",
            displayContent: "second message",
            providerId: "codex",
            queuedAt: Date.now(),
          },
        ],
      },
    });

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });

    await waitFor(() => provider.sendTurn.mock.calls.length >= 2);
    expect(provider.sendTurn.mock.calls[1]?.[0]).toBe("mock-session-1");
    expectThreadTurnMessage(provider.sendTurn.mock.calls[1]?.[1], "second message");
    expect(provider.sendTurn.mock.calls[1]?.[2]).toBeUndefined();
    expect(sessionState.get(sessionId, ["queued_thread_messages"])["queued_thread_messages"]).toBeUndefined();
    expect(threadService.getActivities(thread.id).some((activity) => (
      activity.kind === "message" && activity.summary.includes("second message")
    ))).toBe(true);

    await app.close();
    sqlite.close();
  });

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
    const payload = response.json() as { hasMore: boolean; threads: Array<{ title: string }> };
    expect(payload.hasMore).toBe(true);
    expect(payload.threads).toHaveLength(2);
    const titles = payload.threads.map((thread) => thread.title);
    expect(new Set(titles).size).toBe(2);
    expect(titles.every((title) => ["Thread 1", "Thread 2", "Thread 3"].includes(title))).toBe(true);

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
      undefined,
    );

    const updated = threadService.getById(thread.id);
    expect(updated?.prUrl).toBe(prUrl);
    expect(updated?.prNumber).toBe(42);
    expect(updated?.prTitle).toBe("feat: implement feature");
    expect(updated?.prBaseBranch).toBe("main");
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
      payload: { message: "Fix the failing test", titleTask: "" },
    });

    expect(response.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    expect(provider.sendTurn.mock.calls.some(([sessionId, content]) =>
      sessionId === "mock-session-1"
      && typeof content === "string"
      && content.includes("Apply this follow-up work to the existing PR on branch `feature/existing-pr`."),
    )).toBe(true);
    
    await app.close();
    sqlite.close();
  });

  it("replays prior thread messages when restarting with a fresh provider session", async () => {
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
    });
    threadService.addActivity(thread.id, "message", "Investigate the flaky test", {
      role: "user",
      content: "Investigate the flaky test",
      fullContent: "Investigate the flaky test",
    });
    threadService.addActivity(thread.id, "message", "I found a race in the retry path.", {
      role: "assistant",
      content: "I found a race in the retry path.",
    });
    threadService.update(thread.id, {
      status: "completed",
      providerSessionId: null,
      completedAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Apply the fix now", titleTask: "" },
    });

    expect(response.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    const firstTurn = provider.sendTurn.mock.calls[0]?.[1];
    expect(firstTurn).toEqual(expect.stringContaining("<thread-history>"));
    expect(firstTurn).toEqual(expect.stringContaining("User: Investigate the flaky test"));
    expect(firstTurn).toEqual(expect.stringContaining("Assistant: I found a race in the retry path."));
    expect(firstTurn).toEqual(expect.stringContaining("Apply the fix now"));

    await app.close();
    sqlite.close();
  });

  it("clears completedAt when resuming a thread through send", async () => {
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
    });
    threadService.update(thread.id, {
      status: "completed",
      providerSessionId: "mock-session-1",
      completedAt: "2026-04-21T00:00:00.000Z",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/send`,
      headers,
      payload: { message: "Continue with the fix" },
    });

    expect(response.statusCode).toBe(200);
    expect(threadService.getById(thread.id)).toMatchObject({
      status: "running",
      completedAt: null,
    });

    await app.close();
    sqlite.close();
  });

  it("marks the thread PR state as creating while PR creation is in flight", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const prUrl = "https://github.com/acme/repo/pull/42";
    let resolveRun: ((result: GitStepResult) => void) | null = null;
    const runStackedAction = vi.fn(
      () =>
        new Promise<GitStepResult>((resolve) => {
          resolveRun = resolve;
        }),
    );

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

    const responsePromise = app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    await waitFor(() => threadService.getById(thread.id)?.prState === "creating");
    expect(threadService.getById(thread.id)?.prState).toBe("creating");

    resolveRun?.({
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
    });

    const response = await responsePromise;
    expect(response.statusCode).toBe(200);
    expect(threadService.getById(thread.id)?.prBaseBranch).toBe("main");
    expect(threadService.getById(thread.id)?.prState).toBe("open");

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

  it("persists assistant text between ACP tool calls as message activities", async () => {
    // Simulates an ACP provider that emits tokens → tool.start → tool.result → tokens
    // and verifies the thread handler flushes accumulated text into message activities.
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "ACP message test",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "do something", titleTask: "" },
    });
    expect(startResponse.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const sid = "mock-session-1";

    // Simulate ACP event sequence: text → tool → text → done
    // Phase 1: assistant emits text tokens before a tool call
    provider.emit({ type: "token", sessionId: sid, content: "Let me " });
    provider.emit({ type: "token", sessionId: sid, content: "check that file." });

    // Phase 2: tool call starts — should flush "Let me check that file."
    provider.emit({ type: "tool.start", sessionId: sid, tool: "read_file", args: { path: "/tmp/test.txt" }, callId: "call-1" });
    provider.emit({ type: "tool.result", sessionId: sid, tool: "read_file", ok: true, message: "file contents", callId: "call-1" });

    // Phase 3: more tokens after the tool
    provider.emit({ type: "token", sessionId: sid, content: "The file contains " });
    provider.emit({ type: "token", sessionId: sid, content: "the expected data." });

    // Phase 4: turn completes — should flush "The file contains the expected data."
    provider.emit({ type: "turn.completed", sessionId: sid });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));

    // Verify activities (getActivities returns descending order, reverse for chronological)
    const activities = threadService.getActivities(thread.id).reverse();
    const messageActivities = activities.filter((a) => a.kind === "message");
    const toolActivities = activities.filter((a) => a.kind === "tool.start" || a.kind === "tool.result");

    // Should have at least 2 assistant message activities (one before tool, one after)
    const assistantMessages = messageActivities.filter(
      (a) => (a.payload as { role?: string })?.role === "assistant",
    );
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2);

    // First assistant message: text before the tool call
    expect(assistantMessages[0]!.summary).toContain("Let me check that file.");
    const firstPayload = assistantMessages[0]!.payload as { content?: string };
    expect(firstPayload.content).toBe("Let me check that file.");

    // Second assistant message: text after the tool call
    expect(assistantMessages[1]!.summary).toContain("The file contains the expected data.");
    const secondPayload = assistantMessages[1]!.payload as { content?: string };
    expect(secondPayload.content).toBe("The file contains the expected data.");

    // Should also have tool activities
    expect(toolActivities.some((a) => a.kind === "tool.start")).toBe(true);
    expect(toolActivities.some((a) => a.kind === "tool.result")).toBe(true);

    // Verify ordering: message → tool.start → tool.result → message
    const ordered = activities.filter(
      (a) => a.kind === "message" || a.kind === "tool.start" || a.kind === "tool.result",
    );
    const kinds = ordered.map((a) => {
      if (a.kind === "message") {
        return `message:${(a.payload as { role?: string })?.role ?? "?"}`;
      }
      return a.kind;
    });

    // Expected chronological sequence: user message, assistant text, tool.start, tool.result, assistant text
    const firstAssistantIdx = kinds.indexOf("message:assistant");
    const toolStartIdx = kinds.indexOf("tool.start");
    const toolResultIdx = kinds.indexOf("tool.result");
    const lastAssistantIdx = kinds.lastIndexOf("message:assistant");

    expect(firstAssistantIdx).toBeLessThan(toolStartIdx);
    expect(toolStartIdx).toBeLessThan(toolResultIdx);
    expect(toolResultIdx).toBeLessThan(lastAssistantIdx);

    await app.close();
    sqlite.close();
  });

  it("does not lose assistant text when only tokens arrive with no tool calls", async () => {
    // Edge case: ACP provider sends tokens → turn.completed with no tools
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Token-only test",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "explain something", titleTask: "" },
    });
    expect(startResponse.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const sid = "mock-session-1";

    // Only tokens, no tool calls
    provider.emit({ type: "token", sessionId: sid, content: "Here is my explanation " });
    provider.emit({ type: "token", sessionId: sid, content: "of the topic." });
    provider.emit({ type: "turn.completed", sessionId: sid });

    await new Promise((r) => setTimeout(r, 100));

    const activities = threadService.getActivities(thread.id).reverse();
    const assistantMessages = activities.filter(
      (a) => a.kind === "message" && (a.payload as { role?: string })?.role === "assistant",
    );

    // The accumulated tokens should be flushed as a message activity
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    const payload = assistantMessages[0]!.payload as { content?: string };
    expect(payload.content).toBe("Here is my explanation of the topic.");

    await app.close();
    sqlite.close();
  });

  it("handles multiple tool calls with interleaved text", async () => {
    // Simulates: text → tool1 → text → tool2 → text → done
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Multi-tool test",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "do multiple things", titleTask: "" },
    });
    expect(startResponse.statusCode).toBe(200);
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const sid = "mock-session-1";

    // text1 → tool1 → text2 → tool2 → text3
    provider.emit({ type: "token", sessionId: sid, content: "First I'll read the file." });
    provider.emit({ type: "tool.start", sessionId: sid, tool: "read_file", args: { path: "/a.txt" }, callId: "c1" });
    provider.emit({ type: "tool.result", sessionId: sid, tool: "read_file", ok: true, message: "contents of a", callId: "c1" });

    provider.emit({ type: "token", sessionId: sid, content: "Now let me write the output." });
    provider.emit({ type: "tool.start", sessionId: sid, tool: "write_file", args: { path: "/b.txt" }, callId: "c2" });
    provider.emit({ type: "tool.result", sessionId: sid, tool: "write_file", ok: true, message: "written", callId: "c2" });

    provider.emit({ type: "token", sessionId: sid, content: "All done!" });
    provider.emit({ type: "turn.completed", sessionId: sid });

    await new Promise((r) => setTimeout(r, 100));

    const activities = threadService.getActivities(thread.id).reverse();
    const assistantMessages = activities.filter(
      (a) => a.kind === "message" && (a.payload as { role?: string })?.role === "assistant",
    );

    // Should have 3 assistant messages: before tool1, between tools, after tool2
    expect(assistantMessages.length).toBe(3);
    expect((assistantMessages[0]!.payload as { content: string }).content).toBe("First I'll read the file.");
    expect((assistantMessages[1]!.payload as { content: string }).content).toBe("Now let me write the output.");
    expect((assistantMessages[2]!.payload as { content: string }).content).toBe("All done!");

    await app.close();
    sqlite.close();
  });
});
