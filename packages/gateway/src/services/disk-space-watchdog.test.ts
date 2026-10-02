import { describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { SchedulerService } from "../scheduler/service.js";
import { DiskSpaceWatchdog } from "./disk-space-watchdog.js";

async function setup(usage: number, inodeUsage = 10) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const scheduler = new SchedulerService({ db, executeTool: async () => ({ ok: true, message: "done" }) });
  const agent = scheduler.create({
    name: "audit", cron: "* * * * *", toolName: "thread.control", projectRoot: "/project",
    input: { prompt: "Keep me", __jaitJobMeta: { jobType: "agent_task", model: "keep-model" } },
  });
  const network = scheduler.create({ name: "network", cron: "* * * * *", toolName: "network.scan" });
  const disabled = scheduler.create({ name: "disabled", cron: "* * * * *", toolName: "agent.spawn", enabled: false });
  const notifications = { warning: vi.fn(), error: vi.fn() };
  const readDisk = vi.fn(async () => ({ blocks: 100, bavail: 100 - usage, files: 100, ffree: 100 - inodeUsage }));
  const watchdog = new DiskSpaceWatchdog(scheduler, notifications, readDisk, ["/storage", "/tmp"]);
  return { sqlite, scheduler, agent, network, disabled, notifications, readDisk, watchdog };
}

describe("DiskSpaceWatchdog", () => {
  it("warns once at 80% without pausing jobs", async () => {
    const s = await setup(80);
    await s.watchdog.check();
    await s.watchdog.check();
    expect(s.scheduler.get(s.agent.id)?.enabled).toBe(true);
    expect(s.notifications.warning).toHaveBeenCalledTimes(3); // storage, temp, project
    expect(s.notifications.error).not.toHaveBeenCalled();
    s.sqlite.close();
  });

  it("pauses only agents at 90%, persists the reason, and never auto-resumes", async () => {
    const s = await setup(90);
    await s.watchdog.check();
    expect(s.scheduler.get(s.agent.id)).toMatchObject({
      enabled: false, input: { prompt: "Keep me", __jaitJobMeta: { model: "keep-model", diskSpacePausedAt: expect.any(String) } },
    });
    expect(s.scheduler.get(s.network.id)?.enabled).toBe(true);
    s.readDisk.mockResolvedValue({ blocks: 100, bavail: 80, files: 100, ffree: 90 });
    await s.watchdog.check();
    expect(s.scheduler.get(s.agent.id)?.enabled).toBe(false);
    expect(s.scheduler.get(s.disabled.id)?.enabled).toBe(false);
    s.sqlite.close();
  });

  it("protects against inode exhaustion even with free bytes", async () => {
    const s = await setup(20, 95);
    await s.watchdog.check();
    expect(s.scheduler.get(s.agent.id)?.enabled).toBe(false);
    s.sqlite.close();
  });

  it("checks remaining mounts after one mount fails and suppresses repeated errors", async () => {
    const s = await setup(20);
    s.readDisk.mockImplementation(async (path) => {
      if (path === "/storage") throw new Error("EIO");
      return { blocks: 100, bavail: 5, files: 100, ffree: 90 };
    });
    await s.watchdog.check();
    await s.watchdog.check();
    expect(s.notifications.warning).toHaveBeenCalledTimes(1);
    expect(s.scheduler.get(s.agent.id)?.enabled).toBe(false);
    s.sqlite.close();
  });

  it("pauses only jobs on the full project mount when gateway storage is healthy", async () => {
    const s = await setup(20);
    const other = s.scheduler.create({ name: "other", cron: "* * * * *", toolName: "agent.spawn", projectRoot: "/other" });
    s.readDisk.mockImplementation(async (path) => ({ blocks: 100, bavail: path === "/project" ? 4 : 80, files: 0, ffree: 0 }));
    await s.watchdog.check();
    expect(s.scheduler.get(s.agent.id)?.enabled).toBe(false);
    expect(s.scheduler.get(other.id)?.enabled).toBe(true);
    s.sqlite.close();
  });
});
