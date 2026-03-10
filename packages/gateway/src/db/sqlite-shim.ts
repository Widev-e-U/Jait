/**
 * Runtime-agnostic SQLite shim.
 *
 * Uses `bun:sqlite` when running under Bun, `better-sqlite3` under Node.js.
 * Both expose the same subset we need (.exec, .prepare, .close) so the rest
 * of the gateway code never needs to know which engine is active.
 *
 * Drizzle ORM has matching adapters for both backends; `createDrizzle()`
 * returns the correct one.
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

// ── Factory: open a raw SQLite database ────────────────────────────────────

/**
 * Open a raw SQLite database using whichever native driver is available.
 * The returned handle satisfies `SqliteDatabase` in both runtimes.
 */
export async function openRawSqlite(path: string): Promise<SqliteDatabase> {
  if (isBun) {
    // @ts-ignore — bun:sqlite only exists at runtime under Bun
    const { Database } = await import("bun:sqlite");
    return new Database(path) as unknown as SqliteDatabase;
  } else {
    const mod = await import("better-sqlite3");
    const Database = mod.default;
    return new Database(path) as unknown as SqliteDatabase;
  }
}

// ── Factory: wrap a raw handle with the Drizzle adapter ────────────────────

type SchemaType = typeof schema;

/**
 * Wrap a raw SQLite handle with the matching Drizzle ORM adapter.
 * Returns a fully-typed Drizzle instance regardless of runtime.
 */
export async function createDrizzle(rawDb: SqliteDatabase) {
  if (isBun) {
    const { drizzle } = await import("drizzle-orm/bun-sqlite");
    // BunSQLiteDatabase and BetterSQLite3Database differ in RunResult type
    // but are structurally compatible for all query-builder operations.
    return drizzle(rawDb as never, { schema }) as unknown as DrizzleDB;
  } else {
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    return drizzle(rawDb as never, { schema }) as DrizzleDB;
  }
}

// ── Re-export a unified Drizzle DB type ────────────────────────────────────

// Both adapters ultimately produce the same query-builder shape. We pick
// BetterSQLite3Database as the canonical type because it's what the compiled
// JS uses on the server (Node.js). Bun's adapter is structurally compatible.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
export type DrizzleDB = BetterSQLite3Database<SchemaType>;
