/**
 * Tool Registry — Sprint 3.5
 *
 * Central registry for all tool definitions. Tools are registered
 * by name and executed through a unified interface.
 */
import type { ToolDefinition, ToolContext, ToolResult, ToolTier, ToolCategory } from "./contracts.js";
import type { AuditWriter } from "../services/audit.js";
/** Summary of a tool for the settings UI and discovery endpoints */
export interface ToolInfo {
    name: string;
    description: string;
    tier: ToolTier;
    category: ToolCategory;
    source: "builtin" | "mcp";
    parameterCount: number;
}
export declare class ToolRegistry {
    private readonly tools;
    register(tool: ToolDefinition): void;
    get(name: string): ToolDefinition | undefined;
    list(): ToolDefinition[];
    listNames(): string[];
    has(name: string): boolean;
    /** List tools filtered by tier */
    listByTier(tier: ToolTier): ToolDefinition[];
    /** List tools filtered by category */
    listByCategory(category: ToolCategory): ToolDefinition[];
    /** Search tools by name, description, or category (fuzzy keyword match) */
    search(query: string): ToolDefinition[];
    /** Get tool info summaries for all tools (lightweight, no execute fn) */
    listInfo(): ToolInfo[];
    /** Get tool info filtered to only enabled tools for a user */
    listInfoFiltered(disabledTools?: Set<string>): ToolInfo[];
    /**
     * Get tools that should be sent in the initial LLM payload.
     * Core tools always, standard tools unless user disabled them.
     */
    listForLLM(disabledTools?: Set<string>): ToolDefinition[];
    /**
     * Check if a tool is executable (registered and not disabled).
     * Even discovered external tools can be executed if they're registered.
     * The disabled check only gates what's sent to the LLM, not execution.
     */
    isExecutable(name: string, disabledTools?: Set<string>): boolean;
    /**
     * Execute a tool by name with audit logging.
     */
    execute(name: string, input: unknown, context: ToolContext, audit?: AuditWriter): Promise<ToolResult>;
}
//# sourceMappingURL=registry.d.ts.map