import { describe, expect, it, vi } from "vitest";
import type { OrchestrationService } from "../services/orchestration/orchestrator.js";
import type { ToolContext, ToolDefinition } from "./contracts.js";
import { createPlanRunTools } from "./plan-run-tools.js";

const context = { userId: "owner-1", sessionId: "chat-1", actionId: "action-1" } as unknown as ToolContext;

function toolNamed(service: Partial<Record<keyof OrchestrationService, unknown>>, name: string): ToolDefinition {
  const found = createPlanRunTools(service as unknown as OrchestrationService).find((item) => item.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

describe("plan run chat tools", () => {
  it("exposes the controls under plan.run.* in the agent category", () => {
    const tools = createPlanRunTools({} as unknown as OrchestrationService);
    expect(tools.map((item) => item.name)).toEqual([
      "plan.run.start",
      "plan.run.list",
      "plan.run.status",
      "plan.run.attempts",
      "plan.run.cancel",
      "plan.run.resume",
    ]);
    expect(tools.every((item) => item.category === "agent" && item.source === "builtin")).toBe(true);
  });

  it("starts a run for the calling owner only", async () => {
    const createRun = vi.fn(() => ({ id: "run-1" }));
    const result = await toolNamed({ createRun }, "plan.run.start").execute(
      { planId: "plan-1", maxWorkers: 3 },
      context,
    );
    expect(createRun).toHaveBeenCalledWith("owner-1", { planId: "plan-1", maxWorkers: 3 });
    expect(result).toMatchObject({ ok: true, data: { id: "run-1" } });
  });

  it("returns a refusal from the service as a failed result instead of an exception", async () => {
    const getRun = vi.fn(() => { throw new Error("run not found"); });
    const result = await toolNamed({ getRun }, "plan.run.status").execute({ runId: "run-x" }, context);
    expect(getRun).toHaveBeenCalledWith("owner-1", "run-x");
    expect(result).toEqual({ ok: false, message: "run not found" });
  });

  it("rejects malformed input before it reaches the service", async () => {
    const createRun = vi.fn();
    await expect(
      toolNamed({ createRun }, "plan.run.start").execute({ planId: "plan-1", maxWorkers: 99 }, context),
    ).rejects.toThrow();
    expect(createRun).not.toHaveBeenCalled();
  });

  it("resumes only with the explicit decision and note for each task", async () => {
    const resumeRun = vi.fn(() => ({ id: "run-1" }));
    await toolNamed({ resumeRun }, "plan.run.resume").execute(
      { runId: "run-1", decisions: [{ taskId: "A", decision: "retry", note: "checked the worktree" }] },
      context,
    );
    expect(resumeRun).toHaveBeenCalledWith("owner-1", "run-1", [
      { taskId: "A", decision: "retry", note: "checked the worktree" },
    ]);
    await expect(
      toolNamed({ resumeRun }, "plan.run.resume").execute({ runId: "run-1", decisions: [{ taskId: "A", decision: "retry" }] }, context),
    ).rejects.toThrow();
  });

  it("cancels with the caller's reason, or a default one", async () => {
    const cancelRun = vi.fn(() => ({ id: "run-1" }));
    await toolNamed({ cancelRun }, "plan.run.cancel").execute({ runId: "run-1" }, context);
    expect(cancelRun).toHaveBeenLastCalledWith("owner-1", "run-1", "cancelled from chat");
    await toolNamed({ cancelRun }, "plan.run.cancel").execute({ runId: "run-1", reason: "scope changed" }, context);
    expect(cancelRun).toHaveBeenLastCalledWith("owner-1", "run-1", "scope changed");
  });
});
