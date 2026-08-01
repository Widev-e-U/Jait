import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("chat route auth guards", () => {
  it("rejects protected chat/session endpoints without auth", async () => {
    const app = await createServer(testConfig);

    const chat = await app.inject({ method: "POST", url: "/api/chat", payload: { content: "hello", sessionId: "s1" } });
    const messages = await app.inject({ method: "GET", url: "/api/sessions/s1/messages" });
    const stream = await app.inject({ method: "GET", url: "/api/sessions/s1/stream" });
    const cancel = await app.inject({ method: "POST", url: "/api/sessions/s1/cancel" });

    expect(chat.statusCode).toBe(401);
    expect(messages.statusCode).toBe(401);
    expect(stream.statusCode).toBe(401);
    expect(cancel.statusCode).toBe(401);

    await app.close();
  });

  it("allows authenticated cancel on inactive session", async () => {
    const app = await createServer(testConfig);
    const headers = await authHeaders();

    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/no-active-stream/cancel",
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, cancelled: false });

    await app.close();
  });

  it("allows authenticated stream resume and returns snapshot + done for inactive session", async () => {
    const app = await createServer(testConfig);
    const headers = await authHeaders();

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/new-session/stream",
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toContain("no-transform");
    expect(res.headers["x-accel-buffering"]).toBe("no");
    expect(res.headers["content-encoding"]).toBe("identity");
    const dataLines = res.body
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);

    expect(dataLines[0]).toMatchObject({ type: "snapshot", streaming: false, messages: [] });
    expect(dataLines[1]).toMatchObject({ type: "done", session_id: "new-session" });

    await app.close();
  });

  it("loads five recent messages by default and keeps older history pageable", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("chat-history-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Progressive History" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const createdAt = (index: number) => new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString();

    db.insert(messages).values(Array.from({ length: 8 }, (_, index) => ({
      id: `message-${index}`,
      sessionId: session.id,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `content-${index}`,
      contextFlow: index === 7 ? JSON.stringify({ rounds: [], unused: "large-context-payload" }) : null,
      createdAt: createdAt(index),
    }))).run();

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });
    const headers = { authorization: `Bearer ${token}` };

    const initialResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers,
    });
    expect(initialResponse.statusCode).toBe(200);
    expect(initialResponse.body).not.toContain("large-context-payload");
    expect(initialResponse.json()).toMatchObject({
      limit: 5,
      total: 8,
      hasMore: true,
      messages: [
        { content: "content-3" },
        { content: "content-4" },
        { content: "content-5" },
        { content: "content-6" },
        { content: "content-7", hasContextFlow: true },
      ],
    });

    const olderResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages?limit=3&before=3`,
      headers,
    });
    expect(olderResponse.statusCode).toBe(200);
    expect(olderResponse.json()).toMatchObject({
      limit: 3,
      total: 8,
      hasMore: false,
      messages: [
        { content: "content-0" },
        { content: "content-1" },
        { content: "content-2" },
      ],
    });

    await app.close();
  });
});
