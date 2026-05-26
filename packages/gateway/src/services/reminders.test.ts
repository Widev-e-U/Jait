import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrateDatabase, openDatabase, type JaitDB } from "../db/connection.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { messages, reminders, sessions } from "../db/schema.js";
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

  it("tracks retrieval usage and exports editable memory as markdown", () => {
    const service = new ReminderService(db);
    const created = service.create({
      userId: "user-1",
      projectId: "project-1",
      content: "Use icon-only controls for compact todo metadata",
      sourceType: "user",
      sourceId: "session-1",
      sourceSurface: "web",
      tags: ["todo", "ui"],
    });

    expect(created.usageCount).toBe(0);
    expect(created.lastRetrievedAt).toBeNull();
    expect(service.markRetrieved([created.id], "user-1")).toBe(1);

    const retrieved = service.getById(created.id, "user-1");
    expect(retrieved?.usageCount).toBe(1);
    expect(retrieved?.lastRetrievedAt).toBeTruthy();

    const markdown = service.exportMarkdown({ userId: "user-1" });
    expect(markdown).toContain("# Memory Export");
    expect(markdown).toContain("Use icon-only controls for compact todo metadata");
    expect(markdown).toContain("usage=1");
    expect(markdown).toContain("tags=todo,ui");
  });

  it("scans old chats for durable memory candidates", () => {
    const service = new ReminderService(db);
    db.insert(sessions).values({
      id: "session-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Chat",
      createdAt: "2026-05-23T00:00:00.000Z",
      lastActiveAt: "2026-05-23T00:00:00.000Z",
    }).run();
    db.insert(messages).values({
      id: "message-1",
      sessionId: "session-1",
      role: "user",
      content: "Remember that this project prefers slim todo controls.",
      createdAt: "2026-05-23T00:01:00.000Z",
    }).run();

    expect(service.scanOldChatsForMemory("user-1")).toEqual({ scanned: 1, created: 1 });
    const [created] = service.list({ userId: "user-1", status: "active" });
    expect(created).toMatchObject({
      projectId: "project-1",
      sessionId: "session-1",
      sourceType: "background_memory_scan",
      sourceId: "message-1",
    });
    expect(service.scanOldChatsForMemory("user-1")).toEqual({ scanned: 1, created: 0 });
  });

  it("archives stale generated memories and flags likely conflicts", () => {
    const service = new ReminderService(db);
    const stale = service.create({
      userId: "user-1",
      content: "Old generated note",
      sourceType: "background_memory_scan",
      tags: ["old"],
    });
    db.update(reminders).set({
      updatedAt: "2025-01-01T00:00:00.000Z",
    }).where(eq(reminders.id, stale.id)).run();
    service.create({ userId: "user-1", content: "Use compact todo controls", tags: ["todo"] });
    service.create({ userId: "user-1", content: "Do not use compact todo controls", tags: ["todo"] });

    const result = service.runHygiene("user-1");
    expect(result.archived).toBe(1);
    expect(result.flagged).toBeGreaterThanOrEqual(2);
    expect(service.getById(stale.id, "user-1")?.status).toBe("archived");
    const active = service.list({ userId: "user-1", status: "active" });
    expect(active.some((row) => row.tags.includes("review:conflict"))).toBe(true);
  });
});
