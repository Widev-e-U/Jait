import type { ToolDefinition, ToolResult } from "./contracts.js";
import type { SchedulerService } from "../scheduler/service.js";

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeToolName(value: unknown): string {
  const raw = normalizeString(value).trim();
  if (!raw) return raw;
  const firstUnderscore = raw.indexOf("_");
  if (firstUnderscore === -1) return raw;
  return `${raw.slice(0, firstUnderscore)}.${raw.slice(firstUnderscore + 1)}`;
}

export function createCronAddTool(scheduler: SchedulerService): ToolDefinition {
  return {
    name: "cron.add",
    description: "Add a scheduled cron job",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        cron: { type: "string" },
        toolName: { type: "string" },
        input: { type: "object" },
        sessionId: { type: "string" },
        workspaceRoot: { type: "string" },
      },
      required: ["name", "cron", "toolName"],
    },
    execute: async (input, context): Promise<ToolResult> => {
      const body = (input as Record<string, unknown>) ?? {};
      const job = scheduler.create({
        userId: context.userId,
        name: normalizeString(body["name"]),
        cron: normalizeString(body["cron"]),
        toolName: normalizeToolName(body["toolName"]),
        input: (body["input"] as Record<string, unknown> | undefined) ?? {},
        sessionId: normalizeString(body["sessionId"], "default"),
        workspaceRoot: normalizeString(body["workspaceRoot"], process.cwd()),
      });
      return { ok: true, message: "Cron job created", data: job };
    },
  };
}

export function createCronListTool(scheduler: SchedulerService): ToolDefinition {
  return {
    name: "cron.list",
    description: "List configured cron jobs",
    parameters: { type: "object", properties: {} },
    execute: async (_input, context): Promise<ToolResult> => ({
      ok: true,
      message: "Cron jobs",
      data: { jobs: scheduler.list(context.userId) },
    }),
  };
}

export function createCronRemoveTool(scheduler: SchedulerService): ToolDefinition {
  return {
    name: "cron.remove",
    description: "Remove a cron job by id",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    execute: async (input, context): Promise<ToolResult> => {
      const id = normalizeString((input as Record<string, unknown>)?.["id"]);
      const removed = scheduler.remove(id, context.userId);
      return { ok: removed, message: removed ? "Cron job removed" : "Cron job not found", data: { removed } };
    },
  };
}

export function createCronUpdateTool(scheduler: SchedulerService): ToolDefinition {
  return {
    name: "cron.update",
    description: "Update cron job fields",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        cron: { type: "string" },
        enabled: { type: "boolean" },
        input: { type: "object" },
      },
      required: ["id"],
    },
    execute: async (input, context): Promise<ToolResult> => {
      const body = (input as Record<string, unknown>) ?? {};
      const id = normalizeString(body["id"]);
      const updated = scheduler.update(id, {
        name: typeof body["name"] === "string" ? body["name"] : undefined,
        cron: typeof body["cron"] === "string" ? body["cron"] : undefined,
        enabled: typeof body["enabled"] === "boolean" ? body["enabled"] : undefined,
        input: body["input"] as unknown,
      }, context.userId);
      return {
        ok: !!updated,
        message: updated ? "Cron job updated" : "Cron job not found",
        data: updated ?? { id },
      };
    },
  };
}
