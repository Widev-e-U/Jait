import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "crash-recovery-test-secret",
};

const originalFetch = globalThis.fetch;

function recoveredResponse(): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{"content":"Recovered and finished."},"finish_reason":null}]}\n\n',
      ));
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("gateway crash chat recovery", () => {
  it("records the interruption and automatically continues a durably marked turn", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("crash-recovery-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Interrupted work" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: { OPENROUTER_API_KEY: "test-key" },
    });
    db.insert(messages).values([
      {
        id: "original-user",
        sessionId: session.id,
        role: "user",
        content: "Implement the recovery feature",
        createdAt: "2026-08-31T08:19:00.000Z",
      },
      {
        id: "partial-assistant",
        sessionId: session.id,
        role: "assistant",
        content: "I have started the implementation.",
        createdAt: "2026-08-31T08:19:01.000Z",
      },
    ]).run();
    sessionState.set(session.id, {
      "chat.activeTurn": {
        turnId: "turn-before-oom",
        startedAt: "2026-08-31T08:19:00.000Z",
        mode: "agent",
        responseStyle: "normal",
        recoveryAttempts: 0,
      },
    });

    globalThis.fetch = vi.fn(async () => recoveredResponse()) as typeof fetch;
    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
    });

    try {
      const recover = (app as typeof app & {
        recoverInterruptedChatTurns: () => Promise<number>;
      }).recoverInterruptedChatTurns;
      await expect(recover()).resolves.toBe(1);

      expect(sessionState.get(session.id, ["chat.activeTurn"])["chat.activeTurn"]).toBeUndefined();
      const persisted = db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, session.id))
        .orderBy(messages.createdAt, messages.id)
        .all();

      const interruption = persisted.find((row) => row.id === "gateway-interruption-turn-before-oom");
      expect(interruption?.content).toContain("automatically continuing");
      expect(JSON.parse(interruption?.segments ?? "[]")).toEqual([
        expect.objectContaining({ type: "error", content: expect.stringContaining("Gateway process terminated") }),
      ]);
      expect(persisted.some((row) =>
        row.role === "assistant" && row.content.includes("Recovered and finished.")
      )).toBe(true);
      expect(persisted.filter((row) => row.id === "gateway-interruption-turn-before-oom")).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("stops an automatic crash loop after three failed recoveries", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("crash-loop-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Crash loop" });
    sessionState.set(session.id, {
      "chat.activeTurn": {
        turnId: "turn-crash-loop",
        startedAt: "2026-08-31T08:19:00.000Z",
        mode: "agent",
        responseStyle: "normal",
        recoveryAttempts: 3,
      },
    });

    const fetchMock = vi.fn(async () => recoveredResponse());
    globalThis.fetch = fetchMock as typeof fetch;
    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
    });

    try {
      await (app as typeof app & {
        recoverInterruptedChatTurns: () => Promise<number>;
      }).recoverInterruptedChatTurns();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(sessionState.get(session.id, ["chat.activeTurn"])["chat.activeTurn"]).toBeUndefined();
      const notice = db.select().from(messages)
        .where(eq(messages.id, "gateway-interruption-turn-crash-loop"))
        .get();
      expect(notice?.content).toContain("automatic recovery stopped");
      expect(notice?.content).toContain("Continue");
    } finally {
      await app.close();
    }
  });
});
