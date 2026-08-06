import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;

function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

describe("server-side queued chat processing", () => {
  let mockOllama: Server;
  let ollamaUrl: string;
  let app: Awaited<ReturnType<typeof createServer>> | null = null;

  beforeAll(async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  });

  it("does not re-send a queued message re-introduced by a stale client push after it was already drained", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-resend-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Re-send" });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };

    const readUserMessages = async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = response.json() as { messages: Array<{ role: string; content: string }> };
      return body.messages.filter((message) => message.role === "user").map((message) => message.content);
    };

    // Queue one message and drain it — it should be sent exactly once.
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-stale", content: "already drained message" }],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
    expect(await readUserMessages()).toEqual(["already drained message"]);
    expect(sessionState.get(session.id, ["queued_messages"])["queued_messages"]).toBeUndefined();

    // Simulate a stale client full-snapshot push re-introducing the SAME entry
    // (same id) after the drain already handed it to the agent. The drain must
    // drop it rather than send it a second time and leave a ghost queue entry.
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-stale", content: "already drained message" }],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    expect(await readUserMessages()).toEqual(["already drained message"]);
    expect(sessionState.get(session.id, ["queued_messages"])["queued_messages"]).toBeUndefined();
  });

  it("removes a stale queued entry at direct-send time and ignores a later stale re-push (client direct-send during a WS drop)", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-wsdrop-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue WS Drop" });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };

    const readUserMessages = async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = response.json() as { messages: Array<{ role: string; content: string }> };
      return body.messages.filter((message) => message.role === "user").map((message) => message.content);
    };

    // Simulate the WS-drop race in its real order: the message was queued
    // server-side (while WS was up), then the client delivered it directly via
    // POST because the WS dropped before the server could drain it. The stale
    // queue entry is still persisted, so the direct send MUST remove it at send
    // time and track its id — otherwise the end-of-turn drain (and any later
    // stale re-push) would re-send it ("already sent but still queued").
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-ws-drop", content: "sent directly while ws down" }],
    });

    const sentDirectly = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "sent directly while ws down" },
    });
    expect(sentDirectly.statusCode).toBe(200);

    // The direct send removed the matching entry, so the queue is already empty
    // and the end-of-turn drain had nothing to re-send.
    expect(sessionState.get(session.id, ["queued_messages"])["queued_messages"]).toBeUndefined();
    expect(await readUserMessages()).toEqual(["sent directly while ws down"]);

    // A stale client re-push of the SAME id (e.g. after a WS reconnect, before
    // the client learns the entry was consumed) must not resurrect it: the drain
    // filters the already-consumed id and clears the ghost entry.
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-ws-drop", content: "sent directly while ws down" }],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
    expect(await readUserMessages()).toEqual(["sent directly while ws down"]);
    expect(sessionState.get(session.id, ["queued_messages"])["queued_messages"]).toBeUndefined();
  });

  it("drains persisted queued_messages without any connected client", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queued Session" });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    sessionState.set(session.id, {
      queued_messages: [
        { id: "q1", content: "first queued message" },
        { id: "q2", content: "second queued message" },
      ],
    });

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    expect(sessionState.get(session.id, ["queued_messages"])["queued_messages"]).toBeUndefined();

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { messages: Array<{ role: string; content: string }> };
    expect(body.messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual([
      "first queued message",
      "second queued message",
    ]);
    expect(body.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual([
      "Echo: first queued message",
      "Echo: second queued message",
    ]);
  });

  it("drains duplicated persisted queued_messages only once per queued id", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-dedupe-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Dedupe" });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    sessionState.set(session.id, {
      queued_messages: [
        { id: "q-dup", content: "duplicated queued message" },
        { id: "q-dup", content: "duplicated queued message" },
      ],
    });

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { messages: Array<{ role: string; content: string }> };
    expect(body.messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual([
      "duplicated queued message",
    ]);
    expect(sessionState.get(session.id, ["queued_messages"])["queued_messages"]).toBeUndefined();
  });

  it("queues a concurrent direct chat POST instead of replacing the active stream", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-race-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Race" });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const slowStarted = new Promise<void>((resolve) => { slowOllamaStarted = resolve; });
    const firstResponse = app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "slow first" },
    });

    await slowStarted;

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "second while streaming" },
    });

    expect(secondResponse.statusCode).toBe(202);
    expect(secondResponse.body).toContain('"type":"queued"');
    expect(sessionState.get(session.id, ["queued_messages"])["queued_messages"]).toEqual([
      expect.objectContaining({ content: "second while streaming" }),
    ]);

    releaseSlowOllama?.();
    await firstResponse;
    slowOllamaStarted = null;
    releaseSlowOllama = null;

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    let userMessages: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = messagesResponse.json() as { messages: Array<{ role: string; content: string }> };
      userMessages = body.messages.filter((message) => message.role === "user").map((message) => message.content);
      if (userMessages.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(userMessages).toEqual([
      "slow first",
      "second while streaming",
    ]);
  });

  it("does not multiply a queued message when the same content is submitted twice while streaming", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-multiply-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Multiply" });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const slowStarted = new Promise<void>((resolve) => { slowOllamaStarted = resolve; });
    const firstResponse = app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "slow first" },
    });

    await slowStarted;

    // The client/server drain race submits the same content twice while the
    // session is still streaming. Both should be accepted as 202 "queued" but
    // the persisted queue must contain only ONE entry (deduped by content).
    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "duplicate queued message" },
    });
    const thirdResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "duplicate queued message" },
    });

    expect(secondResponse.statusCode).toBe(202);
    expect(thirdResponse.statusCode).toBe(202);
    const persisted = sessionState.get(session.id, ["queued_messages"])[
      "queued_messages"
    ] as Array<{ content: string }>;
    expect(persisted).toHaveLength(1);
    expect(persisted.map((m) => m.content)).toEqual(["duplicate queued message"]);

    releaseSlowOllama?.();
    await firstResponse;
    slowOllamaStarted = null;
    releaseSlowOllama = null;

    // Drain the queue and confirm the message is sent exactly once.
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    let userMessages: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = messagesResponse.json() as { messages: Array<{ role: string; content: string }> };
      userMessages = body.messages.filter((message) => message.role === "user").map((message) => message.content);
      if (userMessages.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(userMessages).toEqual([
      "slow first",
      "duplicate queued message",
    ]);
  });
});
