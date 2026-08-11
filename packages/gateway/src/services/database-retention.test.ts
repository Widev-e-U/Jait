import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "bun:sqlite";
import { migrateDatabase, openDatabase, type JaitDB } from "../db/index.js";
import { ThreadService } from "./threads.js";
import {
  DatabaseRetentionService,
  loadDatabaseRetentionPolicy,
  type DatabaseRetentionPolicy,
} from "./database-retention.js";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";

function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}

describe("DatabaseRetentionService", () => {
  let db: JaitDB;
  let sqlite: Database;
  let completedThreadId: string;
  let runningThreadId: string;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  });

  afterEach(() => {
    vi.useRealTimers();
    sqlite.close();
  });

  it("reports candidates without mutating when dry-run is requested", async () => {
    const contextFlow = JSON.stringify({
      provider: "jait",
      rounds: [{ round: 1, messages: [{ role: "user", content: "x".repeat(600_000) }] }],
    });
    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("message-dry", "session-dry", "assistant", "unchanged", contextFlow, OLD);

    const service = new DatabaseRetentionService(sqlite, policy());
    const report = await service.runOnce({ dryRun: true, now: NOW });

    expect(report.candidates.oversizedContextFlows.rows).toBe(1);
    expect(report.processed.contextFlowsCompacted).toBe(0);
    const row = sqlite.prepare(
      "SELECT context_flow AS contextFlow FROM messages WHERE id = ?",
    ).get("message-dry") as { contextFlow: string };
    expect(row.contextFlow).toBe(contextFlow);
  });

  it("does not run full candidate scans during bounded mutation work", async () => {
    const service = new DatabaseRetentionService(sqlite, policy());
    const inspect = vi.spyOn(service, "inspect").mockImplementation(() => {
      throw new Error("automatic retention must not run full aggregate scans");
    });

    const report = await service.runOnce({ dryRun: false, maxBatches: 1, now: NOW });

    expect(inspect).not.toHaveBeenCalled();
    expect(report.dryRun).toBe(false);
  });

  it("compacts very large context snapshots without parsing the full JSON", async () => {
    const contextFlow = JSON.stringify({
      provider: "jait",
      rounds: [],
      padding: "x".repeat(9 * 1024 * 1024),
    });
    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("message-very-large", "session-large", "assistant", "unchanged", contextFlow, OLD);

    const service = new DatabaseRetentionService(sqlite, policy({ searchIndexCleanupEnabled: false }));
    await service.runOnce({ dryRun: false, maxBatches: 1, now: NOW });

    const row = sqlite.prepare(
      "SELECT context_flow AS contextFlow FROM messages WHERE id = ?",
    ).get("message-very-large") as { contextFlow: string };
    expect(JSON.parse(row.contextFlow)).toMatchObject({
      provider: "unknown",
      rounds: [],
      retentionCompacted: true,
      truncatedBytes: Buffer.byteLength(contextFlow, "utf8"),
    });
  });

  it("compacts old blobs, deletes only known transient rows, and preserves core records", async () => {
    const contextFlow = JSON.stringify({
      provider: "jait",
      model: "test-model",
      rounds: [{
        round: 1,
        createdAt: OLD,
        messages: [{ role: "user", content: "x".repeat(600_000) }],
        metrics: { completionTokens: 42 },
      }],
      memory: { injectedIds: ["memory-1"] },
    });
    const toolCalls = JSON.stringify([{
      callId: "call-1",
      tool: "terminal.run",
      args: { command: "echo ok", padding: "a".repeat(100_000) },
      ok: true,
      message: "done",
      data: { output: "b".repeat(600_000) },
      startedAt: 1,
      completedAt: 2,
      retryCount: 1,
    }]);

    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, tool_calls, segments, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "message-old",
      "session-old",
      "assistant",
      "searchable retained message",
      toolCalls,
      JSON.stringify([{ type: "text", content: "segment stays" }]),
      contextFlow,
      OLD,
    );
    sqlite.prepare(
      `INSERT INTO message_context_metadata (message_id, has_memory_provenance)
       VALUES (?, 1)`,
    ).run("message-old");

    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("message-recent", "session-recent", "assistant", "recent content", contextFlow, RECENT);

    const insertActivity = sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertActivity.run(
      "transient-old",
      completedThreadId,
      "codex/event/exec_command_output_delta",
      "old stream chunk",
      JSON.stringify({ delta: "x".repeat(10_000) }),
      OLD,
    );
    insertActivity.run(
      "transient-running",
      runningThreadId,
      "thinking",
      "active stream chunk",
      JSON.stringify({ delta: "keep" }),
      OLD,
    );
    insertActivity.run(
      "unknown-old",
      completedThreadId,
      "future/meaningful.delta",
      "unknown kind remains",
      JSON.stringify({ data: "y".repeat(600_000) }),
      OLD,
    );
    insertActivity.run(
      "durable-old",
      completedThreadId,
      "tool.result",
      "result " + "z".repeat(20_000),
      JSON.stringify({ data: "z".repeat(600_000) }),
      OLD,
    );

    sqlite.prepare(
      `INSERT INTO audit_log
       (id, timestamp, action_id, action_type, tool_name, inputs, outputs, side_effects, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "audit-old",
      OLD,
      "action-old",
      "tool_call",
      "terminal.run",
      JSON.stringify({ command: "x".repeat(10_000) }),
      JSON.stringify({ output: "y".repeat(10_000) }),
      JSON.stringify({ changed: true }),
      "executed",
    );

    const service = new DatabaseRetentionService(sqlite, policy());
    const report = await service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });

    expect(report.errors).toEqual([]);
    expect(report.processed.contextFlowsCompacted).toBeGreaterThanOrEqual(2);
    expect(report.processed.toolCallsCompacted).toBe(1);
    expect(report.processed.transientActivitiesDeleted).toBe(1);
    expect(report.processed.auditPayloadsCleared).toBe(1);

    const message = sqlite.prepare(
      `SELECT role, content, segments, context_flow AS contextFlow, tool_calls AS toolCalls
       FROM messages WHERE id = ?`,
    ).get("message-old") as {
      role: string;
      content: string;
      segments: string;
      contextFlow: string;
      toolCalls: string;
    };
    expect(message).toMatchObject({
      role: "assistant",
      content: "searchable retained message",
      segments: JSON.stringify([{ type: "text", content: "segment stays" }]),
    });
    expect(JSON.parse(message.contextFlow)).toMatchObject({
      provider: "jait",
      model: "test-model",
      retentionCompacted: true,
      rounds: [{ round: 1, messages: [], metrics: { completionTokens: 42 } }],
    });
    const retainedCalls = JSON.parse(message.toolCalls) as Array<Record<string, unknown>>;
    expect(Array.isArray(retainedCalls)).toBe(true);
    expect(retainedCalls[0]).toMatchObject({
      callId: "call-1",
      tool: "terminal.run",
      ok: true,
      startedAt: 1,
      completedAt: 2,
      retryCount: 1,
      storageCompacted: true,
    });
    expect(Buffer.byteLength(message.toolCalls, "utf8")).toBeLessThanOrEqual(64_000);

    expect(sqlite.prepare(
      "SELECT has_memory_provenance AS value FROM message_context_metadata WHERE message_id = ?",
    ).get("message-old")).toMatchObject({ value: 1 });
    expect(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM messages_fts WHERE messages_fts MATCH 'searchable'",
    ).get()).toMatchObject({ count: 1 });

    expect(sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'transient-old'",
    ).get()).toBeUndefined();
    expect(sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'transient-running'",
    ).get()).toMatchObject({ id: "transient-running" });
    expect(sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'unknown-old'",
    ).get()).toMatchObject({ id: "unknown-old" });
    const durable = sqlite.prepare(
      "SELECT summary, payload FROM agent_thread_activities WHERE id = 'durable-old'",
    ).get() as { summary: string; payload: string };
    expect(Buffer.byteLength(durable.summary, "utf8")).toBeLessThanOrEqual(8_000);
    expect(Buffer.byteLength(durable.payload, "utf8")).toBeLessThanOrEqual(64_000);

    expect(sqlite.prepare(
      "SELECT action_id AS actionId, inputs, outputs, side_effects AS sideEffects FROM audit_log WHERE id = ?",
    ).get("audit-old")).toMatchObject({
      actionId: "action-old",
      inputs: null,
      outputs: null,
      sideEffects: null,
    });

    const second = await service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });
    expect(Object.values(second.processed).every((count) => count === 0)).toBe(true);
  });

  it("prevents overlapping runs and retains unknown future activity kinds", async () => {
    sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "known-transient",
      completedThreadId,
      "thinking",
      "old thinking",
      JSON.stringify({ delta: "remove" }),
      OLD,
    );
    sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "unknown-transient-looking",
      completedThreadId,
      "vendor/new_chunk",
      "unknown stays",
      JSON.stringify({ delta: "keep" }),
      OLD,
    );

    const service = new DatabaseRetentionService(sqlite, policy());
    const first = service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });
    const overlapping = await service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });
    await first;

    expect(overlapping.skippedReason).toBe("already-running");
    expect(sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'unknown-transient-looking'",
    ).get()).toMatchObject({ id: "unknown-transient-looking" });
  });

  it("removes legacy FTS noise without deleting exact trace rows", async () => {
    sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "legacy-index-noise",
      completedThreadId,
      "context_flow",
      "legacy searchable noise",
      JSON.stringify({ marker: "legacyftspollution" }),
      OLD,
    );
    sqlite.exec(`
      INSERT INTO agent_thread_activities_fts(
        rowid, body, kind, thread_id, activity_id, created_at
      )
      SELECT rowid, summary || ' ' || payload, kind, thread_id, id, created_at
      FROM agent_thread_activities
      WHERE id = 'legacy-index-noise'
    `);

    const service = new DatabaseRetentionService(sqlite, policy({
      enabled: false,
      searchIndexCleanupEnabled: true,
    }));
    const report = await service.runOnce({ dryRun: false, maxBatches: 10, now: NOW });

    expect(report.processed.searchIndexRowsRemoved).toBe(1);
    expect(sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'legacy-index-noise'",
    ).get()).toMatchObject({ id: "legacy-index-noise" });
    expect(sqlite.prepare(
      "SELECT rowid FROM agent_thread_activities_fts WHERE activity_id = 'legacy-index-noise'",
    ).get()).toBeUndefined();
  });

  it("loads conservative opt-in defaults from environment", () => {
    expect(loadDatabaseRetentionPolicy({})).toMatchObject({
      enabled: false,
      searchIndexCleanupEnabled: true,
      contextFlowDays: 90,
      toolDetailDays: 90,
      transientActivityDays: 14,
      auditPayloadDays: 90,
      auditRowDays: null,
    });
    expect(loadDatabaseRetentionPolicy({
      JAIT_RETENTION_ENABLED: "true",
      JAIT_RETENTION_AUDIT_ROW_DAYS: "365",
      JAIT_RETENTION_CONTEXT_FLOW_DAYS: "0",
    })).toMatchObject({
      enabled: true,
      auditRowDays: 365,
      contextFlowDays: null,
    });
  });

  it("schedules only once and can be stopped before the database closes", () => {
    vi.useFakeTimers();
    const service = new DatabaseRetentionService(sqlite, policy());

    expect(service.start()).toBe(true);
    expect(service.start()).toBe(false);
    service.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
