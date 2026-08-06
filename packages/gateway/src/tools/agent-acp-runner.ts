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

import type { ToolResult } from "./contracts.js";
import type { CliProviderAdapter, ProviderEvent } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { RuntimeMode } from "@jait/shared/types";

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
  const handleEvent = (event: ProviderEvent) => {
    if (event.sessionId !== session.id) return;
    if (event.type === "token") chunks.push(event.content);
    else if (event.type === "session.error") chunks.push(`\n[error] ${event.error}`);
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

  let result: ToolResult;
  try {
    const raced = await Promise.race([
      provider.sendTurn(session.id, opts.prompt).then(() => "completed" as const),
      timeout,
      ...(abort ? [abort] : []),
    ]);
    if (raced === "timeout") {
      result = {
        ok: false,
        message: `Specialist timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${opts.providerId}.${chunks.length ? ` Partial output:\n${chunks.join("")}` : ""}`,
      };
    } else if (raced === "aborted") {
      result = { ok: false, message: "Cancelled before the specialist finished." };
    } else {
      const content = chunks.join("").trim();
      result = { ok: true, message: content || "(specialist produced no output)" };
    }
  } catch (err) {
    result = {
      ok: false,
      message: `Specialist turn on ${opts.providerId} failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeoutHandle);
    unsubscribe();
    try {
      await provider.stopSession(session.id);
    } catch { /* best effort cleanup */ }
  }

  return result;
}
