/**
 * Migration 53 against a database that predates it.
 *
 * The folder feature must be a pure addition: someone updating with projects
 * and chats already in place has to find all of them afterwards, unchanged and
 * at the top level. This rebuilds a v52-shaped `projects` table, fills it the
 * way the old code did, and runs the real migration over it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase, type SqliteDatabase } from "./connection.js";
import { ProjectService } from "../services/projects.js";

const LEGACY_COLUMNS = ["parent_id", "instructions", "description", "color", "kind"] as const;

describe("migration 53 — project folders", () => {
  let sqlite: SqliteDatabase;
  let db: Awaited<ReturnType<typeof openDatabase>>["db"];

  /** Undo migration 53 so it can be replayed over legacy-shaped data. */
  function rewindToV52() {
    // The index refers to parent_id, so it has to go before the column can.
    sqlite.exec("DROP INDEX IF EXISTS idx_projects_parent");
    for (const column of LEGACY_COLUMNS) {
      sqlite.exec(`ALTER TABLE projects DROP COLUMN ${column}`);
    }
    sqlite.exec("DELETE FROM _migrations WHERE id = 53");
  }

  function insertLegacyProject(id: string, title: string, rootPath: string | null) {
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO projects (id, user_id, title, root_path, node_id, created_at, last_active_at, status, metadata)
         VALUES (?, ?, ?, ?, 'gateway', ?, ?, 'active', ?)`,
      )
      .run(id, "user-1", title, rootPath, now, now, JSON.stringify({ repositoryId: "repo-1" }));
  }

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    rewindToV52();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("keeps existing projects intact and puts them at the top level", () => {
    insertLegacyProject("p-1", "jait", "/home/me/projects/jait");
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sessions (id, user_id, project_id, name, status, created_at, last_active_at)
         VALUES ('s-1', 'user-1', 'p-1', 'Old chat', 'active', ?, ?)`,
      )
      .run(now, now);

    migrateDatabase(sqlite);

    const row = sqlite
      .prepare("SELECT id, title, root_path, node_id, status, metadata, parent_id, kind FROM projects WHERE id = 'p-1'")
      .get() as Record<string, unknown>;

    expect(row["title"]).toBe("jait");
    expect(row["root_path"]).toBe("/home/me/projects/jait");
    expect(row["node_id"]).toBe("gateway");
    expect(row["status"]).toBe("active");
    // The attached repository must survive too — it lives in metadata.
    expect(row["metadata"]).toContain("repo-1");
    // Nothing to nest it under yet, so it stays where the user left it.
    expect(row["parent_id"]).toBeNull();
    expect(row["kind"]).toBe("workspace");

    const listed = new ProjectService(db).listWithSessions("user-1");
    expect(listed.projects.map((p) => p.id)).toEqual(["p-1"]);
    expect(listed.projects[0]?.sessions.map((s) => s.name)).toEqual(["Old chat"]);
  });

  it("labels a legacy project that never had a path as a folder", () => {
    // getOrCreateForRoot always allowed a project with no rootPath, so these
    // exist in the wild. The column default would brand them workspaces and the
    // UI would offer "Project settings" for something that owns no directory.
    insertLegacyProject("p-2", "Loose chats", null);

    migrateDatabase(sqlite);

    const row = sqlite.prepare("SELECT kind, root_path FROM projects WHERE id = 'p-2'").get() as Record<string, unknown>;
    expect(row["kind"]).toBe("folder");
    expect(row["root_path"]).toBeNull();
  });

  it("is safe to run twice", () => {
    insertLegacyProject("p-3", "jait", "/home/me/projects/jait");

    migrateDatabase(sqlite);
    expect(() => migrateDatabase(sqlite)).not.toThrow();

    expect(sqlite.prepare("SELECT COUNT(*) n FROM projects").get()).toEqual({ n: 1 });
  });
});
