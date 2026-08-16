/**
 * ACP specialist runner — lets swarm/sub-agent delegation actually reach a
 * CLI-based provider (Claude Code, Codex, etc.) instead of only Jait's own
 * HTTP-callable backends (OpenAI-compatible / Ollama / OpenRouter).
 *
 * The `agent`/`agent.spawn` tool used to resolve every sub-agent through
 * `resolveJaitLlmConfig`, which only knows how to call `/chat/completions`.
 * When a specialist inherited a non-"jait" provider (e.g. the user picked
 * Claude Code/Opus as their chat provider), the bare model alias got sent to
 * whatever HTTP backend the account defaults to and 404'd. This module gives
 * that case a real path: start a scoped CliProviderAdapter session, run one
 * turn, and tear it down.
 */

import type { NestedAgentEvent, ToolResult } from "./contracts.js";
import type { CliProviderAdapter, ProviderEvent } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { RuntimeMode } from "@jait/shared/types";
import type { MessageSegment } from "./agent-loop.js";
import { parsePerformative, stripPerformativeTag, isSuccessfulPerformative } from "./agent-communication.js";

/**
 * Tool-call snapshot captured from the ACP event stream, shaped the same way
 * the jait specialist path reports `executedToolCalls` so the web layer can
 * render sub-agent tool calls identically regardless of backend.
 */
interface AcpToolCall {
  callId: string;
  tool: string;
  args?: unknown;
  ok: boolean;
  message: string;
  data?: unknown;
  startedAt: number;
  completedAt?: number;
}

/**
 * Interleaves a flat sub-agent token stream into ordered `MessageSegment`s
 * exactly like the jait agent loop does: consecutive text tokens merge into a
 * text segment, consecutive thinking tokens merge into a thinking segment, and
 * tool calls (which interrupt any pending text/thinking) become `toolGroup`
 * segments referencing the collected tool calls. This ordering is what gets
 * persisted, so on reload the specialist's turn renders the same way it did
 * live.
 *
 * Both sub-agent backends feed it: the ACP path below from provider events, and
 * the jait-backend path in `agent-tools.ts` from agent-loop events — so a
 * sub-agent that dies mid-run still has its transcript-so-far to persist, which
 * is the one thing the loop's own return value can no longer provide.
 */
export class SubAgentTranscriptCollector {
  readonly segments: MessageSegment[] = [];
  readonly toolCalls: AcpToolCall[] = [];
  private pending: { type: "text" | "thinking"; content: string } | null = null;
  private callIndex = new Map<string, number>();

  private flush() {
    if (!this.pending) return;
    const content = this.pending.type === "text" ? stripPerformativeTag(this.pending.content.trim()) : this.pending.content.trim();
    if (content) this.segments.push({ type: this.pending.type, content });
    this.pending = null;
  }

  text(content: string) {
    if (this.pending?.type === "text") this.pending.content += content;
    else {
      this.flush();
      this.pending = { type: "text", content };
    }
  }

  thinking(content: string) {
    if (this.pending?.type === "thinking") this.pending.content += content;
    else {
      this.flush();
      this.pending = { type: "thinking", content };
    }
  }

  error(content: string) {
    this.flush();
    if (content) this.segments.push({ type: "error", content });
  }

  toolStart(callId: string, tool: string, args: unknown) {
    this.flush();
    const last = this.segments[this.segments.length - 1];
    if (last && last.type === "toolGroup") {
      last.callIds.push(callId);
    } else {
      this.segments.push({ type: "toolGroup", callIds: [callId] });
    }
    this.callIndex.set(callId, this.toolCalls.length);
    this.toolCalls.push({ callId, tool, args, ok: false, message: "(in progress)", startedAt: Date.now() });
  }

  toolResult(callId: string, tool: string, ok: boolean, message: string, data?: unknown) {
    const idx = this.callIndex.get(callId);
    if (idx === undefined) {
      // Result without a matching start (some CLI providers emit one). Record
      // it anyway so the call is visible on reload.
      this.callIndex.set(callId, this.toolCalls.length);
      this.toolCalls.push({ callId, tool, ok, message, data, startedAt: Date.now(), completedAt: Date.now() });
      return;
    }
    const call = this.toolCalls[idx]!;
    call.ok = ok;
    call.message = message;
    call.data = data;
    call.completedAt = Date.now();
  }

  finalize() {
    this.flush();
    // Default any calls that never produced a result (timeout/abort) so every
    // entry has the required fields the web renderer expects.
    for (const call of this.toolCalls) {
      if (call.completedAt === undefined) {
        call.ok = false;
        call.message = "(no result — sub-agent stopped before completing)";
        call.completedAt = Date.now();
      }
    }
    return { segments: this.segments, toolCalls: this.toolCalls };
  }
}

export interface AcpSpecialistTurnOptions {
  providerRegistry: ProviderRegistry;
  config: { host: string; port: number };
  providerId: string;
  userId: string;
  /** Parent chat session id — the specialist's thread is scoped under it. */
  sessionId: string;
  subAgentId: string;
  projectRoot: string;
  runtimeMode?: string;
  model?: string;
  prompt: string;
  abortSignal?: AbortSignal;
  /** Defaults to 8 minutes — specialist turns can involve real tool work. */
  timeoutMs?: number;
  /**
   * Forwards the specialist's live work (tool calls, assistant text, reasoning)
   * onto the parent turn's stream so the UI renders it as a normal chat turn.
   */
  onNestedEvent?: (event: NestedAgentEvent) => void;
  /**
   * Decides tool approvals when the provider runs supervised. Without it the
   * CLI's approval requests go unanswered and the turn stalls until the
   * timeout, so callers that pass `runtimeMode: "supervised"` must supply one.
   */
  onApprovalRequired?: (request: { tool: string; args: unknown; requestId: string }) => Promise<boolean>;
}

function resolveRuntimeMode(provider: CliProviderAdapter, requested?: string): RuntimeMode {
  const modes = provider.info.modes;
  if (requested && (modes as string[]).includes(requested)) return requested as RuntimeMode;
  return modes[0] ?? "full-access";
}

/**
 * Run a single delegated turn against a CLI (ACP) provider and return the
 * accumulated assistant text as a tool result. Always stops the provider
 * session afterward — this is a one-shot specialist call, not a persistent
 * chat.
 */
export async function runAcpSpecialistTurn(opts: AcpSpecialistTurnOptions): Promise<ToolResult> {
  const startedAt = Date.now();
  const provider = opts.providerRegistry.getForUser(opts.providerId, opts.userId);
  if (!provider) {
    return { ok: false, message: `Provider "${opts.providerId}" is not available for this account.` };
  }

  let available: boolean;
  try {
    available = await provider.checkAvailability();
  } catch (err) {
    return {
      ok: false,
      message: `Could not check availability of provider "${opts.providerId}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!available) {
    const reason = provider.info.unavailableReason;
    return { ok: false, message: `Provider "${opts.providerId}" is currently unavailable${reason ? `: ${reason}` : "."}` };
  }

  const subThreadId = `${opts.sessionId}:sub:${opts.subAgentId}`;
  const mcpServers = opts.providerRegistry.buildJaitMcpServerRefs(opts.config, undefined, {
    sessionId: subThreadId,
    projectRoot: opts.projectRoot,
  });

  let session;
  try {
    session = await provider.startSession({
      threadId: subThreadId,
      workingDirectory: opts.projectRoot,
      mode: resolveRuntimeMode(provider, opts.runtimeMode),
      model: opts.model,
      mcpServers,
    });
  } catch (err) {
    return {
      ok: false,
      message: `Failed to start ${opts.providerId} session for specialist: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const chunks: string[] = [];
  const emitNested = opts.onNestedEvent;
  const collector = new SubAgentTranscriptCollector();
  const handleEvent = (event: ProviderEvent) => {
    if (event.sessionId !== session.id) return;
    if (event.type === "token") {
      chunks.push(event.content);
      collector.text(event.content);
      emitNested?.({ type: "tool_output", call_id: "", content: event.content, channel: "text" });
    } else if (event.type === "session.error") {
      chunks.push(`\n[error] ${event.error}`);
      collector.error(event.error);
    } else if (event.type === "thinking") {
      collector.thinking(event.content);
      emitNested?.({ type: "tool_output", call_id: "", content: event.content, channel: "thinking" });
    } else if (event.type === "tool.start") {
      const callId = event.callId ?? `${opts.subAgentId}-${event.tool}`;
      collector.toolStart(callId, event.tool, event.args);
      emitNested?.({ type: "tool_start", tool: event.tool, args: event.args, call_id: callId, parent_call_id: event.parentCallId });
    } else if (event.type === "tool.output") {
      emitNested?.({ type: "tool_output", call_id: event.callId, content: event.content });
    } else if (event.type === "tool.result") {
      const callId = event.callId ?? `${opts.subAgentId}-${event.tool}`;
      collector.toolResult(callId, event.tool, event.ok, event.message, event.data);
      emitNested?.({ type: "tool_result", call_id: callId, tool: event.tool, ok: event.ok, message: event.message, parent_call_id: event.parentCallId, data: event.data });
    } else if (event.type === "tool.approval-required" && opts.onApprovalRequired) {
      // Supervised runs block here until the caller decides. Errors deny: a
      // broken approval path must not silently grant tool access.
      void opts.onApprovalRequired({ tool: event.tool, args: event.args, requestId: event.requestId })
        .catch(() => false)
        .then((approved) => provider.respondToApproval(session.id, event.requestId, approved))
        .catch((err) => {
          chunks.push(`\n[error] could not answer approval for ${event.tool}: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
  };
  const unsubscribe = provider.onEvent(handleEvent);

  const timeoutMs = opts.timeoutMs ?? 8 * 60_000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const abort = opts.abortSignal
    ? new Promise<"aborted">((resolve) => {
        opts.abortSignal!.addEventListener("abort", () => resolve("aborted"), { once: true });
      })
    : null;

  // Every path below carries the collected segments + tool calls so the parent
  // turn's tool-result payload (and therefore the DB row) has the same
  // structured sub-agent message a jait-backend specialist would produce —
  // this is what lets the web layer render a persisted sub-agent turn.
  // `collector.finalize()` is called lazily here (not up front) so the pending
  // trailing text/thinking gets flushed only after the turn's events have all
  // arrived.
  const withData = (
    message: string,
    ok: boolean,
    extra: Record<string, unknown> = {},
  ): ToolResult => {
    const collected = collector.finalize();
    return {
      ok,
      message,
      data: {
        subAgentId: opts.subAgentId,
        provider: opts.providerId,
        content: chunks.join("").trim(),
        segments: collected.segments,
        toolCalls: collected.toolCalls,
        durationMs: Date.now() - startedAt,
        ...extra,
      },
    };
  };

  let result: ToolResult;
  try {
    const raced = await Promise.race([
      provider.sendTurn(session.id, opts.prompt).then(() => "completed" as const),
      timeout,
      ...(abort ? [abort] : []),
    ]);
    if (raced === "timeout") {
      result = withData(
        `Specialist timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${opts.providerId}.${chunks.length ? ` Partial output:\n${chunks.join("")}` : ""}`,
        false,
      );
    } else if (raced === "aborted") {
      result = withData("Cancelled before the specialist finished.", false);
    } else {
      const content = chunks.join("").trim();
      const { performative, content: cleanContent } = parsePerformative(content);
      const ok = isSuccessfulPerformative(performative);
      result = withData(
        cleanContent || (ok ? "(specialist produced no output)" : `Sub-agent ${performative}: no details given`),
        ok,
        { performative },
      );
    }
  } catch (err) {
    // Same as the timeout/abort paths: whatever the specialist streamed before
    // it threw is real work and must reach the DB, so the reloaded transcript
    // shows the turn up to the failure instead of a bare error line.
    const message = `Specialist turn on ${opts.providerId} failed: ${err instanceof Error ? err.message : String(err)}`;
    collector.error(message);
    result = withData(message, false);
  } finally {
    clearTimeout(timeoutHandle);
    unsubscribe();
    try {
      await provider.stopSession(session.id);
    } catch { /* best effort cleanup */ }
  }

  return result;
}
