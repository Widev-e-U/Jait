import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";
import { eq } from "drizzle-orm";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};

describe("chat restart from message", () => {
  it("rejects a stale edit target instead of truncating and appending a new turn", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-stale-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Stale Restart" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");

    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "original", createdAt: now.toISOString() },
      { id: "m2", sessionId: session.id, role: "assistant", content: "answer", createdAt: new Date(now.getTime() + 1).toISOString() },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        messageId: `${session.id}-0`,
        expectedContent: "content no longer present in this session",
      },
    });

    expect(response.statusCode).toBe(409);
    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    expect(remaining.map((row) => row.id)).toEqual(["m1", "m2"]);

    await app.close();
  });

  it("deletes persisted rows from the selected user message, not from the visible index", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      { id: "m2", sessionId: session.id, role: "assistant", content: "used a tool", createdAt: at(2) },
      { id: "m3", sessionId: session.id, role: "tool", content: "{\"ok\":true}", createdAt: at(3) },
      { id: "m4", sessionId: session.id, role: "user", content: "second", createdAt: at(4) },
      { id: "m5", sessionId: session.id, role: "assistant", content: "answer", createdAt: at(5) },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageId: `${session.id}-2` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "used a tool" },
      ],
    });

    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    expect(remaining.map((row) => row.id)).toEqual(["m1", "m2", "m3"]);

    await app.close();
  });

  it("deletes the edited user message and trailing turns from DB via messageFromEnd", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user2", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session 2" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    // Production layout: tool messages live only in memory (not persisted), so
    // the DB holds only user + assistant rows.
    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      { id: "m2", sessionId: session.id, role: "assistant", content: "used a tool", createdAt: at(2) },
      { id: "m3", sessionId: session.id, role: "user", content: "second", createdAt: at(4) },
      { id: "m4", sessionId: session.id, role: "assistant", content: "answer", createdAt: at(5) },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    // Restart from the SECOND user message ("second"), addressed by
    // messageFromEnd (the way the frontend locates it after a completed turn).
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageFromEnd: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "used a tool" },
      ],
    });

    // The edited user message ("second") and its answer must be gone from the DB
    // so they don't reappear on the next snapshot reload.
    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    expect(remaining.map((row) => row.id)).toEqual(["m1", "m2"]);

    await app.close();
  });

  it("re-anchors on expectedContent when messageFromEnd points at the wrong (but valid) user message", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user3", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session 3" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      { id: "m2", sessionId: session.id, role: "assistant", content: "a1", createdAt: at(2) },
      { id: "m3", sessionId: session.id, role: "user", content: "second", createdAt: at(3) },
      { id: "m4", sessionId: session.id, role: "assistant", content: "a2", createdAt: at(4) },
      { id: "m5", sessionId: session.id, role: "user", content: "third", createdAt: at(5) },
      { id: "m6", sessionId: session.id, role: "assistant", content: "a3", createdAt: at(6) },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    // Simulates a client whose local message list is behind the server by one
    // full turn (e.g. a turn landed via another tab/background reconnect).
    // Its computed messageFromEnd for "second" (1) resolves, against the
    // server's true history, to a different valid user message ("third")
    // rather than triggering the role-mismatch fallback. Without content
    // verification this would truncate the wrong turn and leave "second"
    // and its answer behind as stale, duplicate-looking messages once the
    // client resends "second" as a new turn.
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageFromEnd: 1, expectedContent: "second" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "a1" },
      ],
    });

    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    expect(remaining.map((row) => row.id)).toEqual(["m1", "m2"]);

    await app.close();
  });
});
