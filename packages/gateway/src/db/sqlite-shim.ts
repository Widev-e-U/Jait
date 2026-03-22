/**
 * Runtime-agnostic SQLite shim.
 *
 * Priority order:
 *   1. `bun:sqlite`      — when running under Bun
 *   2. `node:sqlite`     — Node.js 22.5+ built-in (no native addon needed)
 *   3. `better-sqlite3`  — Node.js fallback (uses prebuild-install)
 *
 * All three backends expose the same subset we need (.exec, .prepare, .close)
 * so the rest of the gateway code never needs to know which engine is active.
 *
 * Drizzle ORM's `better-sqlite3` adapter works with both `better-sqlite3` and
 * `node:sqlite` because `DatabaseSync` is API-compatible (duck-typed).
 */
import * as schema from "./schema.js";

// ── Minimal interface covering the API surface we actually use ──────────────

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

// ── Runtime detection ──────────────────────────────────────────────────────

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

/** Which SQLite backend was actually loaded. Useful for diagnostics. */
export let sqliteBackend: "bun:sqlite" | "node:sqlite" | "better-sqlite3" = "better-sqlite3";

// ── node:sqlite compatibility wrapper ──────────────────────────────────────

/**
 * Wrap a node:sqlite DatabaseSync to be compatible with drizzle-orm's
 * better-sqlite3 adapter, which calls `stmt.raw(true/false)` to toggle
 * between object and array result modes.
 *
 * node:sqlite's StatementSync doesn't have `.raw()`, so we shim it.
 */
function wrapNodeSqlite(rawDb: unknown): SqliteDatabase {
  const db = rawDb as {
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: unknown[]): Record<string, unknown>[];
      get(...params: unknown[]): Record<string, unknown> | undefined;
      run(...params: unknown[]): unknown;
    };
    close(): void;
  };

  return {
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      let rawMode = false;

      return {
        // better-sqlite3 API: .raw() with no args enables raw mode,
        // .raw(true) enables, .raw(false) disables.
        raw(enabled?: boolean) {
          rawMode = enabled !== false;
          return this;
        },
        all(...params: unknown[]) {
          const rows = stmt.all(...params);
          if (!rawMode || rows.length === 0) return rows;
          return rows.map((row) => Object.values(row));
        },
        get(...params: unknown[]) {
          const row = stmt.get(...params);
          if (!rawMode || !row) return row;
          return Object.values(row);
        },
        run(...params: unknown[]) {
          return stmt.run(...params);
        },
      } as unknown as SqliteStatement;
    },
  };
}

// ── Factory: open a raw SQLite database ────────────────────────────────────

/**
 * Open a raw SQLite database using whichever native driver is available.
 * The returned handle satisfies `SqliteDatabase` in both runtimes.
 */
export async function openRawSqlite(path: string): Promise<SqliteDatabase> {
  if (isBun) {
    // @ts-ignore — bun:sqlite only exists at runtime under Bun
    const { Database } = await import("bun:sqlite");
    sqliteBackend = "bun:sqlite";
    return new Database(path) as unknown as SqliteDatabase;
  }

  // Node.js path: prefer built-in node:sqlite, fall back to better-sqlite3
  try {
    // @ts-ignore — node:sqlite is experimental in Node 22, stable in later versions
    const { DatabaseSync } = await import("node:sqlite");
    sqliteBackend = "node:sqlite";
    return wrapNodeSqlite(new DatabaseSync(path));
  } catch {
    // node:sqlite not available (flag not set or Node < 22.5)
  }

  // Last resort: try better-sqlite3 if manually installed
  try {
    const mod = await import("better-sqlite3");
    const Database = mod.default;
    sqliteBackend = "better-sqlite3";
    return new Database(path) as unknown as SqliteDatabase;
  } catch {
    throw new Error(
      "No SQLite backend available. Jait requires Node.js 22.5+ (which includes node:sqlite) or Bun. " +
      "If you're on an older Node version, install better-sqlite3 manually: npm install better-sqlite3"
    );
  }
}

// ── Factory: wrap a raw handle with the Drizzle adapter ────────────────────

type SchemaType = typeof schema;

/**
 * Wrap a raw SQLite handle with the matching Drizzle ORM adapter.
 * Returns a fully-typed Drizzle instance regardless of runtime.
 *
 * For non-Bun runtimes (node:sqlite or better-sqlite3), we bypass
 * `drizzle-orm/better-sqlite3` (whose driver.js top-level-imports
 * the `better-sqlite3` package) and construct the Drizzle instance
 * from safe sub-modules that have no native-addon dependency.
 */
export async function createDrizzle(rawDb: SqliteDatabase) {
  if (isBun) {
    const { drizzle } = await import("drizzle-orm/bun-sqlite");
    // BunSQLiteDatabase and BetterSQLite3Database differ in RunResult type
    // but are structurally compatible for all query-builder operations.
    return drizzle(rawDb as never, { schema }) as unknown as DrizzleDB;
  }

  // Import the session + core pieces directly — this avoids
  // drizzle-orm/better-sqlite3/driver.js which top-level-imports
  // the `better-sqlite3` npm package and fails when it's not installed.
  const { BetterSQLiteSession } = await import("drizzle-orm/better-sqlite3/session");
  const { BaseSQLiteDatabase } = await import("drizzle-orm/sqlite-core/db");
  const { SQLiteSyncDialect } = await import("drizzle-orm/sqlite-core/dialect");
  const {
    createTableRelationsHelpers,
    extractTablesRelationalConfig,
  } = await import("drizzle-orm/relations");

  const dialect = new SQLiteSyncDialect();
  const tablesConfig = extractTablesRelationalConfig(
    schema,
    createTableRelationsHelpers,
  );
  const schemaConfig = {
    fullSchema: schema,
    schema: tablesConfig.tables,
    tableNamesMap: tablesConfig.tableNamesMap,
  };
  const session = new BetterSQLiteSession(rawDb as never, dialect, schemaConfig, {});
  const db = new BaseSQLiteDatabase("sync" as never, dialect as never, session as never, schemaConfig as never);
  (db as unknown as Record<string, unknown>).$client = rawDb;
  return db as unknown as DrizzleDB;
}

// ── Re-export a unified Drizzle DB type ────────────────────────────────────

// Both adapters ultimately produce the same query-builder shape. We pick
// BetterSQLite3Database as the canonical type because it's what the compiled
// JS uses on the server (Node.js). Bun's adapter is structurally compatible.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
export type DrizzleDB = BetterSQLite3Database<SchemaType>;
