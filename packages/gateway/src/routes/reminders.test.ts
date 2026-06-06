import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { MemoryEngine } from "../memory/service.js";
import { SqliteMemoryBackend } from "../memory/sqlite-backend.js";
import { ReminderService } from "../services/reminders.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};

describe("reminder routes memory page integration", () => {
  it("lists and deletes semantic MemoryEngine entries through the Memory page API", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const reminderService = new ReminderService(db);
    const memoryService = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });
    const user = userService.createUser("memory-page-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Memory Page Session" });
    const memory = await memoryService.save({
      scope: "project",
      content: "Shared contracts live in packages/shared.",
      source: { type: "chat", id: session.id, surface: "chat" },
    });

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      reminderService,
      memoryService,
    });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/reminders?status=active",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().reminders).toContainEqual(expect.objectContaining({
      id: memory.id,
      kind: "engine",
      content: "Shared contracts live in packages/shared.",
      status: "active",
      sourceType: "chat",
      sourceId: session.id,
      sourceSurface: "chat",
    }));

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/reminders/${memory.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(200);
    await expect(memoryService.list()).resolves.toEqual([]);

    await app.close();
  });
});
