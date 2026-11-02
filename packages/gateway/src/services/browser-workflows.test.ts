import { afterEach, describe, expect, it, vi } from "vitest";
import { browserWorkflowSchema, type BrowserWorkflowDefinition } from "@jait/shared";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { browserWorkflowRuns } from "../db/schema.js";
import { createBrowserWorkflowTools } from "../tools/browser-workflow-tools.js";
import { BrowserWorkflowService } from "./browser-workflows.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";

const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
afterEach(() => { for (const close of closers.splice(0)) close(); });
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}

describe("saved browser workflows", () => {
  it("validates references, action arguments and version", () => {
    expect(browserWorkflowSchema.safeParse(definition).success).toBe(true);
    for (const patch of [
      { formatVersion: 2 }, { inputs: [definition.inputs[0], definition.inputs[0]] },
      { steps: [{ action: "execute", label: "Code", script: "alert(1)" }] },
      { steps: [{ action: "open", label: "Open", url: "https://example.com", browserId: "other-chat" }] },
      { steps: [{ action: "open", label: "Open", url: "{{unknown}}" }] },
      { steps: [{ action: "click", label: "Click", selector: "#submit" }] },
      { steps: [...definition.steps, { action: "wait", label: "Wait", selector: "body", timeoutMs: 999999 }] },
    ]) expect(browserWorkflowSchema.safeParse({ ...definition, ...patch }).success).toBe(false);
  });

  it("persists definitions and enforces owner/project and revision checks", async () => {
    const { service, saved } = await fixture();
    expect(service.get(saved.id, context)).toEqual(saved);
    expect(service.list({ ...context, userId: "other" })).toEqual([]);
    expect(service.list({ ...context, projectRoot: "/other" })).toEqual([]);
    expect(() => service.get(saved.id, { ...context, userId: "other" })).toThrow("not found");
    expect(() => service.save(definition, context, saved.id, 9)).toThrow("changed");
    expect(service.save({ ...definition, name: "Updated" }, context, saved.id, 1).revision).toBe(2);
  });

  it("uses the gateway executor sequentially and preserves session context and progress events", async () => {
    const { service, saved, execute, db } = await fixture();
    const onNestedEvent = vi.fn();
    const result = await service.run(saved.id, { month: "literal {{month}} $()" }, { ...context, onNestedEvent }, 1);
    expect(result.ok).toBe(true);
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.open", "browser.type", "browser.wait"]);
    expect(execute.mock.calls[1]?.[1]).toEqual({ selector: "#month", text: "literal {{month}} $()" });
    expect(execute.mock.calls[1]?.[2]).toMatchObject({ sessionId: context.sessionId, userId: context.userId, projectRoot: context.projectRoot });
    expect(onNestedEvent).toHaveBeenCalledTimes(6);
    expect(service.listRuns(context)[0]).toMatchObject({ status: "succeeded", nextStep: 3, revision: 1 });
    expect(JSON.stringify(db.select().from(browserWorkflowRuns).all())).not.toContain("literal {{month}}");
  });

  it("rejects invalid inputs, changed revisions and unsafe URL schemes before effects", async () => {
    const { service, saved, execute } = await fixture();
    await expect(service.run(saved.id, { unexpected: "x" }, context, 1)).rejects.toThrow("Unknown input");
    await expect(service.run(saved.id, {}, context, 2)).rejects.toThrow("revision");
    const required = service.save({ ...definition, inputs: [{ name: "month", description: "Month" }] }, context);
    await expect(service.run(required.id, {}, context, 1)).rejects.toThrow("Provide input");
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.com"]) {
      const unsafe = service.save({ ...definition, steps: [{ action: "open", label: "Open", url }] }, context);
      await expect(service.run(unsafe.id, {}, context, 1)).rejects.toThrow("HTTP(S)");
    }
    expect(execute).not.toHaveBeenCalled();
    expect(service.listRuns(context)).toEqual([]);
  });

  it("stops on failed actions and never retries or stores raw errors", async () => {
    const { service, saved, execute } = await fixture(async name => {
      if (name === "browser.type") throw new Error("secret page text");
      return { ok: true, message: "done" };
    });
    const result = await service.run(saved.id, {}, context, 1);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret page text");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(service.listRuns(context)[0]).toMatchObject({ status: "failed", nextStep: 1 });
  });

  it("continues a checkpoint only after browser handoff reports explicit Done", async () => {
    for (const status of ["done", "unable", "browser_changed"]) {
      const { service, execute } = await fixture(async name => ({ ok: true, message: "done", data: name === "browser.handoff" ? { status } : undefined }));
      const saved = service.save({ ...definition, steps: [definition.steps[0], { action: "checkpoint", label: "Login", message: "Log in in the browser" }, definition.steps[2]] }, context);
      expect((await service.run(saved.id, {}, context, 1)).ok).toBe(status === "done");
      expect(execute).toHaveBeenCalledTimes(status === "done" ? 3 : 2);
    }
  });

  it("cancels and prevents overlapping runs in the same browser chat", async () => {
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const { service, saved, execute } = await fixture(async (_name, _input, ctx) => {
      entered();
      await new Promise<void>(resolve => ctx.signal!.addEventListener("abort", () => resolve(), { once: true }));
      return { ok: true, message: "settled" };
    });
    const pending = service.run(saved.id, {}, context, 1);
    await started;
    await expect(service.run(saved.id, {}, context, 1)).rejects.toThrow("already has");
    const run = service.listRuns(context)[0]!;
    expect(() => service.cancel(run.id, { ...context, userId: "other" })).toThrow("not found");
    service.cancel(run.id, context);
    expect((await pending).ok).toBe(false);
    expect(service.getRun(run.id, context)).toMatchObject({ status: "cancelled", nextStep: 0 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("validates through the public save tool and returns extraction outputs without storing page data", async () => {
    const { service, execute, db } = await fixture(async name => ({ ok: true, message: "done", data: name === "browser.extract" ? { values: { result: "page-data" } } : undefined }));
    const tools = createBrowserWorkflowTools(service);
    const save = tools.find(tool => tool.name === "browser.workflow.save")!;
    const definitionWithOutput = { ...definition, steps: [...definition.steps,
      { action: "check", label: "Verify", selector: "#results", text: "{{month}}" },
      { action: "extract", label: "Read", instruction: "Read results for {{month}}", fields: [{ name: "result", type: "string", description: "Result for {{month}}" }] },
    ] };
    const result = await save.execute({ definition: definitionWithOutput }, context);
    const saved = result.data as { id: string; revision: number };
    expect(await service.run(saved.id, { month: "November" }, context, saved.revision)).toMatchObject({ ok: true, data: { outputs: [{ step: 4, data: { values: { result: "page-data" } } }] } });
    expect(execute.mock.calls[4]?.[1]).toMatchObject({ instruction: "Read results for November", fields: [{ description: "Result for November" }] });
    expect(JSON.stringify(db.select().from(browserWorkflowRuns).all())).not.toContain("page-data");
    await expect(save.execute({ definition: { ...definition, steps: [{ action: "execute", label: "Unsafe" }] } }, context)).rejects.toThrow();
  });

  it("marks crash recovery interrupted without replaying an uncertain effect", async () => {
    const { service, saved, db, execute } = await fixture();
    await service.run(saved.id, {}, context, 1);
    const run = service.listRuns(context)[0]!;
    db.update(browserWorkflowRuns).set({ status: "waiting_for_user", nextStep: 1, progress: JSON.stringify([{ label: "Login", status: "waiting_for_user" }]) }).run();
    execute.mockClear();
    const restarted = new BrowserWorkflowService(db, execute);
    expect(restarted.getRun(run.id, context)).toMatchObject({ status: "interrupted", steps: [{ status: "interrupted" }] });
    expect(execute).not.toHaveBeenCalled();
  });
});
