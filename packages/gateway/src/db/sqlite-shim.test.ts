/**
 * sqlite-shim tests — verify that opening a database, constructing a Drizzle
 * instance, and performing basic CRUD works without the `better-sqlite3`
 * native addon.
 *
 * These tests catch regressions like the driver.js top-level-import issue
 * where `drizzle-orm/better-sqlite3` pulls in the native package at module
 * resolution time, crashing on environments that only have `node:sqlite`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { openRawSqlite, createDrizzle, sqliteBackend } from "./sqlite-shim.js";
import type { SqliteDatabase, DrizzleDB } from "./sqlite-shim.js";
import { migrateDatabase } from "./connection.js";
import * as schema from "./schema.js";
import { eq } from "drizzle-orm";

let sqlite: SqliteDatabase;
let db: DrizzleDB;

afterEach(() => {
  try { sqlite?.close(); } catch {}
});

describe("sqlite-shim", () => {
  it("openRawSqlite returns a working in-memory database", async () => {
    sqlite = await openRawSqlite(":memory:");
    expect(sqlite).toBeDefined();
    expect(typeof sqlite.exec).toBe("function");
    expect(typeof sqlite.prepare).toBe("function");
    expect(typeof sqlite.close).toBe("function");
  });

  it("sqliteBackend reports the active engine", async () => {
    sqlite = await openRawSqlite(":memory:");
    // In the vitest environment this will be bun:sqlite (shimmed) or node:sqlite
    expect(["bun:sqlite", "node:sqlite", "better-sqlite3"]).toContain(sqliteBackend);
  });

  it("createDrizzle constructs a working Drizzle instance without better-sqlite3 driver.js", async () => {
    sqlite = await openRawSqlite(":memory:");
    // This is the critical test — createDrizzle must NOT import
    // drizzle-orm/better-sqlite3/driver.js (which top-level-imports
    // the better-sqlite3 native package).
    db = await createDrizzle(sqlite);
    expect(db).toBeDefined();
  });

  it("drizzle instance can run raw SQL via exec + prepare", async () => {
    sqlite = await openRawSqlite(":memory:");
    sqlite.exec("CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)");
    sqlite.prepare("INSERT INTO test_table (id, name) VALUES (?, ?)").run(1, "hello");
    const row = sqlite.prepare("SELECT * FROM test_table WHERE id = ?").get(1) as { id: number; name: string };
    expect(row).toMatchObject({ id: 1, name: "hello" });
  });

  it("drizzle instance can insert and query schema tables after migration", async () => {
    sqlite = await openRawSqlite(":memory:");
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
    db = await createDrizzle(sqlite);
    migrateDatabase(sqlite);

    const now = new Date().toISOString();

    // Insert a user row using Drizzle ORM
    db.insert(schema.users).values({
      id: "user-1",
      username: "testuser",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    }).run();

    // Read it back
    const rows = db.select().from(schema.users).where(eq(schema.users.id, "user-1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("testuser");
  });

  it("drizzle instance supports insert, select, update, and delete after migration", async () => {
    sqlite = await openRawSqlite(":memory:");
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
    db = await createDrizzle(sqlite);
    migrateDatabase(sqlite);

    const now = new Date().toISOString();

    // Insert a session
    db.insert(schema.sessions).values({
      id: "sess-1",
      createdAt: now,
      lastActiveAt: now,
    }).run();

    // Select it back
    const session = db.select().from(schema.sessions)
      .where(eq(schema.sessions.id, "sess-1")).get();
    expect(session).toBeDefined();
    expect(session!.id).toBe("sess-1");

    // Insert messages referencing the session
    db.insert(schema.messages).values({
      id: "msg-1",
      sessionId: "sess-1",
      role: "user",
      content: "Hello world",
      createdAt: now,
    }).run();

    const msgs = db.select().from(schema.messages)
      .where(eq(schema.messages.sessionId, "sess-1")).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("Hello world");

    // Update
    db.update(schema.sessions)
      .set({ lastActiveAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, "sess-1")).run();

    // Delete
    db.delete(schema.messages).where(eq(schema.messages.id, "msg-1")).run();
    const deleted = db.select().from(schema.messages)
      .where(eq(schema.messages.id, "msg-1")).get();
    expect(deleted).toBeUndefined();
  });

  it("openDatabase round-trip works end-to-end", async () => {
    // Use the high-level openDatabase which chains openRawSqlite + createDrizzle
    const { openDatabase } = await import("./connection.js");
    const result = await openDatabase(":memory:");
    sqlite = result.sqlite;
    db = result.db;

    migrateDatabase(sqlite);

    const now = new Date().toISOString();

    // Verify the complete pipeline works
    db.insert(schema.users).values({
      id: "user-1",
      username: "testuser",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    }).run();

    const user = db.select().from(schema.users).where(eq(schema.users.id, "user-1")).get();
    expect(user).toBeDefined();
    expect(user!.username).toBe("testuser");
  });
});
