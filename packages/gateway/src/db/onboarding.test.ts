/**
 * Onboarding integration test — verifies that a fresh database can be opened,
 * migrated, and used by all services without errors. This prevents regressions
 * like the "no such column: kind" crash that occurred in v0.1.207.
 *
 * Also tests upgrade scenarios: an old DB (pre-migration-7 without `kind`)
 * should be repaired by verifySchema.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase, migrateDatabase, verifySchema, getSchemaVersion } from "./connection.js";
import { migrations } from "./migrations.js";
import * as schema from "./schema.js";
import type { SqliteDatabase } from "./sqlite-shim.js";
import type { JaitDB } from "./connection.js";
import { eq, desc } from "drizzle-orm";

let sqlite: SqliteDatabase;
let db: JaitDB;

beforeEach(async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
});

afterEach(() => {
  sqlite.close();
});

describe("fresh onboarding", () => {
  it("runs all migrations on a fresh database without errors", () => {
    expect(() => migrateDatabase(sqlite)).not.toThrow();
    expect(getSchemaVersion(sqlite)).toBe(Math.max(...migrations.map((m) => m.id)));
  });

  it("creates all expected tables", () => {
    migrateDatabase(sqlite);

    const tables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    ).map((r) => r.name).filter((n) => !n.startsWith("_") && n !== "sqlite_sequence");

    const expected = [
      "agent_thread_activities",
      "agent_threads",
      "architecture_diagrams",
      "audit_log",
      "automation_plans",
      "automation_repositories",
      "consent_log",
      "consent_session_approvals",
      "memories",
      "messages",
      "network_hosts",
      "scheduled_job_runs",
      "scheduled_jobs",
      "session_state",
      "sessions",
      "trust_levels",
      "user_settings",
      "users",
      "workspace_state",
      "workspaces",
    ];

    for (const table of expected) {
      expect(tables, `missing table: ${table}`).toContain(table);
    }
  });

  it("agent_threads table has all Drizzle schema columns", () => {
    migrateDatabase(sqlite);

    const columns = (
      sqlite.prepare("PRAGMA table_info(agent_threads)").all() as { name: string }[]
    ).map((c) => c.name);

    // Every column defined in the Drizzle schema must exist
    const expectedColumns = [
      "id", "user_id", "session_id", "title", "provider_id",
      "model", "runtime_mode", "kind", "working_directory", "branch",
      "status", "provider_session_id", "error", "pr_url", "pr_number",
      "pr_title", "pr_state", "execution_node_id", "execution_node_name",
      "created_at", "updated_at", "completed_at",
    ];

    for (const col of expectedColumns) {
      expect(columns, `agent_threads missing column: ${col}`).toContain(col);
    }
  });

  it("can query agent_threads via Drizzle (SELECT with all columns)", () => {
    migrateDatabase(sqlite);

    // This is the exact query that crashed in v0.1.207
    const rows = db
      .select()
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.status, "running"))
      .orderBy(desc(schema.agentThreads.updatedAt))
      .all();

    expect(rows).toEqual([]);
  });

  it("can insert and query an agent thread with kind column", () => {
    migrateDatabase(sqlite);

    const now = new Date().toISOString();
    db.insert(schema.agentThreads)
      .values({
        id: "test-thread-1",
        title: "Test thread",
        providerId: "jait",
        kind: "delegation",
        status: "running",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db
      .select()
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.status, "running"))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("delegation");
    expect(rows[0].title).toBe("Test thread");
  });

  it("can query all tables defined in the Drizzle schema", () => {
    migrateDatabase(sqlite);

    // Attempt a SELECT from every table — if any column is missing,
    // Drizzle will generate SQL referencing it and SQLite will throw.
    const schemaTables = [
      schema.workspaces,
      schema.sessions,
      schema.users,
      schema.userSettings,
      schema.auditLog,
      schema.trustLevels,
      schema.consentLog,
      schema.consentSessionApprovals,
      schema.memories,
      schema.messages,
      schema.sessionState,
      schema.workspaceState,
      schema.architectureDiagrams,
      schema.agentThreads,
      schema.agentThreadActivities,
      schema.automationRepositories,
      schema.automationPlans,
      schema.networkHosts,
      schema.scheduledJobs,
      schema.scheduledJobRuns,
    ];

    for (const table of schemaTables) {
      expect(() => {
        db.select().from(table).all();
      }, `SELECT from ${table[Symbol.for("drizzle:Name")] ?? "unknown"} failed`).not.toThrow();
    }
  });

  it("migrations are idempotent (running twice does not fail)", () => {
    migrateDatabase(sqlite);
    expect(() => migrateDatabase(sqlite)).not.toThrow();
  });
});

describe("upgrade scenario — legacy DB without kind column", () => {
  it("verifySchema repairs a missing kind column on agent_threads", () => {
    // Simulate an old DB: create agent_threads WITHOUT the kind column
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agent_threads (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        title TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT,
        runtime_mode TEXT NOT NULL DEFAULT 'full-access',
        working_directory TEXT,
        branch TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        provider_session_id TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    // Verify kind is missing
    const colsBefore = (
      sqlite.prepare("PRAGMA table_info(agent_threads)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(colsBefore).not.toContain("kind");

    // Run verifySchema — it should repair the missing column
    verifySchema(sqlite);

    const colsAfter = (
      sqlite.prepare("PRAGMA table_info(agent_threads)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(colsAfter).toContain("kind");
  });

  it("Drizzle queries work after verifySchema repairs missing columns", () => {
    // Create the full old schema first (so migrations are "already done")
    migrateDatabase(sqlite);

    // Simulate corruption: drop and recreate without kind
    sqlite.exec("DROP TABLE agent_threads");
    sqlite.exec(`
      CREATE TABLE agent_threads (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        title TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT,
        runtime_mode TEXT NOT NULL DEFAULT 'full-access',
        working_directory TEXT,
        branch TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        provider_session_id TEXT,
        error TEXT,
        pr_url TEXT,
        pr_number INTEGER,
        pr_title TEXT,
        pr_state TEXT,
        execution_node_id TEXT,
        execution_node_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    // Insert a row without kind
    const now = new Date().toISOString();
    sqlite.prepare(
      "INSERT INTO agent_threads (id, title, provider_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("old-thread", "Legacy thread", "jait", "running", now, now);

    // This would have crashed in v0.1.207
    expect(() => {
      db.select().from(schema.agentThreads).where(eq(schema.agentThreads.status, "running")).all();
    }).toThrow(); // Should throw because kind column is missing

    // Run verifySchema to repair
    verifySchema(sqlite);

    // Now the same query should work
    const rows = db
      .select()
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.status, "running"))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("delivery"); // DEFAULT value
  });

  it("verifySchema repairs multiple missing columns across tables", () => {
    // Create bare-bones tables missing several columns
    sqlite.exec(`
      CREATE TABLE user_settings (
        user_id TEXT PRIMARY KEY,
        theme TEXT NOT NULL DEFAULT 'system',
        api_keys TEXT,
        updated_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    verifySchema(sqlite);

    // Check user_settings got its missing columns
    const usCols = (
      sqlite.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(usCols).toContain("disabled_tools");
    expect(usCols).toContain("stt_provider");
    expect(usCols).toContain("chat_provider");
    expect(usCols).toContain("workspace_picker_path");
    expect(usCols).toContain("workspace_picker_node_id");

    // Check messages got its missing columns
    const msgCols = (
      sqlite.prepare("PRAGMA table_info(messages)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(msgCols).toContain("tool_calls");
    expect(msgCols).toContain("segments");
  });

  it("verifySchema is safe when table does not exist", () => {
    // No tables created at all — verifySchema should not crash
    expect(() => verifySchema(sqlite)).not.toThrow();
  });

  it("verifySchema is safe when columns already exist", () => {
    migrateDatabase(sqlite);
    // All columns exist — should be a no-op
    expect(() => verifySchema(sqlite)).not.toThrow();
  });
});

describe("full startup simulation", () => {
  it("simulates the complete gateway startup sequence", () => {
    // This mirrors the exact sequence in index.ts main()
    migrateDatabase(sqlite);

    // 1. ThreadService.listRunning() — the exact call that crashed
    const runningThreads = db
      .select()
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.status, "running"))
      .orderBy(desc(schema.agentThreads.updatedAt))
      .all();
    expect(runningThreads).toEqual([]);

    // 2. Query sessions (SessionService)
    const sessions = db.select().from(schema.sessions).all();
    expect(sessions).toEqual([]);

    // 3. Query users (UserService)
    const users = db.select().from(schema.users).all();
    expect(users).toEqual([]);

    // 4. Query scheduled jobs (SchedulerService)
    const jobs = db
      .select()
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.enabled, 1))
      .all();
    expect(jobs).toEqual([]);

    // 5. Query workspaces (WorkspaceService)
    const workspaces = db.select().from(schema.workspaces).all();
    expect(workspaces).toEqual([]);

    // 6. Query memories
    const memories = db.select().from(schema.memories).all();
    expect(memories).toEqual([]);
  });
});
