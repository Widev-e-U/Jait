/**
 * SQLite connection via bun:sqlite + Drizzle ORM.
 *
 * Database lives at ~/.jait/data/jait.db (created automatically).
 * For tests, pass ":memory:" as dbPath.
 */
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type JaitDB = BunSQLiteDatabase<typeof schema>;

/** Resolve the default DB path: ~/.jait/data/jait.db */
export function defaultDbPath(): string {
  return join(homedir(), ".jait", "data", "jait.db");
}

/**
 * Open (or create) the SQLite database and run table creation.
 *
 * @param dbPath  File path for the SQLite DB, or ":memory:" for tests.
 * @returns { db, sqlite } — drizzle instance + raw bun:sqlite handle
 */
export function openDatabase(dbPath?: string) {
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
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

/**
 * Run DDL to create all tables if they don't already exist.
 * Uses raw SQL so we don't need drizzle-kit push in production.
 */
export function migrateDatabase(sqlite: Database) {
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      workspace_path TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      metadata TEXT
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      session_id TEXT,
      surface_type TEXT,
      device_id TEXT,
      action_id TEXT UNIQUE,
      action_type TEXT,
      tool_name TEXT,
      inputs TEXT,
      outputs TEXT,
      side_effects TEXT,
      signature TEXT,
      parent_action_id TEXT,
      status TEXT,
      consent_method TEXT
    )
  `);

  // Indexes for audit_log
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_action_id ON audit_log(action_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id, timestamp DESC)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_surface ON audit_log(surface_type, timestamp DESC)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_device ON audit_log(device_id, timestamp DESC)`);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS trust_levels (
      action_type TEXT PRIMARY KEY,
      approved_count INTEGER DEFAULT 0,
      reverted_count INTEGER DEFAULT 0,
      current_level INTEGER DEFAULT 0
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS consent_log (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      decision TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      decided_via TEXT
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS consent_session_approvals (
      session_id TEXT PRIMARY KEY,
      approve_all INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )
  `);


  sqlite.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_surface TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT
    )
  `);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope, created_at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at)`);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      created_at TEXT NOT NULL
    )
  `);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)`);

  // Migration: add tool_calls column if table already existed without it
  try {
    sqlite.run(`ALTER TABLE messages ADD COLUMN tool_calls TEXT`);
  } catch {
    // column already exists — ignore
  }
}
