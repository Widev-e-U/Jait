import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "bun:sqlite";
import { migrateDatabase, openDatabase, type JaitDB } from "../db/index.js";
import { ThreadService } from "./threads.js";

describe("ThreadService activity persistence", () => {
  let db: JaitDB;
  let sqlite: Database;
  let service: ThreadService;
  let threadId: string;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    service = new ThreadService(db);
    threadId = service.create({
      title: "Persistence bounds",
      providerId: "codex",
    }).id;
  });

  afterEach(() => {
    sqlite.close();
  });

  it("bounds persisted summaries and payloads", () => {
    const activity = service.addActivity(
      threadId,
      "tool.result",
      "🙂".repeat(10_000),
      { output: "x".repeat(1_000_000) },
    );

    const row = sqlite.prepare(
      "SELECT summary, payload FROM agent_thread_activities WHERE id = ?",
    ).get(activity.id) as { summary: string; payload: string };

    expect(Buffer.byteLength(row.summary, "utf8")).toBeLessThanOrEqual(8_000);
    expect(Buffer.byteLength(row.payload, "utf8")).toBeLessThanOrEqual(512_000);
    expect(JSON.parse(row.payload)).toBeTruthy();
  });

  it("broadcasts reconstructible deltas without persisting them", () => {
    const activity = service.logProviderEvent(threadId, {
      type: "activity",
      sessionId: "provider-session",
      kind: "codex/event/exec_command_output_delta",
      summary: "streamed output",
      payload: { delta: "hello" },
    });

    expect(activity).toMatchObject({
      threadId,
      kind: "codex/event/exec_command_output_delta",
      summary: "streamed output",
      payload: { delta: "hello" },
    });
    const row = sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = ?",
    ).get(activity!.id);
    expect(row).toBeUndefined();
  });

  it("persists only the latest context-flow snapshot when a turn completes", () => {
    const first = service.logProviderEvent(threadId, {
      type: "activity",
      sessionId: "provider-session",
      kind: "context_flow",
      summary: "Round 1 context",
      payload: { provider: "jait", rounds: [{ round: 1 }] },
    });
    const second = service.logProviderEvent(threadId, {
      type: "activity",
      sessionId: "provider-session",
      kind: "context_flow",
      summary: "Round 2 context",
      payload: { provider: "jait", rounds: [{ round: 1 }, { round: 2 }] },
    });

    expect(first?.payload).toMatchObject({ rounds: [{ round: 1 }] });
    expect(second?.payload).toMatchObject({ rounds: [{ round: 1 }, { round: 2 }] });
    expect(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM agent_thread_activities WHERE kind = 'context_flow'",
    ).get()).toMatchObject({ count: 0 });

    service.logProviderEvent(threadId, {
      type: "turn.completed",
      sessionId: "provider-session",
    });

    const rows = sqlite.prepare(
      "SELECT payload FROM agent_thread_activities WHERE kind = 'context_flow'",
    ).all() as Array<{ payload: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({
      provider: "jait",
      rounds: [{ round: 1 }, { round: 2 }],
    });
  });

  it("persists final provider results within the payload ceiling", () => {
    const activity = service.logProviderEvent(threadId, {
      type: "tool.result",
      sessionId: "provider-session",
      tool: "terminal.run",
      ok: true,
      message: "done",
      data: { output: "x".repeat(1_000_000) },
    });

    const row = sqlite.prepare(
      "SELECT payload FROM agent_thread_activities WHERE id = ?",
    ).get(activity!.id) as { payload: string };

    expect(Buffer.byteLength(row.payload, "utf8")).toBeLessThanOrEqual(512_000);
    expect(JSON.parse(row.payload)).toBeTruthy();
  });
});
