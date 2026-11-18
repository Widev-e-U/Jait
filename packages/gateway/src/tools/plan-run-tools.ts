import { z } from "zod";
import type { OrchestrationService } from "../services/orchestration/orchestrator.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

const id = z.string().min(1).max(200);

/**
 * Chat surface for plan runs. The service scopes every call to the caller's own
 * runs. These tools are not in the reviewed permission profiles, so the security
 * profile treats every call as dangerous and asks for consent until a reviewed
 * profile update lists them. Each worker tool call also goes through consent.
 */
export function createPlanRunTools(service: OrchestrationService): ToolDefinition[] {
  const common = { tier: "standard", category: "agent", source: "builtin", page: "chat" } as const;
  const runId = { type: "string", description: "Plan run ID" };
  return [
    {
      ...common,
      name: "plan.run.start",
      description:
        "Start an approved plan as a dependency-ordered run. Each task runs as a real worker. Writing tasks work in isolated git worktrees, and verified changes are integrated into the run's own branch. Nothing is pushed and nothing is merged into your branch. Check progress with plan.run.status.",
      parameters: {
        type: "object",
        properties: {
          planId: { type: "string", description: "ID of an approved plan" },
          maxWorkers: { type: "number", description: "Parallel workers, 1-8 (default 2)" },
        },
        required: ["planId"],
      },
      execute: async (input, context): Promise<ToolResult> => {
        const body = z.object({ planId: id, maxWorkers: z.number().int().min(1).max(8).optional() }).strict().parse(input);
        return attempt(() => service.createRun(ownerOf(context), body), "Plan run started");
      },
    },
    {
      ...common,
      name: "plan.run.list",
      description: "List your plan runs with their status, and whether each is paused.",
      parameters: { type: "object", properties: {} },
      execute: async (_input, context): Promise<ToolResult> =>
        attempt(() => service.listRuns(ownerOf(context)), "Plan runs"),
    },
    {
      ...common,
      name: "plan.run.status",
      description:
        "Inspect a plan run: each task's state, dependencies, attempt count, worker identity, worktree, last error and verification, plus the approvals its workers are waiting on. Consent prompts for a run appear in its worker session (workerSessionId), not in the chat that started it.",
      parameters: { type: "object", properties: { runId }, required: ["runId"] },
      execute: async (input, context): Promise<ToolResult> => {
        const body = z.object({ runId: id }).strict().parse(input);
        return attempt(() => service.getRun(ownerOf(context), body.runId), "Plan run");
      },
    },
    {
      ...common,
      name: "plan.run.attempts",
      description: "Show a task's attempt history: worker identity, workspace, report, gate outcomes and errors for each attempt.",
      parameters: {
        type: "object",
        properties: { runId, taskId: { type: "string", description: "Task ID within the run" } },
        required: ["runId", "taskId"],
      },
      execute: async (input, context): Promise<ToolResult> => {
        const body = z.object({ runId: id, taskId: id }).strict().parse(input);
        return attempt(() => service.getTaskAttempts(ownerOf(context), body.runId, body.taskId), "Task attempts");
      },
    },
    {
      ...common,
      name: "plan.run.cancel",
      description:
        "Cancel a plan run. Running workers are stopped, command gates are stopped, and any late results are ignored. Changes already integrated stay on the run's branch.",
      parameters: {
        type: "object",
        properties: { runId, reason: { type: "string", description: "Why the run is cancelled" } },
        required: ["runId"],
      },
      execute: async (input, context): Promise<ToolResult> => {
        const body = z.object({ runId: id, reason: z.string().trim().min(1).max(500).optional() }).strict().parse(input);
        return attempt(
          () => service.cancelRun(ownerOf(context), body.runId, body.reason ?? "cancelled from chat"),
          "Plan run cancelled",
        );
      },
    },
    {
      ...common,
      name: "plan.run.resume",
      description:
        "Resume a paused or interrupted plan run. Each interrupted task needs a decision made after you inspected its workspace: retry it or fail it, with a note of what you checked. Nothing restarts without a decision.",
      parameters: {
        type: "object",
        properties: {
          runId,
          decisions: {
            type: "array",
            description: "One decision for each interrupted task",
            items: {
              type: "object",
              properties: {
                taskId: { type: "string" },
                decision: { type: "string", enum: ["retry", "fail"] },
                note: { type: "string", description: "What you inspected before deciding, 1-500 characters" },
              },
              required: ["taskId", "decision", "note"],
            },
          },
        },
        required: ["runId"],
      },
      execute: async (input, context): Promise<ToolResult> => {
        const body = z.object({
          runId: id,
          decisions: z.array(z.object({
            taskId: id,
            decision: z.enum(["retry", "fail"]),
            note: z.string().min(1).max(500),
          }).strict()).default([]),
        }).strict().parse(input);
        return attempt(
          () => service.resumeRun(ownerOf(context), body.runId, body.decisions),
          "Plan run resumed",
        );
      },
    },
  ];
}

/** Plan runs belong to a signed-in owner. Without one, nothing is looked up or started. */
function ownerOf(context: ToolContext): string {
  if (!context.userId) throw new Error("plan runs need a signed-in owner");
  return context.userId;
}

function attempt(work: () => object, message: string): ToolResult {
  try {
    return { ok: true, message, data: work() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
