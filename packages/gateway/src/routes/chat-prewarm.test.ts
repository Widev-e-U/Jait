import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
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

/**
 * Stands in for claude-code/codex. `startSession` is deliberately slow so the
 * test can assert on *when* the bootstrap cost is paid, not just how often.
 */
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
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

describe("CLI provider pre-warm", () => {
  it("moves the provider bootstrap off the first message", { timeout: 30_000 }, async () => {
    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-first-message");

    const prewarmed = await h.prewarm();
    expect(prewarmed.json()).toMatchObject({ status: "started" });
    expect(provider.startSession).toHaveBeenCalledTimes(1);

    // The user's first message must now stream without paying for the spawn.
    const startedAt = Date.now();
    const response = await h.chat();
    const firstTurnMs = Date.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"token"');
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    expect(provider.sendTurn).toHaveBeenCalledTimes(1);
    expect(firstTurnMs).toBeLessThan(SlowStartProvider.START_MS);

    await h.close();
  });

  it("still sends Jait's system prompt on the first turn of a pre-warmed session", { timeout: 30_000 }, async () => {
    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-system-prompt");

    await h.prewarm();
    await h.chat();

    const [, firstTurnContent] = provider.sendTurn.mock.calls[0] as [string, string];
    // formatExternalProviderFirstTurn pastes the external-provider system
    // prompt into the first turn. A pre-warmed session has never been sent a
    // turn, so this message is still the first one.
    expect(firstTurnContent).toContain("Jait");
    expect(firstTurnContent.length).toBeGreaterThan(500);

    // ...and the *second* message must not repeat it.
    await h.chat({ content: "follow up" });
    const [, secondTurnContent] = provider.sendTurn.mock.calls[1] as [string, string];
    expect(secondTurnContent.length).toBeLessThan(firstTurnContent.length);

    await h.close();
  });

  it("does not spawn twice when the message races the pre-warm", { timeout: 30_000 }, async () => {
    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-race");

    // Fire both without awaiting the pre-warm — the exact race a user creates
    // by typing fast after opening a new chat.
    const [, chatResponse] = await Promise.all([h.prewarm(), h.chat()]);

    expect(chatResponse.statusCode).toBe(200);
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    expect(provider.sendTurn).toHaveBeenCalledTimes(1);

    await h.close();
  });

  it("replaces a pre-warmed session when the message asks for a different model", { timeout: 30_000 }, async () => {
    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-model-switch");

    await h.prewarm({ model: "sonnet" });
    expect(provider.startSession).toHaveBeenCalledTimes(1);

    const response = await h.chat({ model: "opus" });

    expect(response.statusCode).toBe(200);
    expect(provider.startSession).toHaveBeenCalledTimes(2);
    expect(provider.stopSession).toHaveBeenCalledTimes(1);
    expect(provider.startSession.mock.calls[1]?.[0]).toMatchObject({ model: "opus" });

    await h.close();
  });

  it("never restarts a session that is already holding a conversation", { timeout: 30_000 }, async () => {
    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-existing");

    await h.chat();
    expect(provider.startSession).toHaveBeenCalledTimes(1);

    const prewarmed = await h.prewarm();

    expect(prewarmed.json()).toMatchObject({ status: "skipped", reason: "session-in-use" });
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    expect(provider.stopSession).not.toHaveBeenCalled();

    await h.close();
  });

  it("skips non-CLI providers instead of spawning anything", { timeout: 30_000 }, async () => {
    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-jait");

    const response = await h.prewarm({ provider: "jait" });

    expect(response.json()).toMatchObject({ status: "skipped", reason: "not-a-cli-provider" });
    expect(provider.startSession).not.toHaveBeenCalled();

    await h.close();
  });
});
