import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderId,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../providers/contracts.js";
import type { GitStepResult } from "../services/git.js";
import { ProviderRegistry } from "../providers/registry.js";
import { SessionStateService } from "../services/session-state.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { createToolRegistry } from "./index.js";
import { createThreadControlTool } from "./thread-tools.js";

class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
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

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}

function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    workspaceRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}

function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}

describe("thread.control tool", () => {
  it("creates and starts a thread in one call", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Run tests",
          start: true,
          message: "bun run test",
        },
        context,
      );

      expect(result.ok).toBe(true);
      expect(result.message).toBe("Thread created and started");
      const data = result.data as { thread: { providerSessionId: string | null; status: string } };
      expect(data.thread.providerSessionId).toBe("mock-session-1");
      expect(data.thread.status).toBe("running");
    } finally {
      sqlite.close();
    }
  });

  it("rejects creating a thread without a prompt", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "No prompt",
        },
        context,
      );

      expect(result.ok).toBe(false);
      expect(result.message).toBe("create requires non-empty `prompt`.");
    } finally {
      sqlite.close();
    }
  });

  it("accepts prompt as the clearer alias for message", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Prompt alias",
          start: true,
          prompt: "inspect ui",
        },
        context,
      );

      expect(result.ok).toBe(true);
      expect(provider.sendTurn).toHaveBeenCalledWith("mock-session-1", "inspect ui", undefined);
    } finally {
      sqlite.close();
    }
  });

  it("detaches scheduler-started turns so cron jobs do not block on long provider runs", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => new Promise<void>(() => {}));
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Cron task",
          kind: "delivery",
          start: true,
          prompt: "run scheduled quality task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      expect(result.ok).toBe(true);
      expect(result.message).toBe("Thread created and started");
      expect(provider.sendTurn).toHaveBeenCalledWith("mock-session-1", "run scheduled quality task", undefined);
      const data = result.data as { thread: { status: string; providerSessionId: string | null } };
      expect(data.thread.status).toBe("running");
      expect(data.thread.providerSessionId).toBe("mock-session-1");
    } finally {
      sqlite.close();
    }
  });

  it("creates a managed worktree branch for scheduler-created delivery threads", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => new Promise<void>(() => {}));
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const createWorktree = vi.fn(async (_cwd: string, _baseBranch: string, newBranch: string) => ({
        path: `/tmp/jait-worktrees/${newBranch.replace(/\//g, "-")}`,
        branch: newBranch,
      }));
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
            commit: { status: "skipped_no_changes" },
            push: { status: "skipped_not_requested" },
            branch: { status: "skipped_not_requested" },
            pr: { status: "skipped_not_requested" },
          }),
          isRepo: async () => true,
          getPreferredRemote: async () => "origin",
          getRemoteUrl: async () => "git@github.com:Widev-e-U/Jait.git",
          resolveDefaultBranch: async () => "main",
          createWorktree,
        },
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Cron task",
          kind: "delivery",
          workingDirectory: process.cwd(),
          start: true,
          prompt: "run scheduled quality task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { id: string; branch: string | null; workingDirectory: string | null } };
      expect(data.thread.branch).toMatch(/^jait\/[0-9a-f]{8}$/);
      expect(data.thread.workingDirectory).toBe(`/tmp/jait-worktrees/${data.thread.branch!.replace(/\//g, "-")}`);
      expect(createWorktree).toHaveBeenCalledWith(process.cwd(), "main", data.thread.branch);
      expect(threadService.getById(data.thread.id)?.workingDirectory).toBe(data.thread.workingDirectory);
    } finally {
      sqlite.close();
    }
  });

  it("can auto-stop a delivery thread after the first completed turn", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => {
        provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "One-shot delivery",
          kind: "delivery",
          start: true,
          prompt: "implement one focused fix",
          autoStopAfterTurn: true,
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { id: string; status: string; providerSessionId: string | null } };
      expect(data.thread.status).toBe("completed");
      expect(data.thread.providerSessionId).toBeNull();
      expect(provider.stopSession).toHaveBeenCalledWith("mock-session-1");
      expect(threadService.getById(data.thread.id)?.status).toBe("completed");
    } finally {
      sqlite.close();
    }
  });

  it("auto-completes delegation threads after the first completed turn", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => {
        provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "One-shot helper",
          kind: "delegation",
          start: true,
          message: "Summarize the current state",
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { id: string; status: string; providerSessionId: string | null } };
      expect(data.thread.status).toBe("completed");
      expect(data.thread.providerSessionId).toBeNull();
      expect(provider.stopSession).toHaveBeenCalledWith("mock-session-1");

      const stored = threadService.getById(data.thread.id);
      expect(stored?.status).toBe("completed");
      expect(stored?.providerSessionId).toBeNull();
      expect(stored?.completedAt).toBeTruthy();
    } finally {
      sqlite.close();
    }
  });

  it("marks delivery threads completed after the first turn while keeping them resumable", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => {
        provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Delivery thread",
          kind: "delivery",
          start: true,
          message: "Implement the fix",
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { id: string; status: string; providerSessionId: string | null } };
      expect(data.thread.status).toBe("completed");
      expect(data.thread.providerSessionId).toBe("mock-session-1");
      expect(provider.stopSession).not.toHaveBeenCalled();

      const stored = threadService.getById(data.thread.id);
      expect(stored?.status).toBe("completed");
      expect(stored?.providerSessionId).toBe("mock-session-1");
      expect(stored?.completedAt).toBeTruthy();
    } finally {
      sqlite.close();
    }
  });

  it("reuses a completed thread session for follow-up sends and clears completedAt", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: context.userId,
        title: "Delivery thread",
        providerId: "codex",
      });
      threadService.update(thread.id, {
        status: "completed",
        providerSessionId: "mock-session-1",
        completedAt: "2026-04-21T00:00:00.000Z",
      });

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "send",
          threadId: thread.id,
          message: "Continue with the fix",
        },
        context,
      );

      expect(result.ok).toBe(true);
      expect(provider.sendTurn).toHaveBeenCalledWith("mock-session-1", "Continue with the fix", undefined);
      expect(threadService.getById(thread.id)).toMatchObject({
        status: "running",
        completedAt: null,
      });
    } finally {
      sqlite.close();
    }
  });

  it("replays prior thread history when starting a fresh session for an existing thread", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: context.userId,
        title: "Delivery thread",
        providerId: "codex",
      });
      threadService.addActivity(thread.id, "message", "Investigate the bug", {
        role: "user",
        content: "Investigate the bug",
        fullContent: "Investigate the bug",
      });
      threadService.addActivity(thread.id, "message", "The issue is stale completion state.", {
        role: "assistant",
        content: "The issue is stale completion state.",
      });
      threadService.update(thread.id, {
        status: "completed",
        providerSessionId: null,
        completedAt: "2026-04-21T00:00:00.000Z",
      });

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          message: "Apply the fix",
        },
        context,
      );

      expect(result.ok).toBe(true);
      const sentMessage = provider.sendTurn.mock.calls[0]?.[1];
      expect(sentMessage).toEqual(expect.stringContaining("<thread-history>"));
      expect(sentMessage).toEqual(expect.stringContaining("User: Investigate the bug"));
      expect(sentMessage).toEqual(expect.stringContaining("Assistant: The issue is stale completion state."));
      expect(sentMessage).toEqual(expect.stringContaining("Apply the fix"));
    } finally {
      sqlite.close();
    }
  });

  it("uses the selected provider from user settings", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected provider",
          start: true,
          message: "inspect ui",
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { providerId: string; providerSessionId: string | null } };
      expect(data.thread.providerId).toBe("codex");
      expect(data.thread.providerSessionId).toBe("mock-session-1");
    } finally {
      sqlite.close();
    }
  });

  it("inherits the selected provider model from session state", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex", {
        model: "gpt-5-codex",
      });
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected model",
          start: true,
          message: "inspect ui",
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { providerId: string; model: string | null } };
      expect(data.thread.providerId).toBe("codex");
      expect(data.thread.model).toBe("gpt-5-codex");
    } finally {
      sqlite.close();
    }
  });

  it("uses the selected jait provider literally", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "jait");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("jait"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected jait provider",
          start: true,
          message: "inspect ui",
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { providerId: string; providerSessionId: string | null } };
      expect(data.thread.providerId).toBe("jait");
      expect(data.thread.providerSessionId).toBe("mock-session-1");
    } finally {
      sqlite.close();
    }
  });

  it("uses the selected jait provider and model for thread creation", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "jait", {
        model: "gpt-4.1",
      });
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("jait"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected jait model",
          start: true,
          message: "inspect ui",
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { providerId: string; model: string | null } };
      expect(data.thread.providerId).toBe("jait");
      expect(data.thread.model).toBe("gpt-4.1");
    } finally {
      sqlite.close();
    }
  });

  it("requires the calling agent to provide a supported thread provider", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Missing provider",
          prompt: "inspect ui",
        },
        makeContext(),
      );

      expect(result.ok).toBe(false);
      expect(result.message).toBe(
        "No provider could be resolved for this thread. A selected user provider must be configured and supported.",
      );
    } finally {
      sqlite.close();
    }
  });

  it("inherits provider, model, and runtime mode from the live tool context", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use live codex context",
          prompt: "inspect ui",
        },
        makeContext("user-1", {
          providerId: "codex",
          model: "gpt-5-codex",
          runtimeMode: "supervised",
        }),
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { providerId: string; model: string | null; runtimeMode: string } };
      expect(data.thread.providerId).toBe("codex");
      expect(data.thread.model).toBe("gpt-5-codex");
      expect(data.thread.runtimeMode).toBe("supervised");
    } finally {
      sqlite.close();
    }
  });

  it("inherits the selected provider, model, and runtime mode from user/session state", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("thread-owner", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const sessionState = new SessionStateService(db);
      sessionState.set("s-thread-tools", {
        "chat.providerRuntimeMode": "supervised",
        "chat.cliModels": { codex: "gpt-5-codex" },
      });

      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected chat defaults",
          prompt: "inspect ui",
        },
        makeContext(user.id),
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { providerId: string; model: string | null; runtimeMode: string } };
      expect(data.thread.providerId).toBe("codex");
      expect(data.thread.model).toBe("gpt-5-codex");
      expect(data.thread.runtimeMode).toBe("supervised");
    } finally {
      sqlite.close();
    }
  });

  it("keeps the stored thread provider when starting an existing thread", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Restart with selected provider",
        providerId: "codex",
      });

      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(new MockThreadProvider("jait"));

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
      });

      const result = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          message: "inspect ui",
        },
        makeContext("user-1"),
      );

      expect(result.ok).toBe(true);
      const data = result.data as { thread: { providerId: string; providerSessionId: string | null } };
      expect(data.thread.providerId).toBe("codex");
      expect(data.thread.providerSessionId).toBe("mock-session-1");
    } finally {
      sqlite.close();
    }
  });

  it("creates multiple threads in one call", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(new MockThreadProvider("claude-code"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
            commit: { status: "skipped_no_changes" },
            push: { status: "skipped_not_requested" },
            branch: { status: "skipped_not_requested" },
            pr: { status: "skipped_not_requested" },
          }),
        },
      });

      const result = await tool.execute(
        {
          action: "create_many",
          prompt: "inspect ui",
          threads: [
            { title: "Thread A" },
            { title: "Thread B" },
          ],
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { threads: Array<{ title: string; providerId: string }> };
      expect(data.threads).toHaveLength(2);
      expect(data.threads.map((t) => t.title)).toContain("Thread A");
      expect(data.threads.map((t) => t.title)).toContain("Thread B");
      expect(data.threads.every((thread) => thread.providerId === "codex")).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("defaults create_many threads to the selected provider", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(new MockThreadProvider("claude-code"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create_many",
          prompt: "inspect ui",
          threads: [
            { title: "Thread A" },
            { title: "Thread B" },
          ],
        },
        context,
      );

      expect(result.ok).toBe(true);
      const data = result.data as { threads: Array<{ providerId: string }> };
      expect(data.threads).toHaveLength(2);
      expect(data.threads.every((thread) => thread.providerId === "codex")).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("defaults create_many threads to the live caller context provider and model", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
      });

      const result = await tool.execute(
        {
          action: "create_many",
          prompt: "inspect ui",
          threads: [
            { title: "Thread A" },
            { title: "Thread B" },
          ],
        },
        makeContext("user-1", {
          providerId: "codex",
          model: "gpt-5-codex",
          runtimeMode: "supervised",
        }),
      );

      expect(result.ok).toBe(true);
      const data = result.data as { threads: Array<{ providerId: string; model: string | null; runtimeMode: string }> };
      expect(data.threads).toHaveLength(2);
      expect(data.threads.every((thread) => thread.providerId === "codex")).toBe(true);
      expect(data.threads.every((thread) => thread.model === "gpt-5-codex")).toBe(true);
      expect(data.threads.every((thread) => thread.runtimeMode === "supervised")).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("creates a PR and returns a direct link while updating thread metadata", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Implement feature",
        providerId: "codex",
        workingDirectory: process.cwd(),
      });
      threadService.markCompleted(thread.id);

      const prUrl = "https://github.com/acme/repo/pull/42";
      const tool = createThreadControlTool({
        threadService,
        providerRegistry: new ProviderRegistry(),
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
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
          }),
        },
      });

      const result = await tool.execute(
        {
          action: "create_pr",
          threadId: thread.id,
          commitMessage: "feat: implement feature",
          baseBranch: "main",
        },
        makeContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.message).toContain(prUrl);
      const data = result.data as { prUrl: string | null };
      expect(data.prUrl).toBe(prUrl);

      const updated = threadService.getById(thread.id);
      expect(updated?.prUrl).toBe(prUrl);
      expect(updated?.prNumber).toBe(42);
      expect(updated?.prTitle).toBe("feat: implement feature");
      expect(updated?.prState).toBe("open");
    } finally {
      sqlite.close();
    }
  });

  it("rejects PR creation until the thread is completed", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Implement feature",
        providerId: "codex",
        workingDirectory: process.cwd(),
      });

      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "feat: implement feature" },
        push: { status: "pushed", branch: "feature/awesome" },
        branch: { status: "skipped_not_requested" },
        pr: {
          status: "created",
          url: "https://github.com/acme/repo/pull/42",
          number: 42,
          baseBranch: "main",
          headBranch: "feature/awesome",
          title: "feat: implement feature",
        },
      }));

      const tool = createThreadControlTool({
        threadService,
        providerRegistry: new ProviderRegistry(),
        gitService: {
          runStackedAction,
        },
      });

      const result = await tool.execute(
        {
          action: "create_pr",
          threadId: thread.id,
          commitMessage: "feat: implement feature",
          baseBranch: "main",
        },
        makeContext(),
      );

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Thread must be completed before creating a pull request.");
      expect(runStackedAction).not.toHaveBeenCalled();
    } finally {
      sqlite.close();
    }
  });

  it("is registered in the tool registry when thread deps are provided", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const tools = createToolRegistry(new SurfaceRegistry(), {
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
      });
      expect(tools.listNames()).toContain("thread.control");
    } finally {
      sqlite.close();
    }
  });
});
