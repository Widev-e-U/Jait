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
});
