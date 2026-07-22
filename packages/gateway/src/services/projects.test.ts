import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { UserService } from "./users.js";
import { ProjectService } from "./projects.js";

describe("ProjectService", () => {
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let projects: ProjectService;
  let userId: string;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    userId = new UserService(opened.db).createUser("project-owner", "password123").id;
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
});
