import type { MemoryService, MemoryScope } from "../memory/contracts.js";
import type { ToolDefinition } from "./contracts.js";
export declare function createMemorySaveTool(memory: MemoryService): ToolDefinition<{
    scope: MemoryScope;
    content: string;
    sourceType: string;
    sourceId: string;
    sourceSurface: string;
    ttlSeconds?: number;
}>;
export declare function createMemorySearchTool(memory: MemoryService): ToolDefinition<{
    query: string;
    limit?: number;
    scope?: MemoryScope;
}>;
export declare function createMemoryForgetTool(memory: MemoryService): ToolDefinition<{
    id: string;
}>;
//# sourceMappingURL=memory-tools.d.ts.map