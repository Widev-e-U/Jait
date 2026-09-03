import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";
import { __chatTestUtils } from "./chat.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

describe("question chat forks", () => {
  it("freezes the parent transcript and captures live assistant progress", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("fork-owner", "password123");
    const source = sessionService.create({
      userId: user.id,
      projectId: "project-1",
      projectPath: "/repo/jait",
      name: "Implement feature",
      metadata: { chat: { provider: "codex", model: "gpt-5" } },
    });
    const createdAt = (index: number) =>
      new Date(Date.UTC(2025, 8, 3, 10, 0, index)).toISOString();

    db.insert(messages).values([
      {
        id: "fork-user-1",
        sessionId: source.id,
        role: "user",
        content: "Implement the feature",
        createdAt: createdAt(0),
      },
      {
        id: "fork-assistant-1",
        sessionId: source.id,
        role: "assistant",
        content: "I will inspect the code.",
        createdAt: createdAt(1),
      },
      {
        id: "fork-user-2",
        sessionId: source.id,
        role: "user",
        content: "Also keep it read-only.",
        createdAt: createdAt(2),
      },
      {
        id: "fork-assistant-checkpoint",
        sessionId: source.id,
        role: "assistant",
        content: "stale checkpoint",
        createdAt: createdAt(3),
      },
    ]).run();

    __chatTestUtils.activeStreams.add(source.id);
    const accumulator = __chatTestUtils.getOrCreateAccumulator(source.id);
    accumulator.content = "Live progress from the running parent";
    accumulator.thinking = "Checking the session model";

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });
    const token = await signAuthToken(
      { id: user.id, username: user.username },
      testConfig.jwtSecret,
    );
    const headers = { authorization: `Bearer ${token}` };

    try {
      const forkResponse = await app.inject({
        method: "POST",
        url: `/api/sessions/${source.id}/fork`,
        headers,
      });

      expect(forkResponse.statusCode).toBe(201);
      const branch = forkResponse.json() as {
        id: string;
        projectId: string | null;
        projectPath: string | null;
        metadata: string | null;
      };
      expect(branch.id).not.toBe(source.id);
      expect(branch.projectId).toBe(source.projectId);
      expect(branch.projectPath).toBe(source.projectPath);
      expect(JSON.parse(branch.metadata ?? "{}")).toMatchObject({
        chat: { provider: "codex", model: "gpt-5" },
        branch: {
          kind: "question",
          parentSessionId: source.id,
        },
      });

      const branchHistoryResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${branch.id}/messages?limit=20`,
        headers,
      });
      expect(branchHistoryResponse.statusCode).toBe(200);
      expect(branchHistoryResponse.json().messages).toMatchObject([
        { role: "user", content: "Implement the feature" },
        { role: "assistant", content: "I will inspect the code." },
        { role: "user", content: "Also keep it read-only." },
        {
          role: "system",
          content: expect.stringContaining("parent response was still running"),
          systemNotice: true,
        },
        {
          role: "assistant",
          content: "Live progress from the running parent",
          thinking: "Checking the session model",
        },
      ]);

      accumulator.content = "Parent continued after the fork";
      const frozenHistoryResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${branch.id}/messages?limit=20`,
        headers,
      });
      expect(frozenHistoryResponse.json().messages.at(-1)).toMatchObject({
        content: "Live progress from the running parent",
      });
    } finally {
      __chatTestUtils.activeStreams.delete(source.id);
      __chatTestUtils.sessionStreamingState.delete(source.id);
      __chatTestUtils.sessionHistory.delete(source.id);
      await app.close();
    }
  });

  it("does not allow a different user to fork the chat", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const owner = userService.createUser("fork-private-owner", "password123");
    const stranger = userService.createUser("fork-private-stranger", "password123");
    const source = sessionService.create({ userId: owner.id, name: "Private chat" });
    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });
    const token = await signAuthToken(
      { id: stranger.id, username: stranger.username },
      testConfig.jwtSecret,
    );

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/sessions/${source.id}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
