/**
 * agent — Delegate tasks to a sub-agent.
 *
 * Inspired by VS Code Copilot's runSubagent + search_subagent:
 * - `prompt` + `description` + `details` for clear task specification
 * - `allowedTools` for scoping what the sub-agent can do
 *
 * Sub-agents run uncapped: there is deliberately no round limit to hand out,
 * because a cap truncates a specialist mid-task and its partial work then gets
 * reported back as if it were finished. Runaway loops are caught behaviorally
 * by the agent loop's duplicate-call detection instead.
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
}

export function createAgentTool(deps: AgentSpawnDeps): ToolDefinition<AgentInput> {
  const inner = createAgentSpawnTool(deps);

  return {
    name: "agent",
    description:
      "Launch a sub-agent for complex, multi-step tasks. " +
      "It gets its own tools, works autonomously, and returns a single result. " +
      "Provide a detailed prompt specifying exactly what to do and return. " +
      "To run work in parallel, emit several agent calls in the SAME reply — they " +
      "start concurrently, one visible sub-agent each. One call per independent " +
      "piece of work; only split across replies when a task needs an earlier " +
      "sub-agent's output.",
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
      },
      required: ["prompt", "description"],
    },
    async execute(input: AgentInput, context: ToolContext): Promise<ToolResult> {
      return inner.execute(input, context);
    },
  };
}
