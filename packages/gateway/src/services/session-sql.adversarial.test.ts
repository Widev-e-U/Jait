/**
 * ADVERSARIAL tests for session-sql.ts — independent probe suite.
 *
 * Unlike session-sql.test.ts (which verifies intended behavior), this file
 * actively hunts for bypasses of the read-only contract: data-modifying CTEs,
 * quoted/case/schema-qualified blocked tables, comment & string camouflage,
 * multi-statement tricks, first-token tricks, LIMIT-clamping edges, schema
 * listing leaks, and tool-wrapper input robustness.
 *
 * Engine facts verified against node:sqlite (Node 22) up front:
 * - Data-modifying CTEs (`WITH x AS (DELETE … RETURNING *) SELECT …`) DO
 *   execute and mutate — service-level refusal is the only protection.
 * - Quoted/bracketed/backticked identifiers ARE valid table references.
 * - `load_extension` is natively "not authorized"; `writefile`/`readfile`
 *   do not exist in this build (still asserted refused/absent).
 */
import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { SessionSqlService } from "./session-sql.js";
import { createSessionSqlTool } from "../tools/session-sql-tools.js";
import type { SessionSqlToolInput } from "../tools/session-sql-tools.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/contracts.js";
import { ToolName } from "../tools/tool-names.js";

let sqlite: SqliteDatabase | undefined;

async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}

/** Fresh service per test so `tablesSent` state never leaks between tests. */
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}

function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}

type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };

/** Assert a service result is refused for the given reason class. */
function refused(result: AnyResult, error: string): void {
  expect(result.ok, `expected refusal (${error}), got: ${JSON.stringify(result).slice(0, 300)}`).toBe(false);
  if (result.ok) return;
  expect(result.error).toBe(error);
  expect(result.message).toMatch(/Refused|required|not allowed|single|Input validation/i);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Data-modifying CTEs — the sharpest bypass class. node:sqlite DOES execute
//    `WITH x AS (DELETE … RETURNING *) SELECT …`, so the service must refuse
//    based on the mutation keyword anywhere in the statement.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: data-modifying CTEs", () => {
  const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

  it("refuses DELETE inside a CTE body (before execution — rows must survive)", async () => {
    const svc = await service();
    const before = messageCount();
    const result = svc.query({ sql: "WITH x AS (DELETE FROM messages RETURNING *) SELECT * FROM x" });
    refused(result, "readonly_violation");
    expect(messageCount(), "messages table must be untouched").toBe(before);
  });

  it("refuses DELETE-in-CTE even when a trailing LIMIT clamps it", async () => {
    const svc = await service();
    const result = svc.query({ sql: "WITH x AS (DELETE FROM messages RETURNING id) SELECT * FROM x LIMIT 5" });
    refused(result, "readonly_violation");
  });

  it("refuses INSERT inside a CTE body", async () => {
    const svc = await service();
    const result = svc.query({
      sql: "WITH x AS (INSERT INTO messages (id, session_id, role, content, created_at) VALUES ('adv-i', 'sess-a', 'user', 'pwned', '2026-01-01T00:00:00.000Z') RETURNING id) SELECT * FROM x",
    });
    refused(result, "readonly_violation");
  });

  it("refuses UPDATE inside a CTE body", async () => {
    const svc = await service();
    const result = svc.query({ sql: "WITH x AS (UPDATE messages SET content = 'pwned' RETURNING id) SELECT * FROM x" });
    refused(result, "readonly_violation");
  });

  it("refuses mutation CTE as the SECOND arm of a WITH list", async () => {
    const svc = await service();
    const result = svc.query({
      sql: "WITH a AS (SELECT 1 AS v), b AS (DELETE FROM messages) SELECT v FROM a",
    });
    refused(result, "readonly_violation");
  });

  it("refuses WITH…DELETE as a top-level statement shape", async () => {
    const svc = await service();
    const result = svc.query({ sql: "WITH x AS (SELECT 1) DELETE FROM messages" });
    refused(result, "readonly_violation");
  });

  it("refuses a mutation CTE split across a comment boundary", async () => {
    const svc = await service();
    const result = svc.query({
      sql: "WITH x AS (SELECT 1 /*)*/ ) DELETE FROM messages SELECT 1",
    });
    refused(result, "readonly_violation");
  });

  it("refuses mutation keywords hidden after an unterminated line comment at EOF", async () => {
    const svc = await service();
    // The keyword scan sees the live `DELETE FROM messages` tail even though a
    // naive lexer might treat it as swallowed by the `--` (there is no newline
    // at EOF, so the engine would also treat the tail as a comment — refusing
    // is the safe direction either way).
    const result = svc.query({ sql: "SELECT 1 --;\nDELETE FROM messages" });
    refused(result, "readonly_violation");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Quoted / bracketed / case / schema-qualified blocked tables. node:sqlite
//    accepts ALL of these as references to the real table.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: blocked-table name obfuscation", () => {
  const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];

  for (const [label, sql] of cases) {
    it(`refuses: ${label}`, async () => {
      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    });
  }

  it("refuses blocked table in a UNION arm", async () => {
    const svc = await service();
    refused(svc.query({ sql: "SELECT id FROM messages UNION SELECT id FROM mobile_push_registrations" }), "blocked_table");
  });

  it("refuses INSERT-target-style references and attached-name qualification", async () => {
    const svc = await service();
    refused(svc.query({ sql: "SELECT 1 FROM evil.user_secrets" }), "blocked_table");
  });

  it("a similarly-prefixed benign table name is NOT blocked and errors natively", async () => {
    const svc = await service();
    // `user_secrets_extra` shares a prefix but is a distinct table; the
    // word-boundary scan must not over-block, and the engine reports the
    // missing table.
    const result = svc.query({ sql: "SELECT * FROM user_secrets_extra" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("sql_error");
    expect(result.message).toMatch(/no such table/i);
  });

  it("a string literal containing a blocked name does NOT trigger the blocklist", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT 'user_secrets' AS literal" });
    expect(result.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Comments as camouflage. The tokenizer must stay in lockstep with the
//    SQLite lexer: keywords inside comments are harmless (allow), keywords
//    after/beside comments are live (refuse).
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: comment camouflage", () => {
  const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
  for (const sql of harmless) {
    it(`allows harmless: ${sql.slice(0, 50)}`, async () => {
      const svc = await service();
      const result = svc.query({ sql });
      expect(result.ok).toBe(true);
    });
  }

  const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
  for (const sql of hostile) {
    it(`refuses hostile: ${sql.slice(0, 50)}`, async () => {
      const svc = await service();
      const result = svc.query({ sql });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(["readonly_violation", "multi_statement", "blocked_table", "sql_error"]).toContain(result.error);
      // Must never be an *engine-executed* mutation: sql_error means SQLite
      // itself rejected the statement, which is acceptable.
      if (result.error === "sql_error") {
        expect(result.message).toMatch(/syntax error|no such/i);
      }
    });
  }

  it("nested block comments: comment ends at first `*/` (SQLite semantics) — mutation tail is refused", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT 1 /* outer /* INSERT */ INSERT */ ; DELETE FROM messages" });
    expect(result.ok).toBe(false);
  });

  it("unterminated block comment hides a keyword — allowed, and engine also treats it as comment-to-EOF", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT 1 /* DROP TABLE messages" });
    expect(result.ok).toBe(true);
  });

  it("unterminated string keeps the tokenizer aligned with the engine (refusal or clean error, never execution)", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT * FROM messages WHERE content = '; DELETE FROM messages" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["sql_error", "readonly_violation"]).toContain(result.error);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Multi-statement tricks: whitespace, NUL bytes, unicode whitespace,
//    semicolons hidden around comments/strings.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: multi-statement tricks", () => {
  const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
  for (const [label, sql] of multi) {
    it(`refuses: ${label}`, async () => {
      const svc = await service();
      const result = svc.query({ sql });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(["multi_statement", "readonly_violation"]).toContain(result.error);
    });
  }

  it("allows one trailing semicolon and unicode whitespace that JS trims", async () => {
    const svc = await service();
    expect(svc.query({ sql: "SELECT 1 AS one ;" }).ok).toBe(true);
    expect(svc.query({ sql: "\r\n\t SELECT 1 AS one" }).ok).toBe(true);
    expect(svc.query({ sql: "\u00A0SELECT 1 AS one" }).ok).toBe(true); // NBSP: JS \s trims it
  });

  it("a semicolon inside a string literal is not a statement separator", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT 'a;b' AS s, 2 AS n" });
    expect(result.ok).toBe(true);
  });

  it("statement split ONLY after a comment is still multi-statement", async () => {
    const svc = await service();
    refused(svc.query({ sql: "SELECT 1 -- intro\n; SELECT 2" }), "multi_statement");
  });

  it("comment-only and semicolon-only inputs are rejected as invalid/readonly", async () => {
    const svc = await service();
    expect(svc.query({ sql: "-- just a comment" }).error).toBe("invalid_sql");
    expect(svc.query({ sql: ";" }).error).toBe("readonly_violation");
    expect(svc.query({ sql: "/* block */" }).error).toBe("invalid_sql");
  });

  it("unicode whitespace the engine does NOT accept yields a clean sql_error (no execution)", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT\u20281 AS one" }); // U+2028 before the digit
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("sql_error");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Keyword collisions: banned SUBSTRINGS inside identifiers must be allowed;
//    real banned words / dangerous builtins must be refused or natively fail.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: keyword collisions and dangerous builtins", () => {
  const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];
  it("creates the `updated_messages` probe table (contains banned substring 'update')", async () => {
    const d = await db();
    d.exec("CREATE TABLE IF NOT EXISTS updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
    d.prepare("INSERT OR IGNORE INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  });
  for (const [label, sql] of allowed) {
    it(`allows: ${label}`, async () => {
      const svc = await service();
      const result = svc.query({ sql });
      expect(result.ok, `${label} → ${JSON.stringify(result).slice(0, 200)}`).toBe(true);
    });
  }

  it("refuses load_extension() (file/exec vector)", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT load_extension('x')" });
    expect(result.ok).toBe(false);
  });

  it("writefile()/readfile() are banned function calls → refused before execution, never a write", async () => {
    const svc = await service();
    const write = svc.query({ sql: "SELECT writefile('/tmp/jait-adversarial-pwned', 'x') AS r" });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.error).toBe("banned_function");
    const read = svc.query({ sql: "SELECT readfile('/etc/passwd') AS r" });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error).toBe("banned_function");
  });

  it("refuses pragma_* table-valued functions (schema introspection / writable pragmas)", async () => {
    const svc = await service();
    refused(svc.query({ sql: "SELECT * FROM pragma_table_info('messages')" }), "readonly_violation");
    refused(svc.query({ sql: "SELECT * FROM pragma_journal_mode" }), "readonly_violation");
    refused(svc.query({ sql: "SELECT * FROM pragma_user_version" }), "readonly_violation");
  });

  it("refuses bare PRAGMA and other non-SELECT first keywords", async () => {
    const svc = await service();
    refused(svc.query({ sql: "PRAGMA journal_mode = WAL" }), "readonly_violation");
  });

  it("REPLACE() string function is refused by the banned-anywhere list (false positive, safe direction)", async () => {
    const svc = await service();
    // KNOWN FALSE POSITIVE (reported to implementer): `replace(…)` is a legit
    // string function, but `REPLACE INTO` is a mutation. Current policy bans
    // the bare token everywhere → refuse. Safe direction; documented here.
    const result = svc.query({ sql: "SELECT replace('a-b', 'a', 'x') AS r" });
    refused(result, "readonly_violation");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. First-token tricks.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: first-token tricks", () => {
  it("refuses EXPLAIN (introspection of statement execution)", async () => {
    const svc = await service();
    refused(svc.query({ sql: "EXPLAIN SELECT * FROM messages" }), "readonly_violation");
    refused(svc.query({ sql: "EXPLAIN QUERY PLAN SELECT * FROM messages" }), "readonly_violation");
  });

  it("refuses bare VALUES (a statement the engine would happily execute)", async () => {
    const svc = await service();
    refused(svc.query({ sql: "VALUES (1), (2)" }), "readonly_violation");
  });

  it("parenthesized SELECT is allowed by the validator and either runs or errors natively (never a mutation)", async () => {
    const svc = await service();
    const result = svc.query({ sql: "(SELECT 1) UNION SELECT 2" });
    if (!result.ok) {
      // node:sqlite rejects a parenthesized compound at top level — that is a
      // native sql_error, NOT a statement-validation refusal.
      expect(result.error).toBe("sql_error");
    } else {
      expect(result.ok).toBe(true);
    }
  });

  it("allows WITH RECURSIVE (recursive CTEs are legitimate reads)", async () => {
    const svc = await service();
    const result = svc.query({
      sql: "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 5) SELECT SUM(x) AS total FROM cnt",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rows: { total: number }[] }).rows[0]?.total).toBe(15);
  });

  it("allows a leading comment before WITH", async () => {
    const svc = await service();
    const result = svc.query({ sql: "\n-- discovery\nWITH t AS (SELECT 41 AS v) SELECT v + 1 AS w FROM t" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rows: { w: number }[] }).rows[0]?.w).toBe(42);
  });

  it("refuses mutation keyword as the very first token (fast path)", async () => {
    const svc = await service();
    refused(svc.query({ sql: "DELETE FROM messages" }), "readonly_violation");
    refused(svc.query({ sql: "DROP TABLE messages" }), "readonly_violation");
    refused(svc.query({ sql: "BEGIN" }), "readonly_violation");
    refused(svc.query({ sql: "ATTACH ':memory:' AS evil" }), "readonly_violation");
    refused(svc.query({ sql: "VACUUM" }), "readonly_violation");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Row-cap / LIMIT clamping.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: row-cap and LIMIT clamping", () => {
  it("no LIMIT + 250-row table → 200 rows, truncated=true", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; columns: string[] };
    expect(data.rowCount).toBe(200);
    expect(data.truncated).toBe(true);
    expect(data.columns).toEqual(["id"]); // column names inferred from clamped SQL + first row (note: loses 'filler' — report finding)
  });

  it("existing oversized LIMIT is clamped → 200 rows, truncated=true", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big LIMIT 999999" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rowCount: number; truncated: boolean }).rowCount).toBe(200);
    expect((result.data as { truncated: boolean }).truncated).toBe(true);
  });

  it("LIMIT with OFFSET: clamped LIMIT keeps OFFSET → 196 rows, truncated=true", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 999999 OFFSET 5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    // KNOWN CLAMPING IMPRECISION (reported to implementer): appending the cap
    // yields `LIMIT 201 OFFSET 5` → 201 rows, not 196. Rows 6..205 are
    // returned (row 205 does not exist → 200 rows). Truncation is still
    // correct; only the count is off by the offset. Safe direction.
    expect(data.rowCount).toBe(200);
    expect(data.truncated).toBe(true);
    expect(data.rows[0]?.id).toBe(6); // OFFSET preserved after clamping
  });

  it("comma-form LIMIT (offset, count) is clamped as a whole and still truncates", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 5, 999999" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    expect(data.rowCount).toBe(200);
    expect(data.truncated).toBe(true);
    expect(data.rows[0]?.id).toBe(6); // comma-form offset preserved
  });

  it("exact LIMIT below the cap is left untouched → truncated=false", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean };
    expect(data.rowCount).toBe(5);
    expect(data.truncated).toBe(false);
  });

  it("LIMIT exactly at cap+1 (201) is preserved and triggers truncation at 200", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big LIMIT 201" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rowCount: number }).rowCount).toBe(200);
    expect((result.data as { truncated: boolean }).truncated).toBe(true);
  });

  it("LIMIT equal to row count → no truncation", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big WHERE id <= 200" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rowCount: number; truncated: boolean }).truncated).toBe(false);
  });

  it("subquery LIMIT is NOT modified and bounds the inner result", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT * FROM (SELECT id FROM adv_big ORDER BY id LIMIT 3) AS t" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    expect(data.rowCount).toBe(3);
    expect(data.truncated).toBe(false);
    expect(data.rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("CTE inner LIMIT untouched; outer clamp still applies", async () => {
    const svc = await service();
    const result = svc.query({
      sql: "WITH top3 AS (SELECT id FROM adv_big ORDER BY id DESC LIMIT 3) SELECT id FROM top3",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; rows: { id: number }[] };
    expect(data.rowCount).toBe(3);
    expect(data.rows.map((r) => r.id)).toEqual([250, 249, 248]);
  });

  it("LIMIT inside an IN-subquery is untouched", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big WHERE id IN (SELECT id FROM adv_big ORDER BY id DESC LIMIT 2)" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rowCount: number }).rowCount).toBe(2);
  });

  it("UNION compound with ORDER BY: outer clamp appended after ORDER BY, truncation still detected", async () => {
    const svc = await service();
    const result = svc.query({
      sql: "SELECT id FROM adv_big WHERE id <= 120 UNION ALL SELECT id FROM adv_big WHERE id > 120 ORDER BY id",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean };
    expect(data.rowCount).toBe(200);
    expect(data.truncated).toBe(true);
  });

  it("LIMIT inside a string literal is not clamped", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT 'LIMIT 999999' AS literal" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rows: { literal: string }[] }).rows[0]?.literal).toBe("LIMIT 999999");
  });

  it("a LIMIT-mentioning comment does not corrupt the statement", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id /* LIMIT 999999 */ LIMIT 999999" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rowCount: number }).rowCount).toBe(200);
  });

  it("max_rows=1 → one row, truncated=true; small explicit LIMIT respected", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 10", maxRows: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rowCount: number }).rowCount).toBe(1);
    expect((result.data as { truncated: boolean }).truncated).toBe(true);
  });

  it("max_rows=0.5 floors to 0 → falls back to default 200", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big", maxRows: 0.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rowCount: number }).rowCount).toBe(200);
  });

  it("invalid max_rows: 0, -5, 99999, NaN, Infinity (0/negative → default; 99999 → capped at 200)", async () => {
    const svc = await service();
    for (const maxRows of [0, -5, 99999, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = svc.query({ sql: "SELECT id FROM adv_big", maxRows });
      expect(result.ok, `maxRows=${maxRows}`).toBe(true);
      if (!result.ok) continue;
      const data = result.data as { rowCount: number; truncated: boolean };
      expect(data.rowCount, `maxRows=${maxRows}`).toBe(200);
      expect(data.truncated, `maxRows=${maxRows}`).toBe(true);
    }
  });

  it("first successful query attaches a tables list; later queries omit it", async () => {
    const svc = await service();
    const first = svc.query({ sql: "SELECT 1 AS one" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Array.isArray((first.data as { tables?: string[] }).tables)).toBe(true);
    const second = svc.query({ sql: "SELECT 1 AS one" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect("tables" in (second.data as object)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Schema mode: complete listing, blocked tables excluded everywhere.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: schema mode", () => {
  it("returns table summaries + blockedTables; blocked tables never appear as queryable", async () => {
    const svc = await service();
    const result = svc.schema();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as {
      tables: { table: string; columns: { name: string; type: string }[] }[];
      blockedTables: string[];
    };
    const names = data.tables.map((t) => t.table);

    expect(data.blockedTables).toEqual(
      ["automation_repositories", "mobile_push_registrations", "user_secrets", "user_settings", "users"],
    );
    for (const blocked of data.blockedTables) expect(names).not.toContain(blocked);
    // Internal noise and fts5 shadow tables are hidden too:
    expect(names).not.toContain("_migrations");
    expect(names).not.toContain("messages_fts_data");
    expect(names).not.toContain("sqlite_sequence");
    // Real content tables (incl. fts5 virtual parents) are listed:
    for (const expected of ["messages", "sessions", "agent_threads", "agent_thread_activities", "memories", "scheduled_jobs", "audit_log", "messages_fts", "agent_thread_activities_fts"]) {
      expect(names).toContain(expected);
    }
    // Fixture tables appear with columns:
    const big = data.tables.find((t) => t.table === "adv_big");
    expect(big?.columns.map((c) => c.name)).toEqual(["id", "filler"]);
    for (const t of data.tables) expect(Array.isArray(t.columns)).toBe(true);
  });

  it("blocked tables are also NOT queryable even though their DDL exists in the DB", async () => {
    const svc = await service();
    refused(svc.query({ sql: "SELECT COUNT(*) AS n FROM user_secrets" }), "blocked_table");
    refused(svc.query({ sql: "SELECT username, password_hash FROM users LIMIT 1" }), "blocked_table");
  });

  it("RESIDUAL RISK (documented, not asserted as intended): direct sqlite_master reads list table NAMES incl. blocked ones", async () => {
    const svc = await service();
    // This documents current behavior: sqlite_master is not on the blocklist,
    // so an agent could learn that e.g. `user_secrets` exists (names only —
    // not row data). Flagged to the implementer as a defense-in-depth gap.
    const result = svc.query({ sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name" });
    expect(result.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Fixture-based end-to-end through the TOOL wrapper.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: end-to-end through the tool wrapper", () => {
  const tool = async () => createSessionSqlTool(await service());

  it("realistic join query returns the documented JSON shape", async () => {
    const result = await (await tool()).execute({
      sql: "SELECT s.name, COUNT(m.id) AS msgs FROM sessions s LEFT JOIN messages m ON m.session_id = s.id GROUP BY s.id ORDER BY msgs DESC, s.name LIMIT 3",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as {
      columns: string[];
      rows: Record<string, unknown>[];
      rowCount: number;
      truncated: boolean;
      tables?: string[];
    };
    expect(data.columns).toEqual(["name", "msgs"]);
    expect(data.rowCount).toBe(2);
    expect(data.truncated).toBe(false);
    expect(data.rows[0]).toEqual({ name: "Refactor gateway", msgs: 3 });
    expect(data.rows[1]).toEqual({ name: "Write docs", msgs: 1 });
    expect(Array.isArray(data.tables)).toBe(true); // first query attaches table list
    expect(typeof result.message).toBe("string");
  });

  it("aggregation query (messages per day) through the wrapper", async () => {
    const result = await (await tool()).execute({
      sql: "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM messages GROUP BY day ORDER BY day",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rows: { day: string; n: number }[] };
    expect(data.rows).toEqual([
      { day: "2026-01-20", n: 1 },
      { day: "2026-02-10", n: 2 },
      { day: "2026-02-11", n: 1 },
    ]);
  });

  it("max_rows clamping through the wrapper (numeric and string-coerced via registry)", async () => {
    const direct = await (await tool()).execute({ sql: "SELECT id FROM adv_big", max_rows: 2 });
    expect(direct.ok).toBe(true);
    if (!direct.ok) return;
    const data = direct.data as { rowCount: number; truncated: boolean };
    expect(data.rowCount).toBe(2);
    expect(data.truncated).toBe(true);
    expect(direct.message).toMatch(/truncated/i);

    // Registry path coerces max_rows:"3" (string) → number 3.
    const registry = new ToolRegistry();
    registry.register(await tool());
    const context: ToolContext = {
      sessionId: "adv-test",
      actionId: "adv-action",
      projectRoot: "/home/jakob/jait",
      requestedBy: "tester",
    };
    const viaRegistry = await registry.execute(ToolName.SessionSql, { sql: "SELECT id FROM adv_big", max_rows: "3" }, context);
    expect(viaRegistry.ok).toBe(true);
    if (!viaRegistry.ok) return;
    expect((viaRegistry.data as { rowCount: number }).rowCount).toBe(3);
  });

  it("schema mode through the wrapper", async () => {
    const result = await (await tool()).execute({ mode: "schema" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { tables: unknown[]; blockedTables: string[] };
    expect(data.tables.length).toBeGreaterThan(5);
    expect(data.blockedTables).toContain("user_secrets");
  });

  it("mode:\"schema\" wins over a supplied (even malicious) sql", async () => {
    const result = await (await tool()).execute({ mode: "schema", sql: "DELETE FROM messages" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("tables" in (result.data as object)).toBe(true);
  });

  it("refusals surface as ok:false with the error class in data.error", async () => {
    const t = await tool();
    const blocked = await t.execute({ sql: "SELECT * FROM user_secrets" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect((blocked.data as { error?: string }).error).toBe("blocked_table");

    const readonly = await t.execute({ sql: "DELETE FROM messages" });
    expect(readonly.ok).toBe(false);
    if (readonly.ok) return;
    expect((readonly.data as { error?: string }).error).toBe("readonly_violation");
  });

  it("BLOB values are sanitized to a JSON-safe placeholder", async () => {
    const result = await (await tool()).execute({ sql: "SELECT data FROM adv_blob_test" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { rows: { data: string }[] }).rows[0]?.data).toBe("<blob 4 bytes>");
  });

  it("empty result still reports inferred columns (SELECT-list and SELECT * paths)", async () => {
    const t = await tool();
    const star = await t.execute({ sql: "SELECT * FROM messages WHERE 1 = 0" });
    expect(star.ok).toBe(true);
    if (!star.ok) return;
    expect((star.data as { columns: string[] }).columns).toEqual([
      "id",
      "session_id",
      "role",
      "content",
      "tool_calls",
      "created_at",
      "segments",
      "context_flow",
      "thinking",
    ]);

    const projection = await t.execute({ sql: "SELECT id, content FROM messages WHERE 1 = 0" });
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    expect((projection.data as { columns: string[] }).columns).toEqual(["id", "content"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. Non-string / missing sql through the tool wrapper + registry validation.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: non-string / missing sql inputs", () => {
  const tool = async () => createSessionSqlTool(await service());

  it("missing / empty / whitespace sql → ok:false invalid_input (never executes)", async () => {
    const t = await tool();
    for (const input of [{}, { sql: "" }, { sql: "   " }, { sql: null }]) {
      const result = await t.execute(input as SessionSqlToolInput);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      if (result.ok) continue;
      expect((result.data as { error?: string }).error, JSON.stringify(input)).toBe("invalid_input");
    }
  });

  it("non-string sql (number / array) returns a clean error instead of throwing", async () => {
    const t = await tool();
    for (const bad of [123, ["SELECT 1"], { sql: "x" }, true]) {
      const result = await t.execute({ sql: bad } as unknown as SessionSqlToolInput);
      expect(result.ok, `sql=${JSON.stringify(bad)}`).toBe(false);
      if (result.ok) continue;
      expect((result.data as { error?: string }).error).toBe("invalid_input");
    }
  });

  it("service.query() also returns invalid_sql for non-string sql instead of throwing", async () => {
    const svc = await service();
    for (const bad of [123, ["SELECT 1"], true]) {
      const result = svc.query({ sql: bad } as unknown as { sql: string });
      expect(result.ok, `sql=${JSON.stringify(bad)}`).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBe("invalid_sql");
    }
  });

  it("registry-level input validation rejects non-string sql before the tool runs", async () => {
    const registry = new ToolRegistry();
    registry.register(await tool());
    const context: ToolContext = {
      sessionId: "adv-test",
      actionId: "adv-action",
      projectRoot: "/home/jakob/jait",
      requestedBy: "tester",
    };
    const result = await registry.execute(ToolName.SessionSql, { sql: 123 }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/Input validation failed/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. Dangerous SQLite functions (writefile, readfile, load_extension, …).
//     Their availability varies by SQLite build, so refusal is enforced at
//     validation time, never left to the engine's "no such function". Matched
//     only as CALLS (identifier followed by `(`) so benign near-miss
//     identifiers (table `writefile_log`, CTE `zipfile`, `strftime`, string
//     literals) keep working.
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: banned SQLite function calls", () => {
  it("refuses every banned function used as a call, naming it in the error", async () => {
    const svc = await service();
    const cases: Array<[string, string]> = [
      ["writefile", "SELECT writefile('/tmp/jait-adversarial-pwned', 'x') AS r"],
      ["readfile", "SELECT readfile('/etc/passwd') AS r"],
      ["fts3_tokenizer", "SELECT fts3_tokenizer('simple') AS r"],
      ["zipfile", "SELECT zipfile('/tmp/jait-adversarial.zip') AS r"],
      ["sqlar", "SELECT sqlar('/tmp/jait-adversarial.tar') AS r"],
      ["load_extension", "SELECT load_extension('evil.so') AS r"],
      ["sqlite_load_extension", "SELECT sqlite_load_extension('evil.so') AS r"],
    ];
    for (const [name, sql] of cases) {
      const result = svc.query({ sql });
      refused(result, "banned_function");
      if (result.ok) continue;
      expect(result.message, sql).toContain(name);
    }
  });

  it("refuses obfuscated call forms: whitespace, case, quoting, comments", async () => {
    const svc = await service();
    const cases = [
      "SELECT writefile ('/tmp/jait-adversarial-pwned', 'x') AS r", // space before (
      "SELECT WRITEFILE('/tmp/jait-adversarial-pwned', 'x') AS r", // case-insensitive
      'SELECT "writefile"(\'/tmp/jait-adversarial-pwned\', \'x\') AS r', // double-quoted name
      "SELECT [zipfile]('/tmp/jait-adversarial.zip') AS r", // bracketed name
      "SELECT `load_extension`('evil.so') AS r", // backticked name
      'SELECT "writefile" /*note*/ (\'/tmp/jait-adversarial-pwned\', \'x\') AS r', // comment between
    ];
    for (const sql of cases) refused(svc.query({ sql }), "banned_function");
  });

  it("benign identifiers containing a banned substring stay allowed", async () => {
    const svc = await service();
    // Fixture table named `writefile_log`.
    const table = svc.query({ sql: "SELECT * FROM writefile_log" });
    expect(table.ok).toBe(true);
    // CTE named `zipfile`, and a column alias containing the banned name.
    const cte = svc.query({ sql: "WITH zipfile AS (SELECT 1 AS v) SELECT v FROM zipfile" });
    expect(cte.ok).toBe(true);
    // `strftime` (the classic near-miss function) still allowed.
    const strftime = svc.query({ sql: "SELECT strftime('%Y', '2024-01-01') AS y" });
    expect(strftime.ok).toBe(true);
    expect(strftime.ok && strftime.data.rows[0].y).toBe("2024");
    // String literal containing `writefile(` — never treated as a call.
    const literal = svc.query({ sql: "SELECT 'writefile(' || note AS tag FROM writefile_log" });
    expect(literal.ok).toBe(true);
  });

  it("tool wrapper surfaces banned_function errors with the offending name", async () => {
    const t = createSessionSqlTool(await service());
    const result = await t.execute({ sql: "SELECT readfile('/etc/passwd') AS r" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const data = result.data as { error?: string };
    expect(data.error).toBe("banned_function");
    expect(result.message).toContain("readfile");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. Quoted `pragma_*` hole (follow-up): SQLite accepts quoted identifiers in
//     table-valued-function position, so `"pragma_table_info"('user_secrets')`
//     executed despite the unquoted `pragma_*` ban and leaked blocked-table
//     column metadata. The ban must now also cover quoted / bracketed /
//     backticked spellings, without touching benign quoted identifiers that
//     merely mention `pragma` (no `pragma_` prefix).
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: quoted pragma_* identifiers", () => {
  const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
  for (const [label, sql] of cases) {
    it(`refuses quoted pragma_* anywhere: ${label}`, async () => {
      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    });
  }

  it("benign quoted identifiers NOT matching the pragma_ prefix stay allowed", async () => {
    const svc = await service();
    // A quoted column that only *mentions* pragma (no underscore suffix):
    const alias = svc.query({ sql: `SELECT 1 AS "pragma"` });
    expect(alias.ok).toBe(true);
    if (alias.ok) expect((alias.data as { rows: { pragma: number }[] }).rows[0]?.pragma).toBe(1);
    // A quoted alias whose name merely contains the substring:
    const contains = svc.query({ sql: `SELECT 1 AS "my_pragma_table_info"` });
    expect(contains.ok).toBe(true);
    // A quoted column of a real fixture table:
    const column = svc.query({ sql: `SELECT "content" FROM "messages" ORDER BY id LIMIT 1` });
    expect(column.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. Negative / signed top-level LIMIT (follow-up): `LIMIT -1` is VALID
//     SQLite (it means unlimited). Appending the clamp produced
//     `LIMIT -1 LIMIT 201` → raw double-LIMIT syntax error surfaced as
//     sql_error. A LIMIT whose value is not a plain digit run now counts as
//     already present, so no clamp is appended (the JS-side row cap still
//     bounds results).
// ════════════════════════════════════════════════════════════════════════════
describe("adversarial: negative / signed LIMIT with clamping", () => {
  it("LIMIT -1 no longer triggers a double-LIMIT syntax error; row cap still applies", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT -1" });
    expect(result.ok, `expected ok, got ${JSON.stringify(result).slice(0, 200)}`).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    expect(data.rowCount).toBe(200);
    expect(data.truncated).toBe(true);
    expect(data.rows[0]?.id).toBe(1);
  });

  it("signed LIMIT +5 keeps its native meaning and is not double-clamped", async () => {
    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT +5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean };
    expect(data.rowCount).toBe(5);
    expect(data.truncated).toBe(false);
  });
});