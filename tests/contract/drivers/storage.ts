/** Disposable migrated database fixtures; Rust supplies actions and owns all assertions. */
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/index.ts';
import type { SqliteDatabase } from '../../../packages/gateway/src/db/sqlite-shim.ts';
import { SessionSqlService } from '../../../packages/gateway/src/services/session-sql.ts';
import { createSessionSqlTool } from '../../../packages/gateway/src/tools/session-sql-tools.ts';
import { ToolRegistry } from '../../../packages/gateway/src/tools/registry.ts';
import { ToolName } from '../../../packages/gateway/src/tools/tool-names.ts';
export async function dispatch(call: any): Promise<unknown> {
  if (call.op !== 'storage.run' || !Array.isArray(call.actions) || call.actions.length > 64) throw new Error('unsupported storage operation');
  // `migrateDatabase` prints progress with console.log. stdout must remain a
  // single valid JSON document, so redirect those diagnostics to stderr for the
  // duration of the call and restore afterwards.
  const stdoutLog = console.log;
  console.log = (...args: unknown[]) => { console.error(...args); };
  try {
    const { sqlite } = await openDatabase(':memory:');
    try {
      migrateDatabase(sqlite);
      if (call.fixture === 'adversarial') {
        seedAdversarialFixtures(sqlite);
        sqlite.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
        sqlite.prepare("INSERT INTO updated_messages VALUES (1, 'probe')").run();
      } else seedFixtures(sqlite);
      const service = new SessionSqlService(sqlite);
      const tool = createSessionSqlTool(service);
      const results = [];
      for (const action of call.actions) {
        // A throw from one action must not abort the whole call: record it so
        // its shape can be asserted (successful result shapes are unchanged).
        try {
          switch (action.kind) {
            case 'query': {
              const input = {...action.input};
              if (action.maxRowsSpecial === 'NaN') input.maxRows = Number.NaN;
              if (action.maxRowsSpecial === 'Infinity') input.maxRows = Number.POSITIVE_INFINITY;
              results.push(service.query(input)); break;
            }
            case 'schema': results.push(service.schema()); break;
            case 'tool': results.push(await tool.execute(action.input, undefined as never)); break;
            case 'tool-name': results.push(tool.name); break;
            case 'count-messages': results.push(sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get()); break;
            // Derived value: run one probe query and report, per requested name,
            // whether it appears in the queryable-table list the service
            // attaches to a first query. Mirrors `names).toContain(x)` /
            // `names).not.toContain(x)` using the existing boolean `eq` kind.
            case 'tables-includes': {
              const probe = service.query({sql: 'SELECT 1 AS one'});
              const names = probe.ok && 'tables' in probe.data ? (probe.data.tables ?? []) : [];
              const flags: Record<string, boolean> = {};
              for (const name of action.names) flags[name] = names.includes(name);
              results.push(flags); break;
            }
            // Derived value: run one probe query and report whether it attached
            // the table list. Mirrors `"tables" in data`.
            case 'tables-attached': {
              const probe = service.query({sql: 'SELECT 1 AS one'});
              results.push(probe.ok && 'tables' in probe.data); break;
            }
            // Derived value: locate one table in the schema summary and report
            // its column names / types. Mirrors
            // `byName.get(t).columns.map(c => c.name)` / `...type` lookups.
            case 'schema-table': {
              const schema = service.schema();
              const tables = schema.ok && 'tables' in schema.data ? (schema.data.tables ?? []) : [];
              const hit = tables.find((t) => t.table === action.table);
              results.push(hit
                ? { found: true, names: hit.columns.map((c) => c.name), types: Object.fromEntries(hit.columns.map((c) => [c.name, c.type])) }
                : { found: false, names: [], types: {} });
              break;
            }
            // Derived value: run the tool wrapper and report array-shape facts
            // about `data.tables`. Mirrors `Array.isArray(data.tables)` and
            // `data.tables.length`.
            case 'tool-shape': {
              const result = await tool.execute(action.input, undefined as never);
              const data = result && typeof result === 'object' && 'data' in result
                ? (result as { data?: { tables?: unknown } }).data : undefined;
              const tables = data?.tables;
              results.push({
                tablesIsArray: Array.isArray(tables),
                tablesLength: Array.isArray(tables) ? tables.length : -1,
              });
              break;
            }
            // Route through the real ToolRegistry so schema-driven coercion and
            // input validation match the production code path.
            case 'registry': {
              const registry = new ToolRegistry();
              registry.register(tool);
              results.push(await registry.execute(ToolName.SessionSql, action.input, {
                sessionId: 'storage-contract', actionId: 'storage-action',
                projectRoot: '/home/jakob/jait', requestedBy: 'tester',
              }));
              break;
            }
            case 'broken-schema': results.push(new SessionSqlService({exec() {}, close() {}, transaction() {}, prepare() {throw new Error('boom');}} as never).schema()); break;
            default: throw new Error('unsupported storage action');
          }
        } catch (err) {
          results.push({thrown: err instanceof Error ? err.message : String(err)});
        }
      }
      return results;
    } finally { sqlite.close(); }
  } finally { console.log = stdoutLog; }
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

function seedAdversarialFixtures(db: SqliteDatabase): void {
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
