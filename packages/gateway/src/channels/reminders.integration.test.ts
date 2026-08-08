/**
 * The whole reminder chain, end to end:
 *
 *   channel.remind → a scheduled job → the scheduler's minute tick →
 *   channel.send → ChannelManager.deliver → the connector
 *
 * Each link is unit-tested on its own; this asserts they are actually wired to
 * each other, which is the part that breaks silently when one of them is
 * renamed or its input shape drifts.
 */

import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { openRawSqlite } from "../db/sqlite-shim.js";
import { SchedulerService } from "../scheduler/service.js";
import { ToolRegistry } from "../tools/registry.js";
import { createChannelRemindTool, createChannelSendTool } from "../tools/channel-tools.js";
import { ChannelManager, type ReplyGenerator } from "./manager.js";
import type {
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelStatus,
  OutboundMessage,
} from "./types.js";
import type { LLMConfig } from "../tools/agent-loop.js";

class FakeConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  async start(events: ChannelConnectorEvents) {
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }
  status() { return this._status; }
  currentQr() { return null; }
}

const fakeLLM = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as unknown as LLMConfig;

/** Answers by echoing the prompt, so a prompted delivery is recognisable. */
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `answer: ${String(last?.content ?? "")}`;
  },
};

async function harness(now: Date) {
  const { db, sqlite: drizzleSqlite } = await openDatabase(":memory:");
  migrateDatabase(drizzleSqlite);

  const registry = new ToolRegistry();
  const scheduler = new SchedulerService({
    db,
    executeTool: ({ toolName, input, sessionId, projectRoot, userId }) =>
      registry.execute(toolName, input, {
        sessionId,
        actionId: "scheduled",
        projectRoot,
        requestedBy: "scheduler",
        ...(userId ? { userId } : {}),
      }),
  });

  const manager = new ChannelManager({
    sqlite: await openRawSqlite(":memory:"),
    resolveLLM: () => fakeLLM,
    replyGenerator: echoGenerator,
    log: () => {},
  });
  const connector = new FakeConnector();
  manager.register(connector);
  await manager.start("telegram");

  const deps = {
    channels: manager,
    scheduler,
    defaultTimeZone: () => "Europe/Vienna",
    now: () => now,
  };
  registry.register(createChannelSendTool(deps));
  registry.register(createChannelRemindTool(deps));

  return { registry, scheduler, manager, connector };
}

const NOW = new Date("2026-08-08T09:00:00Z"); // 11:00 in Vienna

const CHANNEL_SESSION = {
  sessionId: "channel:telegram:4242",
  actionId: "a1",
  projectRoot: "/tmp",
  requestedBy: "channel:telegram",
};

describe("a reminder from asking to arriving", () => {
  it("delivers at the minute the user named, then clears itself away", async () => {
    const { registry, scheduler, connector } = await harness(NOW);

    const scheduled = await registry.execute(
      "channel.remind",
      { at: "2026-08-09T05:00", text: "Anlage prüfen" },
      CHANNEL_SESSION,
    );
    expect(scheduled.ok).toBe(true);
    expect(scheduler.list()).toHaveLength(1);

    // 04:59 Vienna the next morning — one minute early, nothing yet.
    await scheduler.tick(new Date("2026-08-09T02:59:00Z"));
    expect(connector.sent).toHaveLength(0);

    // 05:00 Vienna.
    await scheduler.tick(new Date("2026-08-09T03:00:00Z"));
    expect(connector.sent.map((m) => m.text)).toEqual(["Anlage prüfen"]);
    expect(connector.sent[0]!.conversationId).toBe("4242");

    // Delivered, so it is gone — not left sitting in the list as "done".
    expect(scheduler.list()).toHaveLength(0);

    // A year later the same cron minute comes round again — and stays quiet.
    await scheduler.tick(new Date("2027-08-09T03:00:00Z"));
    expect(connector.sent).toHaveLength(1);
  });

  it("works a prompted reminder out when it fires, not when it was asked for", async () => {
    const { registry, scheduler, connector } = await harness(NOW);

    await registry.execute(
      "channel.remind",
      { at: "2026-08-09T07:00", prompt: "What is on today?" },
      CHANNEL_SESSION,
    );
    expect(connector.sent).toHaveLength(0);

    await scheduler.tick(new Date("2026-08-09T05:00:00Z"));

    expect(connector.sent.map((m) => m.text)).toEqual(["answer: What is on today?"]);
  });

  it("keeps a routine coming back", async () => {
    const { registry, scheduler, connector } = await harness(NOW);

    await registry.execute(
      "channel.remind",
      { cron: "0 7 * * *", text: "Guten Morgen" },
      CHANNEL_SESSION,
    );

    await scheduler.tick(new Date("2026-08-09T05:00:00Z"));
    await scheduler.tick(new Date("2026-08-10T05:00:00Z"));

    expect(connector.sent).toHaveLength(2);
  });

  it("keeps a failed reminder visible instead of vanishing with it", async () => {
    const { registry, scheduler, manager, connector } = await harness(NOW);
    await registry.execute("channel.remind", { at: "2026-08-09T05:00", text: "x" }, CHANNEL_SESSION);

    await manager.stop("telegram");
    await scheduler.tick(new Date("2026-08-09T03:00:00Z"));

    expect(connector.sent).toHaveLength(0);
    const job = scheduler.list()[0]!;
    expect(job.enabled).toBe(false);
    expect(scheduler.listRuns(job.id)[0]).toMatchObject({ status: "failed" });

    // Still there the next morning; collected once it is a day old.
    expect(scheduler.purgeSpentOneShots(new Date("2026-08-09T09:00:00Z"))).toBe(0);
    expect(scheduler.purgeSpentOneShots(new Date("2026-08-10T09:00:00Z"))).toBe(1);
    expect(scheduler.list()).toHaveLength(0);
  });

  it("addresses the chat it was asked in, not the last one to speak", async () => {
    const { registry, scheduler, connector } = await harness(NOW);

    await registry.execute(
      "channel.remind",
      { at: "2026-08-09T05:00", text: "for chat A" },
      { ...CHANNEL_SESSION, sessionId: "channel:telegram:chat-A" },
    );
    await registry.execute(
      "channel.remind",
      { at: "2026-08-09T06:00", text: "for chat B" },
      { ...CHANNEL_SESSION, sessionId: "channel:telegram:chat-B" },
    );

    await scheduler.tick(new Date("2026-08-09T03:00:00Z"));
    await scheduler.tick(new Date("2026-08-09T04:00:00Z"));

    expect(connector.sent).toEqual([
      { conversationId: "chat-A", text: "for chat A" },
      { conversationId: "chat-B", text: "for chat B" },
    ]);
  });
});
