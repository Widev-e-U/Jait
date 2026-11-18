import { describe, expect, it } from "vitest";
import { isValidCronExpression } from "./cron.js";
import { matchesCronMinute, SchedulerService } from "./service.js";
import { migrateDatabase, openDatabase } from "../db/index.js";

describe("cron validation", () => {
  it.each(["* * * * *", "0 9 * * 1", "*/15 * * * *", "0,15,30,45 0-23 1-31 1-12 0-6", "  0\t9 * * 1  "])("accepts supported schedule %s", (cron) => {
    expect(isValidCronExpression(cron)).toBe(true);
  });

  it.each(["", "not-a-cron", "* * * *", "* * * * * *", "60 * * * *", "0 24 * * *", "0 9 0 * *", "0 9 * 13 *", "0 9 * * 7", "*/0 * * * *", "*/2junk * * * *", "0junk 9 * * *", "30-10 * * * *", "0, * * * *", "0-60 * * * *", "MON * * * *", "0-59/2 * * * *"])("rejects malformed or unsupported schedule %s", (cron) => {
    expect(isValidCronExpression(cron)).toBe(false);
  });

  it("malformed legacy schedules never match a minute by partial number parsing", () => {
    expect(matchesCronMinute("0junk 9 * * *", new Date("2026-10-13T09:00:00Z"))).toBe(false);
    expect(matchesCronMinute("*/2junk 9 * * *", new Date("2026-10-13T09:00:00Z"))).toBe(false);
  });

  it("rejects invalid create and update calls before changing stored jobs", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const scheduler = new SchedulerService({ db, executeTool: async () => ({ ok: true }) });
    try {
      expect(() => scheduler.create({ name: "Invalid health review", cron: "not-a-cron", toolName: "gateway.status" })).toThrow(/cron/i);
      expect(scheduler.list()).toHaveLength(0);
      const job = scheduler.create({ name: "Weekly health review", cron: "0 9 * * 1", toolName: "gateway.status", enabled: false });
      expect(() => scheduler.update(job.id, { name: "Changed", cron: "not-a-cron" })).toThrow(/cron/i);
      expect(scheduler.get(job.id)).toMatchObject({ name: "Weekly health review", cron: "0 9 * * 1", enabled: false });
    } finally { sqlite.close(); }
  });
});
