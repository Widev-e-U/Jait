import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";

const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};

/** Provider startup is held by the test until the chat has begun waiting. */
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}

async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}

it("waits for an in-flight prewarm before sending the first turn", async () => {
  const provider = new SlowStartProvider();
  let releaseStart!: () => void;
  const gate = new Promise<void>((resolve) => { releaseStart = resolve; });
  const start = provider.startSession.getMockImplementation()!;
  provider.startSession.mockImplementationOnce(async (options) => {
    await gate;
    return start(options);
  });
  const h = await harness(provider, "prewarm-pending");
  const timer = vi.spyOn(globalThis, "setTimeout");
  const requests: Promise<unknown>[] = [];
  try {
    // Start the HTTP requests explicitly: inject's thenable is lazy.
    const warming = h.prewarm().then(response => response);
    requests.push(warming);
    await vi.waitFor(() => expect(provider.startSession).toHaveBeenCalledTimes(1));
    const chatting = h.chat().then(response => response);
    requests.push(chatting);
    // This timer belongs to settlePendingCliSessionStart: the turn has reached
    // the pending prewarm, but the provider cannot finish until we release it.
    await vi.waitFor(() => expect(timer.mock.calls.some(([, delay]) => delay === 20_000)).toBe(true));
    expect(provider.sendTurn).not.toHaveBeenCalled();
    releaseStart();
    const [prewarmed, response] = await Promise.all([warming, chatting]);
    expect(prewarmed.json()).toMatchObject({ status: "started" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"token"');
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    expect(provider.sendTurn).toHaveBeenCalledTimes(1);
    expect(provider.sendTurn.mock.calls[0]?.[0]).toBe("mock-session-1");
  } finally {
    releaseStart();
    timer.mockRestore();
    await Promise.allSettled(requests);
    await h.close();
  }
});
