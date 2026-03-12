import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  StartSessionOptions,
} from "./providers/contracts.js";
import { ProviderRegistry } from "./providers/registry.js";
import { signAuthToken } from "./security/http-auth.js";
import { createServer } from "./server.js";
import { ThreadService } from "./services/threads.js";

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
  private nextSessionNumber = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `mock-session-${this.nextSessionNumber++}`;
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

  async sendTurn(_sessionId: string, _message: string, _attachments?: string[]): Promise<void> {
    return;
  }

  async interruptTurn(_sessionId: string): Promise<void> {
    return;
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}

function testConfig() {
  return {
    ...loadConfig(),
    port: 0,
    wsPort: 0,
    logLevel: "silent" as const,
    nodeEnv: "test",
  };
}

async function setupThreadApp() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);

  const provider = new MockThreadProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(testConfig(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
  });

  const token = await signAuthToken(
    { id: "thread-test-user", username: "thread-test-user" },
    testConfig().jwtSecret,
  );

  const inject = (options: Parameters<typeof app.inject>[0]) =>
    app.inject({
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(typeof options === "object" && "headers" in options ? options.headers : {}),
      },
    });

  return { app, sqlite, provider, threadService, inject };
}

describe("thread routes", () => {
  it("scopes provider events to the matching thread session", async () => {
    const { app, sqlite, provider, inject } = await setupThreadApp();
    try {
      const threadA = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Thread A", providerId: "codex" },
      });
      const threadB = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Thread B", providerId: "codex" },
      });

      const createdA = JSON.parse(threadA.body) as { id: string };
      const createdB = JSON.parse(threadB.body) as { id: string };

      const startedA = await inject({
        method: "POST",
        url: `/api/threads/${createdA.id}/start`,
      });
      const startedB = await inject({
        method: "POST",
        url: `/api/threads/${createdB.id}/start`,
      });

      const activeA = JSON.parse(startedA.body) as { providerSessionId: string };
      JSON.parse(startedB.body);

      provider.emit({
        type: "message",
        sessionId: activeA.providerSessionId,
        role: "assistant",
        content: "only thread a should persist this",
      });

      const activitiesA = await inject({
        method: "GET",
        url: `/api/threads/${createdA.id}/activities`,
      });
      const activitiesB = await inject({
        method: "GET",
        url: `/api/threads/${createdB.id}/activities`,
      });

      const bodyA = JSON.parse(activitiesA.body) as { activities: Array<{ kind: string; payload?: { content?: string } }> };
      const bodyB = JSON.parse(activitiesB.body) as { activities: Array<{ kind: string; payload?: { content?: string } }> };

      expect(
        bodyA.activities.some(
          (activity) =>
            activity.kind === "message" &&
            activity.payload?.content === "only thread a should persist this",
        ),
      ).toBe(true);
      expect(
        bodyB.activities.some(
          (activity) =>
            activity.kind === "message" &&
            activity.payload?.content === "only thread a should persist this",
        ),
      ).toBe(false);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("returns the full persisted activity log by default", async () => {
    const { app, sqlite, threadService, inject } = await setupThreadApp();
    try {
      const threadRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Long Thread", providerId: "codex" },
      });
      const thread = JSON.parse(threadRes.body) as { id: string };

      for (let i = 0; i < 150; i += 1) {
        threadService.addActivity(thread.id, "message", `message ${i}`, {
          role: i % 2 === 0 ? "user" : "assistant",
          content: `message ${i}`,
        });
      }

      const activitiesRes = await inject({
        method: "GET",
        url: `/api/threads/${thread.id}/activities`,
      });
      const body = JSON.parse(activitiesRes.body) as { activities: Array<unknown> };

      expect(body.activities).toHaveLength(150);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
