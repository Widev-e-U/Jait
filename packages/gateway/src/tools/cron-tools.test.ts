import { describe, expect, it, vi } from "vitest";
import type { SchedulerService } from "../scheduler/service.js";
import { createCronAddTool, createCronListTool, createCronRemoveTool, createCronUpdateTool } from "./cron-tools.js";

const context = { sessionId: "cron-tests", actionId: "cron-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
function fixture() {
  const scheduler = {
    create: vi.fn().mockReturnValue({ id: "job-1" }),
    list: vi.fn().mockReturnValue([{ id: "job-1", name: "Inventory", cron: "0 8 * * *", toolName: "file.list", enabled: false }]),
    remove: vi.fn().mockReturnValue(true),
    update: vi.fn().mockReturnValue({ id: "job-1", enabled: false }),
  };
  return { scheduler, service: scheduler as unknown as SchedulerService };
}
describe("cron.add", () => {
  it("records the owner, project and normalized MCP tool name", async () => {
    const f = fixture();
    expect(await createCronAddTool(f.service).execute({ name: "Inventory", cron: "0 8 * * *", toolName: " file_list " }, context))
      .toMatchObject({ ok: true, data: { id: "job-1" } });
    expect(f.scheduler.create).toHaveBeenCalledWith({
      userId: "owner-1", name: "Inventory", cron: "0 8 * * *", toolName: "file.list",
      input: {}, sessionId: "default", projectRoot: "/project",
    });
  });
  it("surfaces rejected schedules without reporting success", async () => {
    const f = fixture();
    f.scheduler.create.mockImplementation(() => { throw new Error("Invalid cron expression"); });
    await expect(createCronAddTool(f.service).execute({ name: "Inventory", cron: "invalid", toolName: "file.list" }, context)).rejects.toThrow("Invalid cron");
  });
});
describe("cron.list", () => {
  it("lists only the caller's jobs and identifies disabled jobs", async () => {
    const f = fixture();
    const result = await createCronListTool(f.service).execute({}, context);
    expect(f.scheduler.list).toHaveBeenCalledWith("owner-1");
    expect(result.message).toContain("[disabled]");
    expect(result.data).toEqual({ jobs: f.scheduler.list.mock.results[0]!.value });
  });
});
describe("cron.remove", () => {
  it.each([true, false])("reports removal outcome %s within the caller's ownership", async (removed) => {
    const f = fixture();
    f.scheduler.remove.mockReturnValue(removed);
    expect(await createCronRemoveTool(f.service).execute({ id: "job-1" }, context)).toMatchObject({ ok: removed, data: { removed } });
    expect(f.scheduler.remove).toHaveBeenCalledWith("job-1", "owner-1");
  });
});
describe("cron.update", () => {
  it("preserves omitted fields and accepts an explicit disabled value", async () => {
    const f = fixture();
    expect((await createCronUpdateTool(f.service).execute({ id: "job-1", enabled: false }, context)).ok).toBe(true);
    expect(f.scheduler.update).toHaveBeenCalledWith("job-1", { name: undefined, cron: undefined, enabled: false, input: undefined }, "owner-1");
  });
  it("reports a missing or inaccessible job", async () => {
    const f = fixture();
    f.scheduler.update.mockReturnValue(undefined as never);
    expect(await createCronUpdateTool(f.service).execute({ id: "foreign-job" }, context)).toMatchObject({ ok: false, message: "Cron job not found" });
  });
});
