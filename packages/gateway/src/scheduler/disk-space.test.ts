import { describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { SchedulerService } from "./service.js";

describe("scheduler disk preflight", () => {
  it("does not launch jobs if the preflight cannot persist a pause", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const executeTool = vi.fn(async () => ({ ok: true, message: "done" }));
    const scheduler = new SchedulerService({
      db, executeTool,
      beforeTick: async () => { throw new Error("database or disk I/O failed"); },
    });
    scheduler.create({ name: "agent", cron: "* * * * *", toolName: "agent.spawn" });
    await expect(scheduler.tick()).rejects.toThrow("database or disk I/O failed");
    expect(executeTool).not.toHaveBeenCalled();
    sqlite.close();
  });

  it("pauses an agent before launching it in the same tick", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const executeTool = vi.fn(async () => ({ ok: true, message: "done" }));
    let scheduler: SchedulerService;
    scheduler = new SchedulerService({
      db, executeTool,
      beforeTick: async () => {
        const agent = scheduler.list().find((job) => job.name === "agent")!;
        scheduler.update(agent.id, { enabled: false });
      },
    });
    const agent = scheduler.create({
      name: "agent", cron: "* * * * *", toolName: "thread.control",
      input: { __jaitJobMeta: { jobType: "agent_task" } },
    });
    scheduler.create({ name: "network", cron: "* * * * *", toolName: "network.scan" });
    await scheduler.tick(new Date("2026-10-02T14:00:00Z"));
    expect(scheduler.get(agent.id)?.enabled).toBe(false);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls[0]?.[0]).toMatchObject({ toolName: "network.scan" });
    sqlite.close();
  });
});
