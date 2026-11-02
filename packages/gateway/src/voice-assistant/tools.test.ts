import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";

/**
 * Poll an async predicate until it returns truthy or the timeout elapses.
 * Used instead of `vi.waitFor` (which is not available under `bun test`).
 */
async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
import { openDatabase, migrateDatabase } from "../db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { SessionStateService } from "../services/session-state.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { BackgroundTaskManager, executeVoiceTool, getVoiceToolSchemas } from "./tools.js";

const originalFetch = globalThis.fetch;

class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}

describe("voice assistant tools", () => {
  afterEach(() => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  });

  it("exposes the agent handoff tool schema", () => {
    expect(getVoiceToolSchemas().some((tool) => tool.name === "ask_agent_about_request")).toBe(true);
  });

  it("exposes location and weather tool schemas", () => {
    const schemas = getVoiceToolSchemas();
    expect(schemas.some((tool) => tool.name === "get_location")).toBe(true);
    expect(schemas.some((tool) => tool.name === "get_weather")).toBe(true);
  });

  it("returns configured location without network lookup", async () => {
    process.env["JAIT_LOCATION"] = "Berlin, Germany";

    const result = await executeVoiceTool("get_location", {}, { config: loadConfig() });

    expect(JSON.parse(result)).toEqual({
      label: "Berlin, Germany",
      city: "Berlin, Germany",
      source: "configured",
    });
  });

  it("uses configured location when weather city is omitted", async () => {
    process.env["JAIT_LOCATION"] = "Berlin";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("https://wttr.in/Berlin?format=3");
      return new Response("Berlin: 8 C, light rain", { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await executeVoiceTool("get_weather", {}, { config: loadConfig() });

    expect(result).toBe("Berlin: 8 C, light rain");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks a regular agent and cleans up the temporary thread", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockVoiceThreadProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const sessionState = new SessionStateService(db);
      sessionState.set("voice-assistant", {
        "chat.providerRuntimeMode": "full-access",
        "chat.cliModels": { codex: "gpt-5.4" },
      });

      const threadService = new ThreadService(db);
      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?" },
        {
          config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
          userId: user.id,
          userService,
          sessionState,
          threadService,
          providerRegistry,
        },
      );

      expect(result).toBe("That is the deployed gateway node.");
      expect(threadService.list(user.id)).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
});

describe("ask_agent_about_request background delegation", () => {
  afterEach(() => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  });

  /**
   * A provider that completes its turn synchronously (assistant message +
   * turn.completed) on sendTurn, mirroring MockVoiceThreadProvider but as a
   * fresh class so its event emitter is independent per test.
   */
  function makeCompletingProvider() {
    return new MockVoiceThreadProvider();
  }

  /**
   * A provider that NEVER emits completion on sendTurn, so a background task
   * started against it stays "running" until cancelled. stopSession emits a
   * session.completed event (which the waitForDelegatedAgentAnswer loop would
   * treat as completion, but only for the cancelled path which short-
   * circuits).
   */
  class HangingVoiceThreadProvider extends MockVoiceThreadProvider {
    override async sendTurn(_sessionId: string, _message: string): Promise<void> {
      // Intentionally do NOT emit assistant message or turn.completed.
    }
    override async stopSession(sessionId: string): Promise<void> {
      // Emit nothing that would resolve the waiting promise in a way that
      // re-invokes onBackgroundTaskComplete after cancellation. The cancel
      // path checks `task.cancelled` before firing the callback.
      this.emit({ type: "session.completed", sessionId });
    }
  }

  function makeBaseDeps(db: any, providerRegistry: ProviderRegistry, user: any) {
    const sessionState = new SessionStateService(db);
    sessionState.set("voice-assistant", {
      "chat.providerRuntimeMode": "full-access",
      "chat.cliModels": { codex: "gpt-5.4" },
    });
    return {
      config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
      userId: user.id,
      userService: new UserService(db),
      sessionState,
      threadService: new ThreadService(db),
      providerRegistry,
    };
  }

  it("registers a background task and returns an ack immediately (non-blocking)", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      // Use a provider that never auto-completes so the task reliably stays
      // "running" while we assert on the immediate (non-blocking) ack.
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new HangingVoiceThreadProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?", background: true, timeoutMs: 60_000 },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );

      // Non-blocking: returns an ack starting with the expected phrase.
      expect(result.startsWith("Started a background task")).toBe(true);

      // The manager has exactly one running task registered.
      expect(backgroundTasks.list()).toHaveLength(1);
      expect(backgroundTasks.list()[0].status).toBe("running");

      // The ack string embeds the task id.
      const taskId = backgroundTasks.list()[0].id;
      expect(result).toContain(taskId);

      // The completion callback has NOT fired yet (task still running).
      expect(onBackgroundTaskComplete).not.toHaveBeenCalled();

      // Cancel so the dangling background IIFE cleans up instead of hanging
      // until the 60s timeout.
      await backgroundTasks.cancel(taskId);
      // Give the fire-and-forget IIFE a moment to finish its finally cleanup
      // (stopSession + threadService.delete) before we close the sqlite db.
      await poll(
        () => {
          expect(base.threadService.list(user.id)).toHaveLength(0);
        },
        { timeout: 2000, interval: 10 },
      );
    } finally {
      sqlite.close();
    }
  });

  it("eventually calls onBackgroundTaskComplete with status completed + the mock answer, and cleans up the temp thread", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(makeCompletingProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?", background: true },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      expect(result.startsWith("Started a background task")).toBe(true);

      // Wait (polling up to ~2s) for the completion callback.
      await poll(
        () => {
          expect(onBackgroundTaskComplete).toHaveBeenCalledTimes(1);
        },
        { timeout: 2000, interval: 10 },
      );

      const completedTask = onBackgroundTaskComplete.mock.calls[0][0];
      expect(completedTask.status).toBe("completed");
      expect(completedTask.result).toBe("That is the deployed gateway node.");
      expect(completedTask.cancelled).toBeFalsy();

      // The manager task is updated to completed.
      expect(backgroundTasks.get(completedTask.id)?.status).toBe("completed");
      expect(backgroundTasks.get(completedTask.id)?.result).toBe(
        "That is the deployed gateway node.",
      );

      // Temp thread is cleaned up. Allow a short poll for the finally block
      // (stopSession + threadService.delete) to settle.
      await poll(
        () => {
          expect(base.threadService.list(user.id)).toHaveLength(0);
        },
        { timeout: 2000, interval: 10 },
      );
    } finally {
      sqlite.close();
    }
  });

  it("background:false (omitted) still returns the answer synchronously (existing sync path unbroken)", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(makeCompletingProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      // Explicit background:false.
      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?", background: false },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      expect(result).toBe("That is the deployed gateway node.");
      // No background task should have been registered.
      expect(backgroundTasks.list()).toHaveLength(0);
      expect(onBackgroundTaskComplete).not.toHaveBeenCalled();
      // Sync path cleans up the thread immediately.
      expect(base.threadService.list(user.id)).toHaveLength(0);

      // Also verify the omitted case behaves the same.
      const result2 = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?" },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      expect(result2).toBe("That is the deployed gateway node.");
      expect(backgroundTasks.list()).toHaveLength(0);
      expect(onBackgroundTaskComplete).not.toHaveBeenCalled();
    } finally {
      sqlite.close();
    }
  });

  it("cancel_background_task on a still-running task: returns confirmation, status becomes cancelled, onBackgroundTaskComplete NOT called", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new HangingVoiceThreadProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      const ack = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "Long-running research task", background: true, timeoutMs: 60_000 },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      expect(ack.startsWith("Started a background task")).toBe(true);

      const taskId = backgroundTasks.list()[0].id;
      expect(backgroundTasks.get(taskId)?.status).toBe("running");

      const cancelResult = await executeVoiceTool(
        "cancel_background_task",
        { taskId },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      expect(cancelResult).toContain("Cancelled background task");
      expect(cancelResult).toContain(taskId);
      expect(backgroundTasks.get(taskId)?.status).toBe("cancelled");
      expect(backgroundTasks.get(taskId)?.cancelled).toBe(true);

      // Give the fire-and-forget background IIFE a chance to run its
      // stopSession/finally cleanup. The completion callback must NOT fire
      // because the task was cancelled before the answer arrived.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await poll(
        () => {
          expect(base.threadService.list(user.id)).toHaveLength(0);
        },
        { timeout: 2000, interval: 10 },
      );
      expect(onBackgroundTaskComplete).not.toHaveBeenCalled();
    } finally {
      sqlite.close();
    }
  });
});

describe("list_background_tasks tool", () => {
  it("with 0 tasks returns the no-tasks message", async () => {
    const backgroundTasks = new BackgroundTaskManager();
    const result = await executeVoiceTool(
      "list_background_tasks",
      {},
      { config: loadConfig(), backgroundTasks },
    );
    expect(result).toBe("No background tasks running.");
  });

  it("with 1 registered task mentions the task title and id", async () => {
    const backgroundTasks = new BackgroundTaskManager();
    backgroundTasks.register({
      id: "voice-task-xyz",
      title: "Voice: summarize the logs",
      threadId: "t-1",
      providerId: "codex",
      status: "running",
      startedAt: Date.now(),
    });
    const result = await executeVoiceTool(
      "list_background_tasks",
      {},
      { config: loadConfig(), backgroundTasks },
    );
    expect(result).toContain("Voice: summarize the logs");
    expect(result).toContain("voice-task-xyz");
    expect(result).toContain("running");
  });

  it("without a manager returns the not-available message", async () => {
    const result = await executeVoiceTool(
      "list_background_tasks",
      {},
      { config: loadConfig() },
    );
    expect(result).toBe("Background tasks not available.");
  });
});

describe("cancel_background_task tool", () => {
  it("unknown id returns the not-found message", async () => {
    const backgroundTasks = new BackgroundTaskManager();
    const result = await executeVoiceTool(
      "cancel_background_task",
      { taskId: "does-not-exist" },
      { config: loadConfig(), backgroundTasks },
    );
    expect(result).toBe("No background task with that id.");
  });

  it("known running task returns confirmation and the task status becomes cancelled", async () => {
    const backgroundTasks = new BackgroundTaskManager();
    backgroundTasks.register(
      {
        id: "task-running",
        title: "Voice: do a thing",
        threadId: "t-1",
        providerId: "codex",
        status: "running",
        startedAt: Date.now(),
      },
      async () => {},
    );
    const result = await executeVoiceTool(
      "cancel_background_task",
      { taskId: "task-running" },
      { config: loadConfig(), backgroundTasks },
    );
    expect(result).toContain("Cancelled background task");
    expect(result).toContain("task-running");
    expect(backgroundTasks.get("task-running")?.status).toBe("cancelled");
  });

  it("a non-running task returns the not-running message", async () => {
    const backgroundTasks = new BackgroundTaskManager();
    backgroundTasks.register({
      id: "task-done",
      title: "Voice: done",
      threadId: "t-1",
      providerId: "codex",
      status: "completed",
      result: "done",
      startedAt: Date.now(),
    });
    const result = await executeVoiceTool(
      "cancel_background_task",
      { taskId: "task-done" },
      { config: loadConfig(), backgroundTasks },
    );
    expect(result).toContain("is not running");
    expect(backgroundTasks.get("task-done")?.status).toBe("completed");
  });
});
