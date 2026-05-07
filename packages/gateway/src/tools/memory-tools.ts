import type { MemoryService, MemoryScope } from "../memory/contracts.js";
import type { ReminderService } from "../services/reminders.js";
import type { ToolContext, ToolDefinition } from "./contracts.js";

export function createMemorySaveTool(memory: MemoryService, reminders?: ReminderService): ToolDefinition<{
  scope: MemoryScope;
  content: string;
  sourceType: string;
  sourceId: string;
  sourceSurface: string;
  ttlSeconds?: number;
  kind?: "memory" | "reminder";
  workspaceId?: string | null;
  sessionId?: string | null;
  tags?: string[];
}> {
  return {
    name: "memory.save",
    description: "Save a memory entry for later retrieval. Set kind=reminder to save an explicit agent reminder.",
    tier: "standard",
    category: "memory",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["workspace", "project", "contact"] },
        content: { type: "string" },
        sourceType: { type: "string" },
        sourceId: { type: "string" },
        sourceSurface: { type: "string" },
        ttlSeconds: { type: "number" },
        kind: { type: "string", enum: ["memory", "reminder"] },
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["scope", "content", "sourceType", "sourceId", "sourceSurface"],
    },
    async execute(input, context: ToolContext) {
      if (input.kind === "reminder") {
        if (!reminders) {
          return { ok: false, message: "Reminder service not available." };
        }
        const reminder = reminders.create({
          userId: context.userId,
          workspaceId: input.workspaceId ?? null,
          sessionId: input.sessionId ?? context.sessionId,
          content: input.content,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceSurface: input.sourceSurface,
          tags: input.tags,
        });
        return { ok: true, message: `Saved reminder ${reminder.id}`, data: reminder };
      }
      const expiresAt = input.ttlSeconds ? new Date(Date.now() + input.ttlSeconds * 1000).toISOString() : undefined;
      const entry = await memory.save({
        scope: input.scope,
        content: input.content,
        source: {
          type: input.sourceType,
          id: input.sourceId,
          surface: input.sourceSurface,
        },
        expiresAt,
      });

      return { ok: true, message: `Saved memory ${entry.id}`, data: entry };
    },
  };
}

export function createMemorySearchTool(memory: MemoryService, reminders?: ReminderService): ToolDefinition<{ query: string; limit?: number; scope?: MemoryScope; includeReminders?: boolean; workspaceId?: string }> {
  return {
    name: "memory.search",
    description: "Search saved memories and optionally include explicit agent reminders.",
    tier: "standard",
    category: "memory",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        scope: { type: "string", enum: ["workspace", "project", "contact"] },
        includeReminders: { type: "boolean" },
        workspaceId: { type: "string" },
      },
      required: ["query"],
    },
    async execute(input, context: ToolContext) {
      const results = await memory.search(input.query, input.limit ?? 5, input.scope);
      const reminderResults = input.includeReminders === false
        ? []
        : reminders?.list({
          userId: context.userId,
          workspaceId: input.workspaceId,
          status: "active",
          limit: input.limit ?? 5,
        }) ?? [];
      return {
        ok: true,
        message: `Found ${results.length} memories and ${reminderResults.length} reminders`,
        data: { memories: results, reminders: reminderResults },
      };
    },
  };
}

export function createMemoryForgetTool(memory: MemoryService, reminders?: ReminderService): ToolDefinition<{ id: string; kind?: "memory" | "reminder" }> {
  return {
    name: "memory.forget",
    description: "Forget a memory or reminder by ID.",
    tier: "standard",
    category: "memory",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string", enum: ["memory", "reminder"] },
      },
      required: ["id"],
    },
    async execute(input, context: ToolContext) {
      if (input.kind === "reminder") {
        const removedReminder = reminders?.delete(input.id, context.userId) ?? false;
        return {
          ok: removedReminder,
          message: removedReminder ? `Forgot reminder ${input.id}` : `Reminder ${input.id} not found`,
        };
      }
      const removedReminder = reminders?.delete(input.id, context.userId) ?? false;
      if (removedReminder) {
        return { ok: true, message: `Forgot reminder ${input.id}` };
      }
      const removed = await memory.forget(input.id);
      return { ok: removed, message: removed ? `Forgot memory ${input.id}` : `Memory ${input.id} not found` };
    },
  };
}
