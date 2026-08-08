import { describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { isOneShotJob, SchedulerService } from "./service.js";

async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}

/** A one-off reminder as `channel.remind` writes it: a yearly cron plus a flag. */
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}

describe("one-shot jobs", () => {
  it("recognises the flag, and only the flag", () => {
    expect(isOneShotJob(oneShotInput())).toBe(true);
    expect(isOneShotJob({ __jaitJobMeta: { jobType: "channel_reminder" } })).toBe(false);
    expect(isOneShotJob({ once: true })).toBe(false);
    expect(isOneShotJob(null)).toBe(false);
  });

  it("deletes itself once it has delivered — a spent reminder is clutter", async () => {
    const { scheduler: s } = await scheduler();
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    await s.trigger(job.id, undefined, new Date("2026-08-09T03:00:00Z"), "schedule");

    expect(s.get(job.id)).toBeNull();
    expect(s.list()).toHaveLength(0);
    // The run row went with it — nothing can join it back to a name.
    expect(s.listRuns(job.id)).toHaveLength(0);
  });

  it("stays disarmed after a failed delivery, rather than firing again in a year", async () => {
    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    await expect(s.trigger(job.id, undefined, new Date("2026-08-09T03:00:00Z"), "schedule")).rejects.toThrow();

    expect(s.get(job.id)?.enabled).toBe(false);
    expect(s.listRuns(job.id)[0]).toMatchObject({ status: "failed" });
  });

  it("survives a manual run — trying a reminder must not cancel it", async () => {
    const { scheduler: s } = await scheduler();
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    await s.trigger(job.id, undefined, new Date("2026-08-08T09:00:00Z"), "manual");

    expect(s.get(job.id)?.enabled).toBe(true);
  });

  it("leaves recurring jobs armed", async () => {
    const { scheduler: s } = await scheduler();
    const job = s.create({
      name: "morning briefing",
      cron: "0 7 * * *",
      toolName: "channel.send",
      input: { channelId: "telegram", conversationId: "4242", __jaitJobMeta: { jobType: "channel_reminder" } },
    });

    await s.trigger(job.id, undefined, new Date("2026-08-09T05:00:00Z"), "schedule");

    expect(s.get(job.id)?.enabled).toBe(true);
  });

  it("fires exactly once when the clock passes it twice", async () => {
    const { scheduler: s, executeTool } = await scheduler();
    s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    // Same wall-clock minute in Vienna (05:00) on the scheduled day, ticked
    // twice as the poller would across a restart.
    await s.tick(new Date("2026-08-09T03:00:00Z"));
    await s.tick(new Date("2026-08-09T03:00:30Z"));

    expect(executeTool).toHaveBeenCalledOnce();
  });
});

describe("cleaning up spent one-shots", () => {
  /** A one-off that fired, failed, and was disarmed `hoursAgo` hours ago. */
  async function failedOneShot(hoursAgo: number) {
    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const firedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    await expect(s.trigger(job.id, undefined, firedAt, "schedule")).rejects.toThrow();
    return { scheduler: s, job };
  }

  it("keeps a recent failure around, so it can still be read", async () => {
    const { scheduler: s } = await failedOneShot(2);

    expect(s.purgeSpentOneShots()).toBe(0);
    expect(s.list()).toHaveLength(1);
  });

  it("collects it once the retention window has passed", async () => {
    const { scheduler: s, job } = await failedOneShot(30);

    expect(s.purgeSpentOneShots()).toBe(1);
    expect(s.get(job.id)).toBeNull();
    expect(s.listRuns(job.id)).toHaveLength(0);
  });

  it("leaves a one-off that has not fired yet alone, however old", async () => {
    const { scheduler: s } = await scheduler();
    // Disabled by hand before its time — the user's choice, not a spent job.
    const job = s.create({ name: "later", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    s.update(job.id, { enabled: false });

    expect(s.purgeSpentOneShots()).toBe(0);
    expect(s.get(job.id)).not.toBeNull();
  });

  it("never touches a recurring job, disabled or not", async () => {
    const { scheduler: s } = await scheduler();
    const job = s.create({
      name: "morning briefing",
      cron: "0 7 * * *",
      toolName: "channel.send",
      input: { channelId: "telegram", conversationId: "4242", __jaitJobMeta: { jobType: "channel_reminder" } },
    });
    await s.trigger(job.id, undefined, new Date(Date.now() - 72 * 60 * 60 * 1000), "schedule");
    s.update(job.id, { enabled: false });

    expect(s.purgeSpentOneShots()).toBe(0);
    expect(s.get(job.id)).not.toBeNull();
  });

  it("sweeps on the tick, but not on every tick", async () => {
    const { scheduler: s } = await failedOneShot(30);
    const now = new Date();

    await s.tick(now);
    expect(s.list()).toHaveLength(0);

    // A second spent job appearing right after must wait for the next window
    // rather than being swept by a tick a minute later.
    const job = s.create({ name: "another", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    s.update(job.id, { enabled: false });
    await s.tick(new Date(now.getTime() + 60_000));

    expect(s.get(job.id)).not.toBeNull();
  });
});
