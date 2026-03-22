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

import type { ToolDefinition, ToolResult, ToolContext } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
import type { AuditWriter } from "../services/audit.js";
import {
  runAgentLoop,
  buildToolSchemas,
  SteeringController,
  type LLMConfig,
  type AgentMessage,
  type ToolExecutor,
  type AgentLoopEvent,
} from "./agent-loop.js";
import { ToolName } from "./tool-names.js";
import { uuidv7 } from "../db/uuidv7.js";

// ── Input type ───────────────────────────────────────────────────────

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

// ── Default allowed tools for sub-agents ─────────────────────────────

const DEFAULT_SUBAGENT_TOOLS = new Set([
  ToolName.FileRead,
  ToolName.FileList,
  ToolName.FileStat,
  ToolName.OsQuery,
  ToolName.MemorySearch,
  ToolName.WebFetch,
  ToolName.WebSearch,
  ToolName.GatewayStatus,
  ToolName.TerminalRun,
]);

const SUBAGENT_MAX_ROUNDS_DEFAULT = 8;

// ── System prompt for sub-agents ─────────────────────────────────────

function buildSubAgentSystemPrompt(description: string, details?: string): string {
  return [
    `You are a Jait sub-agent. Your parent agent has delegated a specific task to you.`,
    ``,
    `Task: ${description}`,
    ...(details ? [``, `Detailed instructions:`, details] : []),
    ``,
    `Guidelines:`,
    `- Focus exclusively on the delegated task.`,
    `- Use your available tools to gather information and complete the task.`,
    `- Be thorough but concise in your final response.`,
    `- When done, provide a clear, structured answer that your parent agent can use.`,
    `- Do not ask the user questions — work autonomously with the tools you have.`,
  ].join("\n");
}

// ── Factory ──────────────────────────────────────────────────────────

export interface AgentSpawnDeps {
  toolRegistry: ToolRegistry;
  audit?: AuditWriter;
  /** LLM config resolver — gets config per request (supports per-user API keys) */
  getLLMConfig: (context: ToolContext) => LLMConfig;
}

export function createAgentSpawnTool(deps: AgentSpawnDeps): ToolDefinition<AgentSpawnInput> {
  const { toolRegistry, audit, getLLMConfig } = deps;

  return {
    name: ToolName.AgentSpawn,
    description:
      "Launch a sub-agent to handle a complex, multi-step task autonomously. " +
      "The sub-agent gets its own conversation and tool set, runs independently, " +
      "and returns a single result. Use this for research, code search, multi-file " +
      "analysis, or any task that requires several tool calls to complete.",
    tier: "core",
    category: "agent",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The task prompt — what should the sub-agent accomplish?",
        },
        description: {
          type: "string",
          description: "Short user-visible description of the sub-agent's mission (shown in UI).",
        },
        details: {
          type: "string",
          description: "Optional detailed instructions, context, or constraints for the sub-agent.",
        },
        allowedTools: {
          type: "string",
          description:
            "Comma-separated tool names the sub-agent may use. " +
            "Defaults to a safe read-only subset if omitted. " +
            "Example: 'file.read,file.list,terminal.run,web.search'",
        },
        maxRounds: {
          type: "number",
          description: `Max tool-calling rounds (default: ${SUBAGENT_MAX_ROUNDS_DEFAULT}).`,
        },
      },
      required: ["prompt", "description"],
    },

    async execute(input, context): Promise<ToolResult> {
      const subAgentId = uuidv7();
      const startedAt = Date.now();

      // ── Resolve allowed tools ──
      let allowedTools: Set<string>;
      if (input.allowedTools) {
        allowedTools = new Set(
          input.allowedTools
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      } else {
        allowedTools = DEFAULT_SUBAGENT_TOOLS;
      }

      // Verify all requested tools actually exist
      const missing = [...allowedTools].filter((t) => !toolRegistry.has(t));
      if (missing.length > 0) {
        return {
          ok: false,
          message: `Sub-agent requested unknown tools: ${missing.join(", ")}`,
        };
      }

      // ── Build sub-agent tool schemas ──
      const toolSchemas = buildToolSchemas(toolRegistry, allowedTools);
      const hasTools = toolSchemas.length > 0;

      // ── Build sub-agent conversation ──
      const systemPrompt = buildSubAgentSystemPrompt(input.description, input.details);
      const history: AgentMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.prompt },
      ];

      // ── Resolve LLM config from parent context ──
      const llm = getLLMConfig(context);

      // ── Create sub-agent abort controller (linked to parent) ──
      const subAbort = new AbortController();
      if (context.signal) {
        if (context.signal.aborted) {
          return { ok: false, message: "Cancelled before sub-agent started" };
        }
        context.signal.addEventListener("abort", () => subAbort.abort(), { once: true });
      }

      // ── Steering controller for the sub-agent ──
      const steering = new SteeringController();

      // ── Sub-agent tool executor — scoped to allowed tools ──
      const subExecuteTool: ToolExecutor = async (name, args, sid, _auth, onChunk, signal) => {
        if (!allowedTools.has(name)) {
          return { ok: false, message: `Tool '${name}' is not available to this sub-agent` };
        }
        const subContext: ToolContext = {
          sessionId: sid,
          actionId: uuidv7(),
          workspaceRoot: context.workspaceRoot,
          requestedBy: `sub-agent:${subAgentId}`,
          userId: context.userId,
          apiKeys: context.apiKeys,
          onOutputChunk: onChunk,
          signal,
        };
        return toolRegistry.execute(name, args, subContext, audit);
      };

      // ── Collect sub-agent events and stream them to parent ──
      const subEvents: AgentLoopEvent[] = [];
      const onEvent = (event: AgentLoopEvent) => {
        subEvents.push(event);
        // Forward tool events to the parent's output stream so the UI
        // can show sub-agent progress
        if (context.onOutputChunk) {
          if (event.type === "tool_start") {
            context.onOutputChunk(`[sub-agent] Starting ${event.tool}...\n`);
          } else if (event.type === "tool_result") {
            const status = event.ok ? "✓" : "✗";
            context.onOutputChunk(`[sub-agent] ${status} ${event.message}\n`);
          } else if (event.type === "token") {
            // Stream sub-agent's thinking to parent
            context.onOutputChunk(event.content);
          }
        }
      };

      // ── Audit sub-agent start ──
      audit?.write({
        sessionId: context.sessionId,
        actionId: subAgentId,
        actionType: "subagent.start",
        toolName: ToolName.AgentSpawn,
        inputs: {
          prompt: input.prompt,
          description: input.description,
          allowedTools: [...allowedTools],
          maxRounds: input.maxRounds ?? SUBAGENT_MAX_ROUNDS_DEFAULT,
        },
        status: "executing",
        parentActionId: context.actionId,
      });

      try {
        // ── Run the sub-agent loop ──
        const result = await runAgentLoop(
          {
            llm,
            history,
            toolSchemas,
            hasTools,
            sessionId: `${context.sessionId}:sub:${subAgentId}`,
            auth: context.userId ? { userId: context.userId, apiKeys: context.apiKeys } : undefined,
            abort: subAbort,
            maxRounds: input.maxRounds ?? SUBAGENT_MAX_ROUNDS_DEFAULT,
            maxRetries: 1, // sub-agents get 1 retry (faster turnaround)
            parallel: true,
            toolRegistry,
            onEvent,
          },
          subExecuteTool,
          steering,
        );

        const completedAt = Date.now();
        const durationMs = completedAt - startedAt;

        // ── Audit sub-agent completion ──
        audit?.write({
          sessionId: context.sessionId,
          actionId: uuidv7(),
          actionType: "subagent.complete",
          toolName: ToolName.AgentSpawn,
          inputs: { subAgentId },
          outputs: {
            content: result.content.slice(0, 2000), // truncate for audit
            rounds: result.rounds,
            toolCallCount: result.executedToolCalls.length,
            aborted: result.aborted,
            durationMs,
          },
          status: result.aborted ? "cancelled" : "completed",
          parentActionId: context.actionId,
        });

        if (result.aborted) {
          return {
            ok: false,
            message: "Sub-agent was cancelled",
            data: {
              subAgentId,
              partialContent: result.content,
              rounds: result.rounds,
              toolCalls: result.executedToolCalls.length,
              durationMs,
            },
          };
        }

        return {
          ok: true,
          message: result.content || "Sub-agent completed with no output",
          data: {
            subAgentId,
            content: result.content,
            rounds: result.rounds,
            toolCalls: result.executedToolCalls.map((tc) => ({
              callId: tc.callId,
              tool: tc.tool,
              args: tc.args,
              ok: tc.ok,
              message: tc.message,
              data: tc.data,
              startedAt: tc.startedAt,
              completedAt: tc.completedAt,
            })),
            durationMs,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        audit?.write({
          sessionId: context.sessionId,
          actionId: uuidv7(),
          actionType: "subagent.error",
          toolName: ToolName.AgentSpawn,
          inputs: { subAgentId },
          outputs: { error: message },
          status: "failed",
          parentActionId: context.actionId,
        });

        return {
          ok: false,
          message: `Sub-agent failed: ${message}`,
          data: { subAgentId },
        };
      }
    },
  };
}
