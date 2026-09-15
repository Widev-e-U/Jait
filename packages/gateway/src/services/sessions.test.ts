import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "./sessions.js";
import { UserService } from "./users.js";

describe("SessionService", () => {
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let sessions: SessionService;
  let userId: string;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  });

  afterEach(() => {
    sqlite.close();
  });

  it("acknowledges only observed activity and keeps later replies unread", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
      const session = sessions.create({ userId });
      const observedAt = session.lastActiveAt;
      vi.setSystemTime(new Date("2026-09-13T10:01:00.000Z"));
      sessions.touch(session.id);
      sessions.markViewed(session.id, userId, observedAt);
      expect(sessions.getById(session.id)?.viewedAt).toBe(observedAt);
      expect(sessions.getById(session.id)?.lastActiveAt).toBe("2026-09-13T10:01:00.000Z");
      sessions.markViewed(session.id, userId, "2026-09-13T10:01:00.000Z");
      sessions.markViewed(session.id, userId, observedAt);
      expect(sessions.getById(session.id)?.viewedAt).toBe("2026-09-13T10:01:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("files a personal chat into a project and adopts the project root", () => {
    const session = sessions.create({ userId, name: "Personal chat" });
    expect(session.projectId).toBeNull();

    const moved = sessions.moveToProject(session.id, "project-1", "/repo/jait", userId);

    expect(moved?.projectId).toBe("project-1");
    expect(moved?.projectPath).toBe("/repo/jait");
  });

  it("clears projectId and projectPath when moving back to personal chats", () => {
    const session = sessions.create({
      userId,
      projectId: "project-1",
      projectPath: "/repo/jait",
      name: "Project chat",
    });

    const moved = sessions.moveToProject(session.id, null, null, userId);

    expect(moved?.projectId).toBeNull();
    // A stale projectPath would keep pointing the chat at the folder of the
    // project it just left, since tool execution falls back to it.
    expect(moved?.projectPath).toBeNull();
  });

  it("leaves name and metadata untouched while moving", () => {
    const session = sessions.create({
      userId,
      name: "Keep my name",
      metadata: { chat: { provider: "anthropic" } },
    });

    const moved = sessions.moveToProject(session.id, "project-2", "/repo/other", userId);

    expect(moved?.name).toBe("Keep my name");
    expect(JSON.parse(moved?.metadata ?? "{}")).toEqual({ chat: { provider: "anthropic" } });
  });

  it("does not move a session owned by a different user", () => {
    const session = sessions.create({ userId, name: "Mine" });

    sessions.moveToProject(session.id, "project-1", "/repo/jait", "someone-else");

    expect(sessions.getById(session.id)?.projectId).toBeNull();
  });

  it("records a failed last reply without dropping chat selection metadata", () => {
    const session = sessions.create({
      userId,
      metadata: { chat: { provider: "anthropic", model: "claude-sonnet-4-5" } },
    });

    sessions.updateChatError(session.id, "Provider request failed with status 429", userId);

    const chat = JSON.parse(sessions.getById(session.id, userId)?.metadata ?? "{}").chat;
    expect(chat.provider).toBe("anthropic");
    expect(chat.model).toBe("claude-sonnet-4-5");
    expect(chat.lastError).toBe("Provider request failed with status 429");
    expect(typeof chat.lastErrorAt).toBe("string");
  });

  it("clears the failed-reply marker once a turn succeeds", () => {
    const session = sessions.create({ userId });
    sessions.updateChatError(session.id, "boom", userId);

    sessions.updateChatError(session.id, null, userId);

    const chat = JSON.parse(sessions.getById(session.id, userId)?.metadata ?? "{}").chat;
    expect(chat.lastError).toBeUndefined();
    expect(chat.lastErrorAt).toBeUndefined();
  });

  it("does not flag a session owned by a different user", () => {
    const session = sessions.create({ userId });

    sessions.updateChatError(session.id, "boom", "someone-else");

    const metadata = sessions.getById(session.id, userId)?.metadata ?? "";
    expect(metadata.includes("lastError")).toBe(false);
  });
});
