/**
 * agent.spawn — Sub-agent tool.
 *
 * Spawns an independent agent loop with its own conversation, restricted
 * to a subset of tools. The parent agent delegates complex multi-step
 * research or tasks to a sub-agent that runs autonomously and returns
 * a single result.
 *
 * Inspired by VS Code Copilot Chat's SearchSubagentTool but generalized
 * to support any tool subset — not just search.
 */
import type { ToolDefinition, ToolContext } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
import type { AuditWriter } from "../services/audit.js";
import { type LLMConfig } from "./agent-loop.js";
interface AgentSpawnInput {
    /** High-level task prompt for the sub-agent */
    prompt: string;
    /** User-visible description of what the sub-agent is doing */
    description: string;
    /** Detailed instructions / context for the sub-agent */
    details?: string;
    /**
     * Comma-separated list of tool names the sub-agent is allowed to use.
     * If omitted, defaults to a safe read-only subset.
     */
    allowedTools?: string;
    /** Max tool-calling rounds for the sub-agent (default: 8) */
    maxRounds?: number;
}
export interface AgentSpawnDeps {
    toolRegistry: ToolRegistry;
    audit?: AuditWriter;
    /** LLM config resolver — gets config per request (supports per-user API keys) */
    getLLMConfig: (context: ToolContext) => LLMConfig;
}
export declare function createAgentSpawnTool(deps: AgentSpawnDeps): ToolDefinition<AgentSpawnInput>;
export {};
//# sourceMappingURL=agent-tools.d.ts.map