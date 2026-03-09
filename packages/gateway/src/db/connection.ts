/**
 * SQLite connection via better-sqlite3 + Drizzle ORM.
 *
 * Database lives at ~/.jait/data/jait.db (created automatically).
 * For tests, pass ":memory:" as dbPath.
 */
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { migrations } from "./migrations.js";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type JaitDB = BetterSQLite3Database<typeof schema>;

/** Resolve the default DB path: ~/.jait/data/jait.db */
export function defaultDbPath(): string {
  return join(homedir(), ".jait", "data", "jait.db");
}

/**
 * Open (or create) the SQLite database and run table creation.
 *
 * @param dbPath  File path for the SQLite DB, or ":memory:" for tests.
 * @returns { db, sqlite } — drizzle instance + raw better-sqlite3 handle
 */
export function openDatabase(dbPath?: string): { db: JaitDB; sqlite: Database.Database } {
  const resolvedPath = dbPath ?? defaultDbPath();

  // Ensure the directory exists (no-op for :memory:)
  if (resolvedPath !== ":memory:") {
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

/**
 * Run DDL to create all tables if they don't already exist.
 * Uses raw SQL so we don't need drizzle-kit push in production.
 *
 * Migrations are numbered and tracked in a `_migrations` table.
 * Only new (un-applied) migrations run on each startup — safe for updates.
 */
export function migrateDatabase(sqlite: Database.Database) {
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
}

/**
 * Get the current schema version (highest applied migration ID).
 */
export function getSchemaVersion(sqlite: Database.Database): number {
  try {
    const row = sqlite.prepare("SELECT MAX(id) as v FROM _migrations").get() as { v: number | null } | null;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
