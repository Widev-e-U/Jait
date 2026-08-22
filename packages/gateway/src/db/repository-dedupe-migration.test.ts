/**
 * Migration 62 against a database that already collected duplicates.
 *
 * A device registering its folders sends several POST /api/repos at once; with
 * no unique index every "does this path exist?" check passed before the first
 * insert landed, so the same repository showed up six times in the picker. The
 * cleanup has to be lossless: one row survives per path, and everything that
 * pointed at a duplicate follows it there.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase, type SqliteDatabase } from "./connection.js";
import { RepositoryService } from "../services/repositories.js";

describe("migration 62 — duplicate repositories", () => {
  let sqlite: SqliteDatabase;
  let db: Awaited<ReturnType<typeof openDatabase>>["db"];

  /** Undo migration 62 so duplicates can be inserted the way they arose. */
  function rewindToV61() {
    sqlite.exec("DROP INDEX IF EXISTS idx_automation_repos_user_path");
    sqlite.exec("DELETE FROM _migrations WHERE id = 62");
  }

  function insertRepo(id: string, userId: string | null, localPath: string, createdAt: string) {
    sqlite
      .prepare(
        `INSERT INTO automation_repositories (id, user_id, device_id, name, default_branch, local_path, created_at, updated_at)
         VALUES (?, ?, 'electron-1', 'Zinsrechner', 'main', ?, ?, ?)`,
      )
      .run(id, userId, localPath, createdAt, createdAt);
  }

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    rewindToV61();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("keeps the oldest row per path and drops the rest", () => {
    insertRepo("repo-a", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.912Z");
    insertRepo("repo-b", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.930Z");
    insertRepo("repo-c", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:27.002Z");
    // A different user's copy of the same path is a separate repository.
    insertRepo("repo-other", "user-2", "E:\\Zinsrechner", "2026-07-22T07:13:27.010Z");

    migrateDatabase(sqlite);

    const ids = (sqlite.prepare("SELECT id FROM automation_repositories ORDER BY id").all() as { id: string }[])
      .map((row) => row.id);
    expect(ids).toEqual(["repo-a", "repo-other"]);
  });

  it("repoints plans, proposals and projects at the surviving row", () => {
    insertRepo("repo-a", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.912Z");
    insertRepo("repo-b", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.930Z");
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO automation_plans (id, repo_id, user_id, title, status, created_at, updated_at)
         VALUES ('plan-1', 'repo-b', 'user-1', 'Ship it', 'draft', ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO projects (id, user_id, title, root_path, node_id, created_at, last_active_at, status, metadata, kind)
         VALUES ('p-1', 'user-1', 'Zinsrechner', 'E:\\Zinsrechner', 'gateway', ?, ?, 'active', ?, 'workspace')`,
      )
      .run(now, now, JSON.stringify({ repositoryId: "repo-b", color: "blue" }));

    migrateDatabase(sqlite);

    expect(sqlite.prepare("SELECT repo_id FROM automation_plans WHERE id = 'plan-1'").get())
      .toEqual({ repo_id: "repo-a" });
    const metadata = JSON.parse(
      (sqlite.prepare("SELECT metadata FROM projects WHERE id = 'p-1'").get() as { metadata: string }).metadata,
    ) as Record<string, unknown>;
    expect(metadata["repositoryId"]).toBe("repo-a");
    // Unrelated metadata must survive the rewrite.
    expect(metadata["color"]).toBe("blue");
  });

  it("collapses duplicates that have no user id", () => {
    insertRepo("repo-a", null, "/srv/app", "2026-07-22T07:13:26.912Z");
    insertRepo("repo-b", null, "/srv/app", "2026-07-22T07:13:26.930Z");

    migrateDatabase(sqlite);

    expect(sqlite.prepare("SELECT COUNT(*) n FROM automation_repositories").get()).toEqual({ n: 1 });
  });

  it("hands a racing create the row that won instead of a duplicate", () => {
    migrateDatabase(sqlite);
    const repos = new RepositoryService(db);

    const first = repos.create({ userId: "user-1", name: "Zinsrechner", localPath: "E:\\Zinsrechner" });
    // The second caller checked findByPath before the first insert landed.
    const second = repos.create({ userId: "user-1", name: "Zinsrechner", localPath: "E:\\Zinsrechner" });

    expect(second.id).toBe(first.id);
    expect(repos.list("user-1")).toHaveLength(1);
  });
});
