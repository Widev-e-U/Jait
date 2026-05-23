import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase, type JaitDB } from "../db/connection.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { ReminderService } from "./reminders.js";

let sqlite: SqliteDatabase;
let db: JaitDB;

beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
});

afterEach(() => {
  sqlite.close();
});

describe("ReminderService", () => {
  it("creates and lists active reminders by user and project", () => {
    const service = new ReminderService(db);
    const created = service.create({
      userId: "user-1",
      projectId: "project-1",
      sessionId: "session-1",
      content: "Remember the deployment note",
      tags: ["Deploy", "deploy", "Notes"],
    });

    expect(created).toMatchObject({
      userId: "user-1",
      projectId: "project-1",
      sessionId: "session-1",
      content: "Remember the deployment note",
      status: "active",
      tags: JSON.stringify(["deploy", "notes"]),
    });

    expect(service.list({ userId: "user-1", projectId: "project-1" })).toHaveLength(1);
    expect(service.list({ userId: "user-2" })).toHaveLength(0);
  });

  it("archives and deletes reminders with ownership checks", () => {
    const service = new ReminderService(db);
    const created = service.create({
      userId: "user-1",
      content: "Follow up later",
    });

    const archived = service.update(created.id, { status: "archived" }, "user-1");
    expect(archived?.status).toBe("archived");
    expect(service.list({ userId: "user-1", status: "active" })).toHaveLength(0);
    expect(service.delete(created.id, "user-2")).toBe(false);
    expect(service.delete(created.id, "user-1")).toBe(true);
  });
});
