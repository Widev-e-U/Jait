/**
 * agent — Delegate tasks to a sub-agent.
 *
 * Inspired by VS Code Copilot's runSubagent + search_subagent:
 * - `prompt` + `description` + `details` for clear task specification
 * - `allowedTools` for scoping what the sub-agent can do
 * - `maxRounds` to limit autonomous tool-calling loops
 *
 * Our advantage: single unified agent tool instead of Copilot's two
 * separate tools (runSubagent + search_subagent).
 */

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import { createAgentSpawnTool, type AgentSpawnDeps } from "../agent-tools.js";

interface AgentInput {
  /** The task to delegate to the sub-agent */
  prompt: string;
  /** Short 3-5 word description of the task (shown in UI) */
  description: string;
  /** A 2-3 sentence detailed objective with specific context and expectations.
   *  Tell the agent exactly what information it should return. */
  details?: string;
  /** Comma-separated tool names the sub-agent can use.
   *  Defaults to a safe read-only set (read, search, execute, web).
   *  Example: 'read,search,execute,web' */
  allowedTools?: string;
  /** Max tool-calling rounds (default: 8) */
  maxRounds?: number;
}

export function createAgentTool(deps: AgentSpawnDeps): ToolDefinition<AgentInput> {
  const inner = createAgentSpawnTool(deps);

  return {
    name: "agent",
    description:
      "Launch a sub-agent for complex, multi-step tasks. " +
      "It gets its own tools, works autonomously, and returns a single result. " +
      "Provide a detailed prompt specifying exactly what to do and return.",
    tier: "core",
    category: "agent",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed task description for the agent.",
        },
        description: {
          type: "string",
          description: "Short (3-5 word) task label.",
        },
        details: {
          type: "string",
          description: "Additional context and expected return format.",
        },
        allowedTools: {
          type: "string",
          description: "Comma-separated tool names (default: read,search,execute,web).",
        },
        maxRounds: {
          type: "number",
          description: "Max tool-calling rounds (default: 8).",
        },
      },
      required: ["prompt", "description"],
    },
    async execute(input: AgentInput, context: ToolContext): Promise<ToolResult> {
      return inner.execute(input, context);
    },
  };
}
