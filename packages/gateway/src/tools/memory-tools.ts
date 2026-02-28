import type { MemoryService, MemoryScope } from "../memory/contracts.js";
import type { ToolDefinition } from "./contracts.js";

export function createMemorySaveTool(memory: MemoryService): ToolDefinition<{
  scope: MemoryScope;
  content: string;
  sourceType: string;
  sourceId: string;
  sourceSurface: string;
  ttlSeconds?: number;
}> {
  return {
    name: "memory.save",
    description: "Save a memory entry for later retrieval.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["workspace", "project", "contact"] },
        content: { type: "string" },
        sourceType: { type: "string" },
        sourceId: { type: "string" },
        sourceSurface: { type: "string" },
        ttlSeconds: { type: "number" },
      },
      required: ["scope", "content", "sourceType", "sourceId", "sourceSurface"],
    },
    async execute(input) {
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

export function createMemorySearchTool(memory: MemoryService): ToolDefinition<{ query: string; limit?: number; scope?: MemoryScope }> {
  return {
    name: "memory.search",
    description: "Search saved memories using semantic similarity.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        scope: { type: "string", enum: ["workspace", "project", "contact"] },
      },
      required: ["query"],
    },
    async execute(input) {
      const results = await memory.search(input.query, input.limit ?? 5, input.scope);
      return { ok: true, message: `Found ${results.length} memories`, data: results };
    },
  };
}

export function createMemoryForgetTool(memory: MemoryService): ToolDefinition<{ id: string }> {
  return {
    name: "memory.forget",
    description: "Forget a memory by ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
    async execute(input) {
      const removed = await memory.forget(input.id);
      return { ok: removed, message: removed ? `Forgot memory ${input.id}` : `Memory ${input.id} not found` };
    },
  };
}
