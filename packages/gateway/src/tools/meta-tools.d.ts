/**
 * Meta-tools — tools.search and tools.list
 *
 * These are "discovery" tools that let the LLM find and load tool schemas
 * on demand, rather than sending all 40+ schemas in every request.
 *
 * tools.list  — Returns a brief catalogue of all available tools grouped by
 *               category, with tier badges. Lightweight (names + one-liners).
 * tools.search — Searches tools by keyword and returns FULL schemas so the
 *                LLM can use them in subsequent rounds.
 *
 * Both are tier: "core" so they're always available.
 */
import type { ToolDefinition } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
interface ToolsListInput {
    category?: string;
}
export declare function createToolsListTool(registry: ToolRegistry): ToolDefinition<ToolsListInput>;
interface ToolsSearchInput {
    query: string;
}
export declare function createToolsSearchTool(registry: ToolRegistry): ToolDefinition<ToolsSearchInput>;
export {};
//# sourceMappingURL=meta-tools.d.ts.map