/**
 * Tests for Sprint 2: Database, Sessions, Audit, UUIDv7.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { SessionService } from "./services/sessions.js";
import { AuditWriter } from "./services/audit.js";
import { uuidv7 } from "./db/uuidv7.js";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";

const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
const describeDb = isBunRuntime ? describe : describe.skip;

let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;

beforeAll(async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import("drizzle-orm/bun-sqlite"));
  dbSchema = await import("./db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("./db/connection.js"));
});

function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

describe("UUIDv7", () => {
  it("generates a valid UUID format", () => {
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv7()));
    expect(ids.size).toBe(100);
  });

  it("IDs are chronologically sortable", () => {
    const id1 = uuidv7();
    // Small delay to ensure different timestamp
    const start = Date.now();
    while (Date.now() === start) {
      /* spin */
    }
    const id2 = uuidv7();
    expect(id1 < id2).toBe(true);
  });
});

describeDb("Database migration", () => {
  it("creates all tables", () => {
    const { sqlite } = makeTestDb();
    const tables = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("sessions");
    expect(names).toContain("audit_log");
    expect(names).toContain("trust_levels");
    expect(names).toContain("consent_log");
    sqlite?.close();
  });

  it("migration is idempotent (can run twice)", () => {
    if (!DatabaseCtor || !migrateDatabaseFn) throw new Error("Bun DB test dependencies are not loaded");
    const sqlite = new DatabaseCtor(":memory:");
    migrateDatabaseFn(sqlite);
    migrateDatabaseFn(sqlite); // should not throw
    sqlite.close();
  });
});

describeDb("SessionService", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  let sqlite: { close: () => void } | undefined;
  let svc: SessionService;

  beforeEach(() => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  });

  afterEach(() => {
    sqlite?.close();
  });

  it("creates a session with a unique ID", () => {
    const session = svc.create({ name: "Test Session" });
    expect(session.id).toBeTruthy();
    expect(session.name).toBe("Test Session");
    expect(session.status).toBe("active");
    expect(session.createdAt).toBeTruthy();
    expect(session.lastActiveAt).toBeTruthy();
  });

  it("creates sessions with distinct IDs", () => {
    const s1 = svc.create({ name: "A" });
    const s2 = svc.create({ name: "B" });
    expect(s1.id).not.toBe(s2.id);
  });

  it("lists sessions (newest first)", async () => {
    svc.create({ name: "First" });
    // Ensure distinct timestamps — wait 5ms
    await new Promise((r) => setTimeout(r, 5));
    svc.create({ name: "Second" });
    const list = svc.list();
    expect(list.length).toBe(2);
    // Most recent should come first
    expect(list[0]!.name).toBe("Second");
  });

  it("filters by status", () => {
    const s = svc.create({ name: "To archive" });
    svc.archive(s.id);
    expect(svc.list("active").length).toBe(0);
    expect(svc.list("archived").length).toBe(1);
  });

  it("getById returns session or undefined", () => {
    const s = svc.create({ name: "Find me" });
    expect(svc.getById(s.id)?.name).toBe("Find me");
    expect(svc.getById("nonexistent")).toBeUndefined();
  });

  it("touch updates lastActiveAt", () => {
    const s = svc.create({ name: "Touch me" });
    const originalTime = s.lastActiveAt;
    // Wait 1ms to ensure different timestamp
    const start = Date.now();
    while (Date.now() === start) {
      /* spin */
    }
    svc.touch(s.id);
    const updated = svc.getById(s.id)!;
    expect(updated.lastActiveAt).not.toBe(originalTime);
  });

  it("delete soft-deletes", () => {
    const s = svc.create({ name: "Delete me" });
    svc.delete(s.id);
    const deleted = svc.getById(s.id)!;
    expect(deleted.status).toBe("deleted");
  });

  it("update changes name", () => {
    const s = svc.create({ name: "Old" });
    svc.update(s.id, { name: "New" });
    expect(svc.getById(s.id)!.name).toBe("New");
  });
});

describeDb("AuditWriter", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  let sqlite: { close: () => void } | undefined;
  let audit: AuditWriter;

  beforeEach(() => {
    ({ db, sqlite } = makeTestDb());
    audit = new AuditWriter(db);
  });

  afterEach(() => {
    sqlite?.close();
  });

  it("writes an audit entry and returns its ID", () => {
    const id = audit.write({
      sessionId: "sess-1",
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "terminal.run",
      inputs: { command: "ls" },
      status: "executed",
    });
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });

  it("hasAction returns true for existing action", () => {
    const actionId = uuidv7();
    audit.write({
      actionId,
      actionType: "tool_call",
      status: "executed",
    });
    expect(audit.hasAction(actionId)).toBe(true);
    expect(audit.hasAction("nonexistent")).toBe(false);
  });

  it("enforces idempotency (duplicate actionId rejects)", () => {
    const actionId = uuidv7();
    audit.write({ actionId, actionType: "tool_call", status: "executed" });
    expect(() =>
      audit.write({ actionId, actionType: "tool_call", status: "executed" }),
    ).toThrow();
  });

  it("getBySession returns entries for that session only", () => {
    audit.write({
      sessionId: "sess-A",
      actionId: uuidv7(),
      actionType: "tool_call",
      status: "executed",
    });
    audit.write({
      sessionId: "sess-B",
      actionId: uuidv7(),
      actionType: "tool_call",
      status: "executed",
    });
    audit.write({
      sessionId: "sess-A",
      actionId: uuidv7(),
      actionType: "message",
      status: "executed",
    });

    const entriesA = audit.getBySession("sess-A");
    expect(entriesA.length).toBe(2);
    for (const e of entriesA) {
      expect(e.sessionId).toBe("sess-A");
    }

    const entriesB = audit.getBySession("sess-B");
    expect(entriesB.length).toBe(1);
  });

  it("stores and retrieves JSON inputs/outputs", () => {
    const actionId = uuidv7();
    audit.write({
      actionId,
      actionType: "tool_call",
      toolName: "file.write",
      inputs: { path: "/tmp/test.txt", content: "hello" },
      outputs: { bytesWritten: 5 },
      status: "executed",
    });

    const entries = audit.getAll();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(JSON.parse(entry.inputs!)).toEqual({
      path: "/tmp/test.txt",
      content: "hello",
    });
    expect(JSON.parse(entry.outputs!)).toEqual({ bytesWritten: 5 });
  });
});

describeDb("Session REST routes (with DB)", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let svc: SessionService;
  let audit: AuditWriter;
  let sqlite: { close: () => void } | undefined;

  beforeEach(async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      sessionService: svc,
      audit,
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite?.close();
  });

  it("POST /api/sessions creates a new session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "My Project" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("My Project");
    expect(body.status).toBe("active");
  });

  it("GET /api/sessions lists sessions", async () => {
    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Session 1" },
    });
    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Session 2" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessions.length).toBe(2);
  });

  it("GET /api/sessions?status=active filters", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Active" },
    });
    const session = JSON.parse(createRes.body);

    // Archive it
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/archive`,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions?status=active",
    });
    const body = JSON.parse(res.body);
    expect(body.sessions.length).toBe(0);
  });

  it("GET /api/sessions/:id returns session", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Find me" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe("Find me");
  });

  it("GET /api/sessions/:id returns 404 for unknown", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/nonexistent-id",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH /api/sessions/:id updates name", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Old name" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/sessions/${session.id}`,
      payload: { name: "New name" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe("New name");
  });

  it("DELETE /api/sessions/:id soft-deletes", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Delete me" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/sessions/${session.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    // Session should be deleted status
    const getRes = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}`,
    });
    expect(JSON.parse(getRes.body).status).toBe("deleted");
  });

  it("session creation is audited", async () => {
    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Audited" },
    });

    const entries = audit.getAll();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.actionType === "session.create")).toBe(true);
  });

  it("session deletion is audited", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "To delete" },
    });
    const session = JSON.parse(createRes.body);

    await app.inject({
      method: "DELETE",
      url: `/api/sessions/${session.id}`,
    });

    const entries = audit.getAll();
    expect(entries.some((e) => e.actionType === "session.delete")).toBe(true);
  });

  // Self-control tools
  it("GET /api/tools/sessions.list returns active sessions", async () => {
    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Active" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/tools/sessions.list",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessions.length).toBe(1);
    expect(body.sessions[0].name).toBe("Active");
  });

  it("GET /api/tools/sessions.status returns session info", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Check status" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "GET",
      url: `/api/tools/sessions.status?sessionId=${session.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe("Check status");
  });

  it("GET /api/tools/sessions.status requires sessionId param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tools/sessions.status",
    });
    expect(res.statusCode).toBe(400);
  });
});

describeDb("Session isolation — audit entries per session", () => {
  it("tool calls in session A don't appear in session B", () => {
    const { db, sqlite } = makeTestDb();
    const sessionSvc = new SessionService(db);
    const audit = new AuditWriter(db);

    const sessA = sessionSvc.create({ name: "Project A" });
    const sessB = sessionSvc.create({ name: "Project B" });

    // Log tool calls to session A
    audit.write({
      sessionId: sessA.id,
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "terminal.run",
      inputs: { command: "npm install" },
      status: "executed",
    });
    audit.write({
      sessionId: sessA.id,
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "file.write",
      inputs: { path: "index.ts" },
      status: "executed",
    });

    // Log tool call to session B
    audit.write({
      sessionId: sessB.id,
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "browser.navigate",
      inputs: { url: "https://example.com" },
      status: "executed",
    });

    // Verify isolation
    const entriesA = audit.getBySession(sessA.id);
    const entriesB = audit.getBySession(sessB.id);

    expect(entriesA.length).toBe(2);
    expect(entriesB.length).toBe(1);

    // No cross-contamination
    expect(entriesA.every((e) => e.sessionId === sessA.id)).toBe(true);
    expect(entriesB.every((e) => e.sessionId === sessB.id)).toBe(true);
    expect(entriesB[0]!.toolName).toBe("browser.navigate");

    sqlite?.close();
  });
});
