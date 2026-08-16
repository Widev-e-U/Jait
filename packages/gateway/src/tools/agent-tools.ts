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
  type ExecutedToolCall,
  type MessageSegment,
} from "./agent-loop.js";
import { ToolName } from "./tool-names.js";
import { uuidv7 } from "../db/uuidv7.js";
import { isSuccessfulPerformative, parsePerformative, stripPerformativeTag } from "./agent-communication.js";
import { runAcpSpecialistTurn, SubAgentTranscriptCollector } from "./agent-acp-runner.js";
import type { ProviderRegistry } from "../providers/registry.js";

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
  /**
   * Internal only — never part of the tool's JSON schema, so the model can't
   * set it itself. Injected by the agent loop when this spawn call is one of
   * several running concurrently in the same parallel batch (see
   * agent-loop.ts / swarm-mailbox.ts); grants access to agent.message.
   */
  __swarmRoundId?: string;
}

// ── Default allowed tools for sub-agents ─────────────────────────────

const DEFAULT_SUBAGENT_TOOLS = new Set([
  ToolName.FileRead,
  ToolName.FileList,
  ToolName.FileStat,
  ToolName.OsQuery,
  ToolName.MemorySearch,
  ToolName.SessionSearch,
  ToolName.WebFetch,
  ToolName.WebSearch,
  ToolName.GatewayStatus,
  ToolName.TerminalRun,
]);

// pi-style: sub-agents run with NO round cap, and no way for a caller to set
// one. They run until the model decides they're done or runAgentLoop's
// duplicate-call detection stops them (identical tool call repeated
// MAX_DUPLICATE_CALL_STREAK rounds in a row), matching the main agent loop
// since sub-agents share the same loop.
//
// A cap is worse than useless here: it stops a specialist mid-task, and the
// truncated output carries no performative tag, so the parent reads it as a
// completed [INFORM] and folds half-finished work into its synthesis.
const SUBAGENT_MAX_ROUNDS = 0;

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
    `- Do not ask the user questions — work autonomously with the tools you have. If you genuinely need something from your parent before you can proceed, use [QUERY] (see below) instead of stalling.`,
    ``,
    `Tag your final answer with exactly one of these markers as the very first thing you write, so your parent knows how to treat the result:`,
    `- [INFORM] — you completed the task; what follows is the result.`,
    `- [PROPOSE] — you found multiple viable options and want your parent to choose between them.`,
    `- [REFUSE] — the task is out of scope, ambiguous, or you lack the access to do it; explain why.`,
    `- [FAILURE] — you attempted the task but could not complete it; explain what went wrong.`,
    `- [QUERY] — you need clarification or missing information before you can proceed; ask exactly what you need.`,
    `Default to [INFORM] once you're actually done.`,
  ].join("\n");
}

/**
 * The sub-agent's work in the order it actually happened (thinking → tools →
 * prose → more tools → answer), so the UI can replay it as a real chat turn
 * instead of lumping every tool call into one block after the fact.
 *
 * The live stream carries this ordering as events, but those are gone on
 * reload — the result data is what gets persisted, so the ordering has to
 * travel with it. The final answer's performative tag is bookkeeping for the
 * parent agent, not something to render, so strip it here too.
 */
function renderSegments(segments: MessageSegment[]): MessageSegment[] {
  return segments.map((seg) =>
    seg.type === "text" ? { ...seg, content: stripPerformativeTag(seg.content) } : seg,
  );
}

/**
 * Sub-agent tool calls in the shape the persistence layer and web renderer
 * expect. Every exit path (success, cancel, error) reports the same shape so a
 * sub-agent that stopped early still renders its tool calls on reload.
 */
function renderToolCalls(calls: ExecutedToolCall[]) {
  return calls.map((tc) => ({
    callId: tc.callId,
    tool: tc.tool,
    args: tc.args,
    ok: tc.ok,
    message: tc.message,
    data: tc.data,
    startedAt: tc.startedAt,
    completedAt: tc.completedAt,
  }));
}

// ── Factory ──────────────────────────────────────────────────────────

export interface AgentSpawnDeps {
  toolRegistry: ToolRegistry;
  audit?: AuditWriter;
  /** LLM config resolver — gets config per request (supports per-user API keys) */
  getLLMConfig: (context: ToolContext) => LLMConfig;
  /**
   * When the delegating context carries a non-"jait" providerId (the user
   * picked a CLI/ACP provider like Claude Code or Codex as their chat
   * provider), sub-agents route through this instead of getLLMConfig — Jait's
   * HTTP LLM path has no way to reach an ACP provider's model aliases.
   */
  providerRegistry?: ProviderRegistry;
  gatewayAddress?: { host: string; port: number };
}

export function createAgentSpawnTool(deps: AgentSpawnDeps): ToolDefinition<AgentSpawnInput> {
  const { toolRegistry, audit, getLLMConfig, providerRegistry, gatewayAddress } = deps;

  return {
    name: ToolName.AgentSpawn,
    description:
      "Launch a sub-agent to handle a complex, multi-step task autonomously. " +
      "The sub-agent gets its own conversation and tool set, runs independently, " +
      "and returns a single result. Use this for research, code search, multi-file " +
      "analysis, or any task that requires several tool calls to complete. " +
      "Several calls in the SAME reply run concurrently — one visible sub-agent " +
      "each — so delegate independent work as parallel calls rather than one at a time.",
    tier: "standard",
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
      },
      required: ["prompt", "description"],
    },

    async execute(input, context): Promise<ToolResult> {
      const subAgentId = uuidv7();
      const startedAt = Date.now();

      // ── ACP provider path ──
      // The delegating context picked a CLI/ACP provider (Claude Code, Codex,
      // ...) as its chat provider rather than Jait's own HTTP backend.
      // resolveJaitLlmConfig can only reach OpenAI-compatible/Ollama/OpenRouter
      // endpoints — sending it the ACP provider's bare model alias (e.g.
      // "opus") would hit the wrong backend and 404. Route the specialist
      // through the actual provider instead.
      if (context.providerId && context.providerId !== "jait") {
        if (!providerRegistry || !gatewayAddress || !context.userId) {
          return {
            ok: false,
            message: `Sub-agent delegation isn't available for provider "${context.providerId}" in this context (missing provider registry, gateway address, or user).`,
          };
        }

        audit?.write({
          sessionId: context.sessionId,
          actionId: subAgentId,
          actionType: "subagent.start",
          toolName: ToolName.AgentSpawn,
          inputs: {
            prompt: input.prompt,
            description: input.description,
            provider: context.providerId,
          },
          status: "executing",
          parentActionId: context.actionId,
        });

        const acpPrompt = [
          buildSubAgentSystemPrompt(input.description, input.details),
          "",
          "── Delegated task ──",
          input.prompt,
        ].join("\n");

        const acpResult = await runAcpSpecialistTurn({
          providerRegistry,
          config: gatewayAddress,
          providerId: context.providerId,
          userId: context.userId,
          sessionId: context.sessionId,
          subAgentId,
          projectRoot: context.projectRoot,
          runtimeMode: context.runtimeMode,
          model: context.model,
          prompt: acpPrompt,
          abortSignal: context.signal,
          onNestedEvent: context.onNestedEvent,
        });

        const durationMs = Date.now() - startedAt;
        audit?.write({
          sessionId: context.sessionId,
          actionId: uuidv7(),
          actionType: "subagent.complete",
          toolName: ToolName.AgentSpawn,
          inputs: { subAgentId },
          outputs: { content: acpResult.message.slice(0, 2000), durationMs, provider: context.providerId },
          status: acpResult.ok ? "completed" : "failed",
          parentActionId: context.actionId,
        });

        // acpResult.data carries the structured sub-agent message (content,
        // ordered segments, tool calls) collected from the ACP event stream —
        // forward it so the persisted tool-result has everything the web layer
        // needs to render the sub-agent turn like a normal chat on reload.
        const acpData = (acpResult.data ?? {}) as Record<string, unknown>;

        if (!acpResult.ok) {
          // Failure is exactly when the transcript matters most. The runner
          // already collected everything streamed before the timeout / abort /
          // error, so forward it here too — dropping it back to a bare stub is
          // what made failed sub-agents come back empty after a reload.
          return {
            ok: false,
            message: acpResult.message,
            data: {
              subAgentId,
              provider: context.providerId,
              durationMs,
              content: typeof acpData.content === "string" ? acpData.content : acpResult.message,
              segments: Array.isArray(acpData.segments) ? acpData.segments : undefined,
              toolCalls: Array.isArray(acpData.toolCalls) ? acpData.toolCalls : undefined,
              ...(typeof acpData.performative === "string" ? { performative: acpData.performative } : {}),
            },
          };
        }

        const { performative, content } = parsePerformative(acpResult.message);
        const ok = isSuccessfulPerformative(performative);
        return {
          ok,
          message: content || (ok ? "Sub-agent completed with no output" : `Sub-agent ${performative}: no details given`),
          data: {
            subAgentId,
            provider: context.providerId,
            performative,
            durationMs,
            content: typeof acpData.content === "string" ? acpData.content : content,
            segments: Array.isArray(acpData.segments) ? acpData.segments : undefined,
            toolCalls: Array.isArray(acpData.toolCalls) ? acpData.toolCalls : undefined,
          },
        };
      }

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

      // Running alongside siblings in the same swarm batch — grant access to
      // agent.message so they can talk to each other. Copy the set first:
      // `allowedTools` may still be the shared DEFAULT_SUBAGENT_TOOLS singleton.
      const swarmRoundId = input.__swarmRoundId;
      if (swarmRoundId) {
        allowedTools = new Set(allowedTools);
        allowedTools.add(ToolName.AgentMessage);
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
      const subExecuteTool: ToolExecutor = async (name, args, sid, _auth, onChunk, signal, onNestedEvent) => {
        if (!allowedTools.has(name)) {
          return { ok: false, message: `Tool '${name}' is not available to this sub-agent` };
        }
        const subContext: ToolContext = {
          sessionId: sid,
          actionId: uuidv7(),
          projectRoot: context.projectRoot,
          requestedBy: `sub-agent:${subAgentId}`,
          userId: context.userId,
          apiKeys: context.apiKeys,
          providerId: context.providerId,
          model: context.model,
          jaitBackend: context.jaitBackend,
          runtimeMode: context.runtimeMode,
          onOutputChunk: onChunk,
          onNestedEvent,
          signal,
          swarmRoundId,
          swarmParticipant: swarmRoundId ? input.description : undefined,
        };
        return toolRegistry.execute(name, args, subContext, audit);
      };

      // ── Collect sub-agent events and stream them to parent ──
      //
      // The specialist's work is forwarded onto the parent turn's event stream
      // as *real* events, not log lines: its tool calls become nested tool
      // cards under this call, and its assistant text / reasoning stream on
      // their own channels so the UI can render them exactly like a normal
      // chat turn (markdown + thinking block) instead of a flat activity log.
      const subEvents: AgentLoopEvent[] = [];
      const emitNested = context.onNestedEvent;
      // Live mirror of the sub-agent's transcript. runAgentLoop's return value
      // is the normal source of segments/tool calls, but it does not exist when
      // the loop throws — this does, so an errored sub-agent still persists
      // everything it produced up to the failure.
      const transcript = new SubAgentTranscriptCollector();
      let subContent = "";
      const onEvent = (event: AgentLoopEvent) => {
        subEvents.push(event);
        if (event.type === "token") {
          subContent += event.content;
          transcript.text(event.content);
        } else if (event.type === "thinking") transcript.thinking(event.content);
        else if (event.type === "tool_start") transcript.toolStart(event.call_id, event.tool, event.args);
        else if (event.type === "tool_result") transcript.toolResult(event.call_id, event.tool, event.ok, event.message, event.data);
        if (emitNested) {
          if (event.type === "tool_start") {
            emitNested({ type: "tool_start", tool: event.tool, args: event.args, call_id: event.call_id, parent_call_id: event.parent_call_id });
          } else if (event.type === "tool_output") {
            emitNested({ type: "tool_output", call_id: event.call_id, content: event.content, channel: event.channel });
          } else if (event.type === "tool_result") {
            emitNested({ type: "tool_result", call_id: event.call_id, tool: event.tool, ok: event.ok, message: event.message, parent_call_id: event.parent_call_id, data: event.data });
          } else if (event.type === "token") {
            // call_id is stamped by the parent loop — this is *this* call's own text
            emitNested({ type: "tool_output", call_id: "", content: event.content, channel: "text" });
          } else if (event.type === "thinking") {
            emitNested({ type: "tool_output", call_id: "", content: event.content, channel: "thinking" });
          }
        } else if (context.onOutputChunk && event.type === "token") {
          // No nested-event channel (non-chat callers) — fall back to raw text.
          context.onOutputChunk(event.content);
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
          maxRounds: SUBAGENT_MAX_ROUNDS,
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
            auth: context.userId
              ? {
                userId: context.userId,
                apiKeys: context.apiKeys,
                providerId: context.providerId,
                model: context.model,
                jaitBackend: context.jaitBackend,
                runtimeMode: context.runtimeMode,
              }
              : undefined,
            abort: subAbort,
            maxRounds: SUBAGENT_MAX_ROUNDS,
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
              segments: renderSegments(result.segments),
              rounds: result.rounds,
              // The executed calls themselves, not a count — a count persists
              // as an unusable scalar and the cancelled sub-agent comes back
              // with no tool calls at all.
              toolCalls: renderToolCalls(result.executedToolCalls),
              durationMs,
            },
          };
        }

        // ── Interpret the communicative-act tag the sub-agent reported back with ──
        // [REFUSE]/[FAILURE]/[QUERY] mean the delegated task did NOT complete
        // successfully, even though the sub-agent loop itself ran fine — the
        // parent should see that as ok:false instead of a silent success.
        const { performative, content } = parsePerformative(result.content);
        const ok = isSuccessfulPerformative(performative);

        return {
          ok,
          message: content || (ok ? "Sub-agent completed with no output" : `Sub-agent ${performative}: no details given`),
          data: {
            subAgentId,
            content,
            performative,
            segments: renderSegments(result.segments),
            rounds: result.rounds,
            toolCalls: renderToolCalls(result.executedToolCalls),
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

        // runAgentLoop threw, so its result — and with it the segments and
        // executed tool calls — is gone. Fall back to the live transcript
        // mirror, which holds everything the sub-agent streamed up to the
        // failure, and append the error so the reloaded card shows where it
        // stopped instead of only "Sub-agent failed".
        transcript.error(message);
        const partial = transcript.finalize();
        return {
          ok: false,
          message: `Sub-agent failed: ${message}`,
          data: {
            subAgentId,
            partialContent: subContent,
            segments: renderSegments(partial.segments),
            toolCalls: partial.toolCalls,
            durationMs: Date.now() - startedAt,
          },
        };
      }
    },
  };
}
