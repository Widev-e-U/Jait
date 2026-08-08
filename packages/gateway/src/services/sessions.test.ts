import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "./sessions.js";
import { UserService } from "./users.js";

describe("SessionService.moveToProject", () => {
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
});
