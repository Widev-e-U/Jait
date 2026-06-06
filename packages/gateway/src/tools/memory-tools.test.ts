import { describe, expect, it } from "vitest";
import type { MemoryEntry, MemoryService, SaveMemoryInput } from "../memory/contracts.js";
import type { ReminderRow, ReminderService } from "../services/reminders.js";
import type { ToolContext } from "./contracts.js";
import { createMemoryForgetTool, createMemoryHygieneTool, createMemoryListTool, createMemoryReviewChatsTool, createMemorySaveTool, createMemorySearchTool, createMemoryUpdateTool } from "./memory-tools.js";

const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};

function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    embedding: {},
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("memory tools with reminders", () => {
  it("saves explicit reminders through memory.save", async () => {
    const created = reminder();
    const reminders = {
      create: (params: { content: string; userId?: string; sessionId?: string | null }) => ({
        ...created,
        content: params.content,
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
      }),
    } as unknown as ReminderService;
    const memory = {
      save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content }),
      list: async () => [],
    } as unknown as MemoryService;
    const tool = createMemorySaveTool(memory, reminders);

    const result = await tool.execute({
      kind: "reminder",
      scope: "project",
      content: "Remember this",
      sourceType: "agent",
      sourceId: "action-1",
      sourceSurface: "chat",
    }, context);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Saved reminder");
    expect(result.data).toMatchObject({ content: "Remember this", userId: "user-1", sessionId: "session-1" });
  });

  it("returns memories and reminders from memory.search", async () => {
    const memory = {
      list: async () => [memoryEntry()],
      search: async () => [memoryEntry()],
    } as unknown as MemoryService;
    const reminders = {
      list: () => [reminder()],
    } as unknown as ReminderService;
    const tool = createMemorySearchTool(memory, reminders);

    const result = await tool.execute({ query: "remember", limit: 3 }, context);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      memories: [{ id: "memory-1" }],
      reminders: [{ id: "reminder-1" }],
    });
  });

  it("lists Memory page entries through memory.list", async () => {
    const reminders = {
      list: (options: { userId?: string; status?: string; limit?: number }) => [reminder({
        userId: options.userId ?? null,
        status: options.status === "archived" ? "archived" : "active",
      })],
    } as unknown as ReminderService;
    const tool = createMemoryListTool(reminders);

    const result = await tool.execute({ status: "archived", limit: 10 }, context);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ memories: [{ id: "reminder-1", status: "archived", userId: "user-1" }] });
  });

  it("updates Memory page entries through memory.update", async () => {
    const reminders = {
      update: (id: string, params: { content?: string; status?: string }, userId?: string) => reminder({
        id,
        userId: userId ?? null,
        content: params.content ?? "Reminder",
        status: params.status === "archived" ? "archived" : "active",
      }),
    } as unknown as ReminderService;
    const tool = createMemoryUpdateTool(reminders);

    const result = await tool.execute({ id: "reminder-1", content: "Updated", status: "archived" }, context);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ id: "reminder-1", content: "Updated", status: "archived", userId: "user-1" });
  });

  it("deletes reminders before falling back to semantic memory", async () => {
    const memory = {
      list: async () => [],
      forget: async () => false,
    } as unknown as MemoryService;
    const reminders = {
      delete: () => true,
    } as unknown as ReminderService;
    const tool = createMemoryForgetTool(memory, reminders);

    const result = await tool.execute({ id: "reminder-1" }, context);

    expect(result).toMatchObject({ ok: true, message: "Forgot reminder reminder-1" });
  });

  it("runs memory hygiene for the calling user only", async () => {
    let receivedUserId: string | undefined;
    const reminders = {
      runHygiene: (userId?: string) => {
        receivedUserId = userId;
        return { archived: 1, flagged: 2 };
      },
    } as unknown as ReminderService;
    const tool = createMemoryHygieneTool(reminders);

    const result = await tool.execute({ userId: "other-user" } as never, context);

    expect(result.ok).toBe(true);
    expect(receivedUserId).toBe("user-1");
  });

  it("scans old chats for the calling user only", async () => {
    let received: { userId?: string; limit?: number } = {};
    const reminders = {
      scanOldChatsForMemory: (userId?: string, limit?: number) => {
        received = { userId, limit };
        return { scanned: 3, created: 1 };
      },
    } as unknown as ReminderService;
    const tool = createMemoryReviewChatsTool(reminders);

    const result = await tool.execute({ userId: "other-user", limit: 25 } as { limit?: number }, context);

    expect(result.ok).toBe(true);
    expect(received).toEqual({ userId: "user-1", limit: 25 });
  });
});
