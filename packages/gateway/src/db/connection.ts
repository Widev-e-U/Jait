/**
 * SQLite connection — runtime-agnostic (bun:sqlite under Bun, better-sqlite3 under Node).
 *
 * Database lives at ~/.jait/data/jait.db (created automatically).
 * For tests, pass ":memory:" as dbPath.
 */
import type { SqliteDatabase, DrizzleDB } from "./sqlite-shim.js";
import { openRawSqlite, createDrizzle } from "./sqlite-shim.js";
import { migrations } from "./migrations.js";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type { SqliteDatabase } from "./sqlite-shim.js";
export type JaitDB = DrizzleDB;

/** Resolve the default DB path: ~/.jait/data/jait.db */
export function defaultDbPath(): string {
  return join(homedir(), ".jait", "data", "jait.db");
}

/**
 * Open (or create) the SQLite database and run table creation.
 *
 * @param dbPath  File path for the SQLite DB, or ":memory:" for tests.
 * @returns { db, sqlite } — drizzle instance + raw SQLite handle
 */
export async function openDatabase(dbPath?: string): Promise<{ db: JaitDB; sqlite: SqliteDatabase }> {
  const resolvedPath = dbPath ?? defaultDbPath();

  // Ensure the directory exists (no-op for :memory:)
  if (resolvedPath !== ":memory:") {
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = await openRawSqlite(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  const db = await createDrizzle(sqlite);

  return { db, sqlite };
}

/**
 * Run DDL to create all tables if they don't already exist.
 * Uses raw SQL so we don't need drizzle-kit push in production.
 *
 * Migrations are numbered and tracked in a `_migrations` table.
 * Only new (un-applied) migrations run on each startup — safe for updates.
 */
export function migrateDatabase(sqlite: SqliteDatabase) {
  // Ensure the migrations tracking table exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  // Load which migrations have already been applied
  const applied = new Set(
    (sqlite.prepare("SELECT id FROM _migrations").all() as { id: number }[])
      .map((r) => r.id),
  );

  let ran = 0;
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    console.log(`  Running migration ${migration.id}: ${migration.name}`);
    migration.run(sqlite);

    // Record that this migration has been applied
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
    ran++;
  }

  if (ran > 0) {
    console.log(`  ${ran} migration(s) applied (schema now at v${migrations.length}).`);
  }

  // Safety net: verify expected columns exist even if migrations were
  // silently swallowed via try/catch in earlier versions.
  verifySchema(sqlite);
}

/**
 * Post-migration safety net: verify that every column the Drizzle schema
 * expects actually exists in the SQLite table, and add any that are missing.
 *
 * This guards against migrations that silently swallowed errors via try/catch,
 * or against historical migrations being modified in-place after they were
 * already marked as applied.
 */
export function verifySchema(sqlite: SqliteDatabase) {
  // Map of table -> expected columns with their DDL fragments
  const expectedColumns: Record<string, Record<string, string>> = {
    agent_threads: {
      kind: "TEXT NOT NULL DEFAULT 'delivery'",
      pr_url: "TEXT",
      pr_number: "INTEGER",
      pr_title: "TEXT",
      pr_base_branch: "TEXT",
      pr_state: "TEXT",
      execution_node_id: "TEXT",
      execution_node_name: "TEXT",
    },
    user_settings: {
      disabled_tools: "TEXT",
      stt_provider: "TEXT NOT NULL DEFAULT 'simulated'",
      chat_provider: "TEXT NOT NULL DEFAULT 'jait'",
      workspace_picker_path: "TEXT",
      workspace_picker_node_id: "TEXT",
    },
    messages: {
      tool_calls: "TEXT",
      segments: "TEXT",
    },
    sessions: {
      user_id: "TEXT",
      workspace_id: "TEXT",
    },
    automation_repositories: {
      device_id: "TEXT",
      github_url: "TEXT",
      strategy: "TEXT",
    },
  };

  let repaired = 0;
  for (const [table, columns] of Object.entries(expectedColumns)) {
    // Check if table even exists before querying its columns
    const tableExists = sqlite.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!tableExists) continue;

    const existing = new Set(
      (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
        .map((c) => c.name),
    );

    for (const [col, ddl] of Object.entries(columns)) {
      if (existing.has(col)) continue;
      try {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
        console.log(`  Schema repair: added missing column ${table}.${col}`);
        repaired++;
      } catch (err) {
        // Log the actual error so we never silently fail again
        console.error(`  Schema repair failed for ${table}.${col}:`, err);
      }
    }
  }
  if (repaired > 0) {
    console.log(`  ${repaired} column(s) repaired.`);
  }
}

/**
 * Get the current schema version (highest applied migration ID).
 */
export function getSchemaVersion(sqlite: SqliteDatabase): number {
  try {
    const row = sqlite.prepare("SELECT MAX(id) as v FROM _migrations").get() as { v: number | null } | null;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
