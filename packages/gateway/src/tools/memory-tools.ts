import type { MemoryService, MemoryScope } from "../memory/contracts.js";
import type { ReminderService, ReminderStatus } from "../services/reminders.js";
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

export function createMemoryListTool(reminders?: ReminderService): ToolDefinition<{
  status?: ReminderStatus | "all";
  workspaceId?: string;
  sessionId?: string;
  limit?: number;
}> {
  return {
    name: "memory.list",
    description: "List Memory page entries. These are explicit agent-readable memory records that can be edited, archived, or deleted.",
    tier: "standard",
    category: "memory",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "archived", "all"] },
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
        limit: { type: "number" },
      },
    },
    async execute(input, context: ToolContext) {
      if (!reminders) {
        return { ok: false, message: "Memory page service not available." };
      }
      const rows = reminders.list({
        userId: context.userId,
        status: input.status ?? "active",
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        limit: input.limit ?? 50,
      });
      return { ok: true, message: `Loaded ${rows.length} memory entries`, data: { memories: rows } };
    },
  };
}

export function createMemoryUpdateTool(reminders?: ReminderService): ToolDefinition<{
  id: string;
  content?: string;
  status?: ReminderStatus;
  workspaceId?: string | null;
  sessionId?: string | null;
  tags?: string[];
}> {
  return {
    name: "memory.update",
    description: "Update a Memory page entry by ID, including content, tags, workspace/session links, or archive/restore status.",
    tier: "standard",
    category: "memory",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        content: { type: "string" },
        status: { type: "string", enum: ["active", "archived"] },
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
    async execute(input, context: ToolContext) {
      if (!reminders) {
        return { ok: false, message: "Memory page service not available." };
      }
      const updated = reminders.update(input.id, {
        content: input.content,
        status: input.status,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        tags: input.tags,
      }, context.userId);
      return {
        ok: !!updated,
        message: updated ? `Updated memory ${input.id}` : `Memory ${input.id} not found`,
        data: updated,
      };
    },
  };
}
