/**
 * Tests for session-sql.ts — read-only SQL over the session store.
 *
 * Uses an in-memory database with the real migrations, then inserts fixture
 * rows directly through the raw sqlite handle (no higher-level helpers) so
 * the tests exercise exactly the SQL surface the tool exposes.
 */
import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { SessionSqlService } from "./session-sql.js";
import { createSessionSqlTool } from "../tools/session-sql-tools.js";
import { ToolName } from "../tools/tool-names.js";

let sqlite: SqliteDatabase | undefined;

async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}

/** Assert a query/tool result is a rejection of the given error class. */
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBe(expectedError);
  expect(result.message).toMatch(/Refused|required|not allowed|single/i);
}

function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}

describe("SessionSqlService", () => {
  describe("allowed queries", () => {
    it("runs a SELECT and returns objects keyed by column name", async () => {
      const service = await setup();
      const result = service.query({ sql: "SELECT id, role, content FROM messages ORDER BY id LIMIT 10" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.columns).toEqual(["id", "role", "content"]);
      expect(data.rowCount).toBe(4);
      expect(data.truncated).toBe(false);
      expect(data.rows[0]).toEqual({ id: "m-1", role: "user", content: "fix the flaky test" });
      // First call includes the queryable table list; blocked/internal tables excluded.
      expect(data.tables).toContain("messages");
      expect(data.tables).toContain("sessions");
      expect(data.tables).not.toContain("user_secrets");
      expect(data.tables).not.toContain("users");
      expect(data.tables).not.toContain("_migrations");
    });

    it("runs a WITH (CTE) query", async () => {
      const service = await setup();
      const result = service.query({
        sql: "WITH recent AS (SELECT * FROM messages WHERE created_at >= '2026-02-01') SELECT COUNT(*) AS n FROM recent",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rows[0]).toEqual({ n: 3 });
    });

    it("supports GROUP BY over timestamps and joins sessions↔agent_threads", async () => {
      const service = await setup();
      const byDay = service.query({
        sql: "SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM messages GROUP BY d ORDER BY d DESC LIMIT 14",
      });
      expect(byDay.ok).toBe(true);
      if (!byDay.ok) return;
      const dayData = byDay.data;
      if (!("rows" in dayData)) throw new Error("expected query result");
      expect(dayData.rows).toEqual([
        { d: "2026-02-11", n: 1 },
        { d: "2026-02-10", n: 2 },
        { d: "2026-01-20", n: 1 },
      ]);

      const joined = service.query({
        sql: "SELECT s.id, COUNT(t.id) AS threads FROM sessions s LEFT JOIN agent_threads t ON t.session_id = s.id GROUP BY s.id ORDER BY s.id",
      });
      expect(joined.ok).toBe(true);
      if (!joined.ok) return;
      const joinData = joined.data;
      if (!("rows" in joinData)) throw new Error("expected query result");
      expect(joinData.rows).toEqual([
        { id: "sess-a", threads: 1 },
        { id: "sess-b", threads: 1 },
        { id: "sess-c", threads: 0 },
      ]);
    });

    it("emits the tables list only on the first call", async () => {
      const service = await setup();
      const first = service.query({ sql: "SELECT COUNT(*) AS n FROM sessions" });
      const second = service.query({ sql: "SELECT COUNT(*) AS n FROM sessions" });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      const firstData = first.data;
      const secondData = second.data;
      if (!("rows" in firstData) || !("rows" in secondData)) throw new Error("expected query results");
      expect(firstData.tables).toBeDefined();
      expect(secondData.tables).toBeUndefined();
    });

    it("allows comments and keywords inside string literals", async () => {
      const service = await setup();
      const commented = service.query({
        sql: "-- pick everything\n/* still one statement */\nSELECT id FROM sessions WHERE name != 'drop table users' LIMIT 5;",
      });
      expect(commented.ok).toBe(true);
      if (!commented.ok) return;
      const data = commented.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rowCount).toBe(3);
    });
  });

  describe("read-only enforcement", () => {
    const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];

    for (const [label, sql, expectedError] of rejectionCases) {
      it(`rejects: ${label}`, async () => {
        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      });
    }

    it("rejects an empty / comment-only statement", async () => {
      const service = await setup();
      expectError(service.query({ sql: "" }), "invalid_sql");
      expectError(service.query({ sql: "   \n\t " }), "invalid_sql");
      expectError(service.query({ sql: "-- nothing here\n/* or here */" }), "invalid_sql");
    });

    it("rejects non-SQL and non-SELECT first tokens", async () => {
      const service = await setup();
      const prose = service.query({ sql: "hello world" });
      expect(prose.ok).toBe(false);
      if (!prose.ok) expect(prose.error).toBe("readonly_violation");
      const explain = service.query({ sql: "EXPLAIN SELECT 1" });
      expect(explain.ok).toBe(false);
    });

    it("rejects multi-statement input including trailing junk after a semicolon", async () => {
      const service = await setup();
      expectError(service.query({ sql: "SELECT 1; SELECT 2" }), "multi_statement");
      expectError(service.query({ sql: "SELECT 1; DROP TABLE messages" }), "multi_statement");
      // A single trailing semicolon is fine — even with trailing whitespace.
      expect(service.query({ sql: "SELECT 1;" }).ok).toBe(true);
      expect(service.query({ sql: "SELECT 1; \n\t " }).ok).toBe(true);
    });

    it("rejects pragma_* table-valued functions even inside UNION", async () => {
      const service = await setup();
      // Keyword as a bare word inside the statement body is still caught.
      const sneaky = service.query({ sql: "SELECT * FROM sessions WHERE status = 'active' UNION SELECT 1, 2, 3, 4, 5, 6, 7, 8 FROM pragma_user_settings" });
      expect(sneaky.ok).toBe(false);
    });

    it("blocks secret/credential tables everywhere they appear", async () => {
      const service = await setup();
      const queries = [
        "SELECT * FROM user_secrets",
        "SELECT key FROM user_secrets WHERE id = 'sec-1'",
        "SELECT id FROM users",
        "SELECT * FROM user_settings",
        "SELECT s.id FROM sessions s JOIN user_secrets u ON u.user_id = s.user_id",
        "SELECT (SELECT COUNT(*) FROM user_secrets) AS leaked",
        'SELECT * FROM "user_secrets"',
        "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c",
        "SELECT * FROM automation_repositories",
        "SELECT * FROM mobile_push_registrations",
      ];
      for (const sql of queries) {
        const result = service.query({ sql });
        expect(result.ok, sql).toBe(false);
        if (!result.ok) expect(result.error).toBe("blocked_table");
      }
    });

    it("allows consent_log which holds only consent metadata", async () => {
      const service = await setup();
      const result = service.query({ sql: "SELECT COUNT(*) AS n FROM consent_log" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rows[0]).toEqual({ n: 0 });
    });
  });

  describe("row caps and truncation", () => {
    it("truncates to the default cap of 200 rows", async () => {
      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM audit_log ORDER BY id" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rowCount).toBe(200);
      expect(data.truncated).toBe(true);
      expect(data.rows).toHaveLength(200);
    });

    it("honors a caller-provided lower max_rows", async () => {
      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM audit_log ORDER BY id", maxRows: 5 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rowCount).toBe(5);
      expect(data.truncated).toBe(true);
      expect(data.rows[0]).toEqual({ id: "audit-0" });
    });

    it("cannot raise max_rows above the absolute cap", async () => {
      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM audit_log ORDER BY id", maxRows: 10000 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rowCount).toBe(200);
      expect(data.truncated).toBe(true);
    });

    it("clamps an oversized LIMIT and reports no truncation under it", async () => {
      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM messages LIMIT 500000" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rowCount).toBe(4);
      expect(data.truncated).toBe(false);
    });

    it("reports no truncation when results fit", async () => {
      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM messages", maxRows: 10 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      expect(data.rowCount).toBe(4);
      expect(data.truncated).toBe(false);
    });
  });

  describe("schema mode", () => {
    it("returns a compact table → columns summary with typed columns", async () => {
      const service = await setup();
      const result = service.schema();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data;
      if (!("tables" in data)) throw new Error("expected schema summary");
      const byName = new Map(data.tables.map((table) => [table.table, table]));
      const sessions = byName.get("sessions");
      expect(sessions).toBeDefined();
      expect(sessions?.columns.map((column) => column.name)).toEqual([
        "id",
        "user_id",
        "name",
        "project_path",
        "created_at",
        "last_active_at",
        "status",
        "metadata",
        "project_id",
        "viewed_at",
      ]);
      expect(sessions?.columns.find((column) => column.name === "created_at")?.type).toBe("TEXT");
      // Blocked tables are named but not described.
      expect(data.blockedTables).toContain("user_secrets");
      expect(data.blockedTables).toContain("users");
      expect(data.tables.find((table) => table.table === "user_secrets")).toBeUndefined();
      expect(data.tables.find((table) => table.table === "_migrations")).toBeUndefined();
    });

    it("returns an error result on a broken database", async () => {
      const service = new SessionSqlService({
        exec: () => {},
        close: () => {},
        transaction: () => ({}) as never,
        prepare: () => {
          throw new Error("boom");
        },
      } as never);
      const result = service.schema();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("schema_error");
    });
  });

  describe("tool wrapper", () => {
    it("exposes session.sql and routes schema mode", async () => {
      const service = await setup();
      const tool = createSessionSqlTool(service);
      expect(tool.name).toBe(ToolName.SessionSql);
      expect(tool.name).toBe("session.sql");

      const schemaResult = await tool.execute({ mode: "schema" }, undefined as never);
      expect(schemaResult.ok).toBe(true);
      const schemaData = schemaResult.data as { tables?: unknown[] };
      expect(Array.isArray(schemaData.tables)).toBe(true);
    });

    it("requires sql or mode=schema", async () => {
      const service = await setup();
      const tool = createSessionSqlTool(service);
      const result = await tool.execute({}, undefined as never);
      expect(result.ok).toBe(false);
      expect(result.data).toEqual({ error: "invalid_input" });
    });

    it("formats successful queries with a row-count message", async () => {
      const service = await setup();
      const tool = createSessionSqlTool(service);
      const result = await tool.execute({ sql: "SELECT id FROM messages" }, undefined as never);
      expect(result.ok).toBe(true);
      expect(result.message).toContain("4 row(s)");
      const data = result.data as { truncated?: boolean };
      expect(data.truncated).toBe(false);
    });

    it("passes rejection errors through with their class", async () => {
      const service = await setup();
      const tool = createSessionSqlTool(service);
      const mutation = await tool.execute({ sql: "DELETE FROM messages" }, undefined as never);
      expect(mutation.ok).toBe(false);
      expect(mutation.data).toEqual({ error: "readonly_violation" });

      const blocked = await tool.execute({ sql: "SELECT * FROM user_secrets" }, undefined as never);
      expect(blocked.ok).toBe(false);
      expect(blocked.data).toEqual({ error: "blocked_table" });
    });
  });
});