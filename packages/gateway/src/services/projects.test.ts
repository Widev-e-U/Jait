import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { UserService } from "./users.js";
import { ProjectService } from "./projects.js";
import { SessionService } from "./sessions.js";

describe("ProjectService", () => {
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let projects: ProjectService;
  let sessions: SessionService;
  let users: UserService;
  let userId: string;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  });

  afterEach(() => {
    sqlite.close();
  });

  it("reuses a remote Windows project when an agent requests the same root as gateway", () => {
    const remote = projects.create({
      userId,
      rootPath: "E:\\TizenAnilabStream",
      nodeId: "electron-windows",
    });

    const resolved = projects.getOrCreateForRoot({
      userId,
      rootPath: "e:/tizenanilabstream/",
      nodeId: "gateway",
    });

    expect(resolved.id).toBe(remote.id);
    expect(projects.list("active", userId)).toHaveLength(1);
    expect(resolved.nodeId).toBe("electron-windows");
  });

  it("keeps the same path separate on two explicit remote nodes", () => {
    const first = projects.getOrCreateForRoot({ userId, rootPath: "/workspace/app", nodeId: "node-a" });
    const second = projects.getOrCreateForRoot({ userId, rootPath: "/workspace/app", nodeId: "node-b" });

    expect(second.id).not.toBe(first.id);
    expect(projects.list("active", userId)).toHaveLength(2);
  });

  it("searches every active project and chat while preserving user boundaries", () => {
    const matchingProject = projects.create({ userId, title: "Desktop reliability", rootPath: "/workspace/desktop" });
    const otherProject = projects.create({ userId, title: "Gateway", rootPath: "/workspace/gateway" });
    sessions.create({ userId, projectId: matchingProject.id, name: "Investigate gray window" });
    sessions.create({ userId, projectId: otherProject.id, name: "Improve global chat search" });
    sessions.create({ userId, name: "Personal gray-screen notes" });

    const otherUserId = users.createUser("other-owner", "password123").id;
    const privateProject = projects.create({ userId: otherUserId, title: "Gray private project" });
    sessions.create({ userId: otherUserId, projectId: privateProject.id, name: "Gray private chat" });

    const grayResults = projects.searchWithSessions(userId, "gray");
    expect(grayResults.projects.map((project) => project.id)).toEqual([matchingProject.id]);
    expect(grayResults.projects[0]?.sessions.map((session) => session.name)).toEqual(["Investigate gray window"]);
    expect(grayResults.personalSessions.map((session) => session.name)).toEqual(["Personal gray-screen notes"]);

    const olderChatResults = projects.searchWithSessions(userId, "global chat search");
    expect(olderChatResults.projects.map((project) => project.id)).toEqual([otherProject.id]);
    expect(olderChatResults.projects[0]?.sessions.map((session) => session.name)).toEqual(["Improve global chat search"]);
  });
});
