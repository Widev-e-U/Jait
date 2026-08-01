/**
 * Jait Provider — wraps Jait's own runAgentLoop as a provider adapter.
 *
 * This is the default provider that uses the existing OpenAI-compatible
 * agent loop with Jait's full tool registry, consent, and memory.
 * It doesn't spawn a child process — it runs in-process.
 */

import { EventEmitter } from "node:events";
import type { AppConfig } from "../config.js";
import { uuidv7 } from "../db/uuidv7.js";
import { resolveJaitLlmConfig, type ResolvedJaitLlmConfig } from "../services/jait-llm.js";
import type { ThreadService } from "../services/threads.js";
import type { UserService } from "../services/users.js";
import {
  buildSystemPrompt,
  buildTieredToolSchemas,
  computeContextUsage,
  pruneHistory,
  runAgentLoop,
  type AgentLoopEvent,
  type LlmContextFlowRound,
} from "../tools/index.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { ToolRegistry } from "../tools/registry.js";
import { SandboxManager } from "../security/sandbox-manager.js";
import type {
  CliProviderAdapter,
  ProviderInfo,
  ProviderAuthStatus,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";
import { NO_PROVIDER_AUTH, unsupportedLogin, unsupportedLogout } from "./provider-auth.js";

const JAIT_SANDBOXED_COMMAND_TOOLS = new Set(["execute", "terminal.run", "jait.terminal"]);
const MAX_ACTIVATED_TOOL_NAMES = 20;

function rememberActivatedToolNames(activeNames: Set<string>, toolNames: Iterable<string>): void {
  for (const toolName of toolNames) {
    activeNames.delete(toolName);
    activeNames.add(toolName);
  }
  while (activeNames.size > MAX_ACTIVATED_TOOL_NAMES) {
    const oldestName = activeNames.values().next().value;
    if (typeof oldestName !== "string") break;
    activeNames.delete(oldestName);
  }
}

function discoveredToolNames(result: { executedToolCalls: Array<{ tool: string; ok: boolean; data?: unknown }> }): string[] {
  const names: string[] = [];
  for (const call of result.executedToolCalls) {
    if (call.tool !== "tools.search" || !call.ok || !call.data || typeof call.data !== "object") continue;
    const matches = (call.data as { matches?: Array<{ name?: unknown }> }).matches;
    if (!Array.isArray(matches)) continue;
    for (const match of matches) {
      if (typeof match.name === "string") names.push(match.name);
    }
  }
  return names;
}

function shouldUseJaitThreadSandbox(toolName: string): boolean {
  return JAIT_SANDBOXED_COMMAND_TOOLS.has(toolName);
}

export function prepareJaitThreadSandboxToolInput(toolName: string, input: unknown): unknown {
  if (!shouldUseJaitThreadSandbox(toolName)) return input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  return {
    ...(input as Record<string, unknown>),
    sandbox: true,
    sandboxMountMode: "read-write",
  };
}

function buildJaitThreadSandboxPrompt(): string {
  return [
    "<jaitThreadSandbox>",
    "Jait native provider threads follow a Sandcastle-style local sandbox flow.",
    "File operations target the thread working directory, which may be a managed git worktree.",
    "Shell-command tools (`execute`, `terminal.run`, `jait.terminal`) are forced through a long-lived Jait Docker sandbox with the working directory mounted at /project.",
    "Use relative paths or /project paths inside shell commands; host absolute project paths are remapped for shell commands.",
    "</jaitThreadSandbox>",
  ].join("\n");
}

interface JaitSessionState {
  session: ProviderSession;
  threadId: string;
  workingDirectory: string;
  model?: string;
  userId?: string;
  history: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: import("../tools/agent-loop.js").OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
  }>;
  currentTurnAbort?: AbortController;
  currentTurn?: Promise<void>;
  contextRounds?: LlmContextFlowRound[];
  activatedToolNames: Set<string>;
  sandboxContainerName?: string;
  sandboxStart?: Promise<string>;
}

export interface JaitProviderDeps {
  config: AppConfig;
  threadService: ThreadService;
  userService?: UserService;
  toolRegistry?: ToolRegistry;
  toolExecutor?: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => Promise<ToolResult>;
  sandboxManager?: Pick<SandboxManager, "startCommandSandbox" | "stopContainer">;
}

export class JaitProvider implements CliProviderAdapter {
  readonly id = "jait" as const;
  readonly info: ProviderInfo = {
    id: "jait",
    name: "Jait (Built-in)",
    description: "Jait's native agent loop using OpenAI-compatible APIs with full tool access",
    available: true, // Always available — it's the built-in provider
    modes: ["full-access", "supervised"],
    auth: NO_PROVIDER_AUTH,
  };

  private emitter = new EventEmitter();
  private sessions = new Map<string, JaitSessionState>();
  private sandboxManager: Pick<SandboxManager, "startCommandSandbox" | "stopContainer">;

  constructor(private readonly deps: JaitProviderDeps) {
    this.sandboxManager = deps.sandboxManager ?? new SandboxManager();
  }

  async checkAvailability(): Promise<boolean> {
    this.info.available = true;
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return JAIT_MODELS;
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    return {
      ...NO_PROVIDER_AUTH,
      authenticated: null,
      detail: "Jait uses API keys configured in Jait settings rather than a CLI login.",
    };
  }

  async startLogin(): Promise<ProviderLoginResult> {
    return unsupportedLogin(this.id, "Jait uses API keys configured in Jait settings rather than a CLI login.");
  }

  async logout(): Promise<ProviderLogoutResult> {
    return unsupportedLogout(this.id, "Jait uses API keys configured in Jait settings rather than a CLI login.");
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const thread = this.deps.threadService.getById(options.threadId);
    const userId = thread?.userId ?? undefined;
    const llm = this.buildLlmConfig(userId, options.model);
    const prompt = buildSystemPrompt(
      "agent",
      { model: llm.openaiModel, baseUrl: llm.openaiBaseUrl },
      { projectRoot: options.workingDirectory },
    ) + `\n\n${buildJaitThreadSandboxPrompt()}`;
    const session: ProviderSession = {
      id: uuidv7(),
      providerId: "jait",
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, {
      session,
      threadId: options.threadId,
      workingDirectory: options.workingDirectory,
      model: options.model,
      userId,
      history: [{ role: "system", content: prompt }],
      activatedToolNames: new Set(),
    });
    this.emit({ type: "session.started", sessionId: session.id });
    return session;
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Unknown Jait session: ${sessionId}`);
    }
    if (state.currentTurn) {
      throw new Error("A turn is already in progress for this Jait session.");
    }

    const abort = new AbortController();
    state.currentTurnAbort = abort;
    state.contextRounds = [];
    state.history.push({ role: "user", content: message });
    this.emit({ type: "turn.started", sessionId });

    const turnPromise = (async () => {
      let streamedAssistantContent = "";
      let persistedAssistantContent = "";
      const flushStreamedAssistantMessage = () => {
        if (!streamedAssistantContent) return;
        this.emit({ type: "message", sessionId, role: "assistant", content: streamedAssistantContent });
        persistedAssistantContent += streamedAssistantContent;
        streamedAssistantContent = "";
      };

      try {
        const userSettings = state.userId ? this.deps.userService?.getSettings(state.userId) : undefined;
        const disabledTools = userSettings?.disabledTools?.length
          ? new Set(userSettings.disabledTools)
          : undefined;
        if (this.deps.toolRegistry) {
          const selected = this.deps.toolRegistry.selectForLLM(message, disabledTools);
          rememberActivatedToolNames(state.activatedToolNames, selected.map((tool) => tool.name));
        }
        const toolSchemas = this.deps.toolRegistry
          ? buildTieredToolSchemas(this.deps.toolRegistry, disabledTools, {
              activatedToolNames: state.activatedToolNames,
            })
          : [];
        const llm = this.buildLlmConfig(state.userId, state.model);
        const result = await runAgentLoop(
          {
            llm,
            history: state.history,
            toolSchemas,
            hasTools: toolSchemas.length > 0,
            sessionId,
            auth: {
              userId: state.userId,
              apiKeys: userSettings?.apiKeys ?? {},
              providerId: "jait",
              model: llm.openaiModel,
              jaitBackend: llm.backend,
              runtimeMode: state.session.runtimeMode,
            },
            abort,
            maxRounds: this.resolveMaxRounds(userSettings?.apiKeys),
            parallel: true,
            toolRegistry: this.deps.toolRegistry,
            disabledTools,
            mode: "agent",
            onEvent: (event) => {
              if (event.type === "token") {
                streamedAssistantContent += event.content;
              } else if (event.type === "tool_start") {
                flushStreamedAssistantMessage();
              }
              this.forwardAgentLoopEvent(sessionId, event);
            },
            onContext: (round) => this.forwardContextRound(sessionId, state, round),
          },
          (toolName, input, sid, auth, onOutputChunk, signal) =>
            this.executeTool(toolName, input, sid, auth, onOutputChunk, signal, state.workingDirectory),
        );

        rememberActivatedToolNames(state.activatedToolNames, discoveredToolNames(result));

        // ── Post-turn history compaction ───────────────────────────────
        // After runAgentLoop mutates the shared history, compact it so the next turn
        // starts with a bounded context window. Without this, messages from all previous
        // turns accumulate in state.history forever (user + assistant + tool results).
        if (llm.contextWindow > 0) {
          const postUsage = computeContextUsage(
            state.history,
            toolSchemas,
            llm.contextWindow,
          );
          if (postUsage.ratio >= 0.45) {
            pruneHistory(state.history, llm.contextWindow, toolSchemas);
            console.info(`Post-turn history compacted: ${state.history.length} messages → ratio was ${(postUsage.ratio * 100).toFixed(0)}%`);
          }
        }

        const remainingContent = result.content.startsWith(persistedAssistantContent)
          ? result.content.slice(persistedAssistantContent.length)
          : result.content;
        streamedAssistantContent = remainingContent || streamedAssistantContent;
        flushStreamedAssistantMessage();

        const session = this.sessions.get(sessionId)?.session;
        if (session) {
          session.status = abort.signal.aborted ? "interrupted" : "running";
        }
        this.emit({ type: "turn.completed", sessionId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        flushStreamedAssistantMessage();
        const session = this.sessions.get(sessionId)?.session;
        if (session) {
          session.status = "error";
          session.error = message;
        }
        this.emit({ type: "session.error", sessionId, error: message });
      } finally {
        const current = this.sessions.get(sessionId);
        if (current) {
          current.currentTurn = undefined;
          current.currentTurnAbort = undefined;
        }
      }
    })();

    state.currentTurn = turnPromise;
    await turnPromise;
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.currentTurnAbort?.abort();
    state.session.status = "interrupted";
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    // Jait uses its own ConsentManager — this is a no-op
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.currentTurnAbort?.abort();
      state.session.status = "completed";
      state.session.completedAt = new Date().toISOString();
      if (state.currentTurn) {
        await state.currentTurn.catch(() => {});
      }
      const containerName = state.sandboxStart
        ? await state.sandboxStart.catch(() => undefined)
        : state.sandboxContainerName;
      if (containerName) {
        await this.sandboxManager.stopContainer(containerName).catch(() => {});
      }
      this.emit({ type: "session.completed", sessionId });
    }
    this.sessions.delete(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private buildLlmConfig(userId?: string, requestedModel?: string): ResolvedJaitLlmConfig {
    const userSettings = userId ? this.deps.userService?.getSettings(userId) : undefined;
    return resolveJaitLlmConfig({
      config: this.deps.config,
      apiKeys: userSettings?.apiKeys,
      requestedModel,
      jaitBackend: userSettings?.jaitBackend,
    });
  }

  /**
   * Resolve the max autonomous tool-calling rounds for a turn.
   * Per-user `JAIT_MAX_ROUNDS` setting takes precedence, then the gateway
   * config default. Clamped to a sane ceiling to avoid runaway loops.
   */
  private resolveMaxRounds(apiKeys?: Record<string, string>): number {
    const raw = apiKeys?.["JAIT_MAX_ROUNDS"]?.trim();
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 200);
    }
    return this.deps.config.agentMaxRounds;
  }

  private async executeTool(
    toolName: string,
    input: unknown,
    sessionId: string,
    auth: { userId?: string; apiKeys?: Record<string, string>; providerId?: string; model?: string; jaitBackend?: string; runtimeMode?: string } | undefined,
    onOutputChunk: ((chunk: string) => void) | undefined,
    signal: AbortSignal | undefined,
    projectRoot: string,
  ): Promise<ToolResult> {
    if (!this.deps.toolRegistry) {
      return { ok: false, message: "Tool registry not available" };
    }
    const state = this.sessions.get(sessionId);
    const toolInput = prepareJaitThreadSandboxToolInput(toolName, input);
    let sandboxContainerName: string | undefined;
    if (state && shouldUseJaitThreadSandbox(toolName)) {
      try {
        sandboxContainerName = await this.ensureThreadSandbox(state);
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const context: ToolContext = {
      sessionId,
      actionId: uuidv7(),
      projectRoot,
      requestedBy: "agent",
      userId: auth?.userId,
      apiKeys: auth?.apiKeys,
      providerId: auth?.providerId,
      model: auth?.model,
      jaitBackend: auth?.jaitBackend,
      runtimeMode: auth?.runtimeMode,
      sandboxContainerName,
      onOutputChunk,
      signal,
    };
    try {
      return this.deps.toolExecutor
        ? await this.deps.toolExecutor(toolName, toolInput, context)
        : await this.deps.toolRegistry.execute(toolName, toolInput, context);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  private async ensureThreadSandbox(state: JaitSessionState): Promise<string> {
    if (state.sandboxContainerName) return state.sandboxContainerName;
    if (!state.sandboxStart) {
      state.sandboxStart = this.sandboxManager.startCommandSandbox({
        projectRoot: state.workingDirectory,
        mountMode: "read-write",
        networkEnabled: true,
      }).then((result) => {
        state.sandboxContainerName = result.containerName;
        return result.containerName;
      }).catch((error) => {
        state.sandboxStart = undefined;
        throw error;
      });
    }
    return state.sandboxStart;
  }

  private forwardContextRound(sessionId: string, state: JaitSessionState, round: LlmContextFlowRound): void {
    // Accumulate rounds so we can emit the full flow each time
    if (!state.contextRounds) state.contextRounds = [];
    state.contextRounds.push(round);
    const llm = this.buildLlmConfig(state.userId, state.model);
    this.emit({
      type: "activity",
      sessionId,
      kind: "context_flow",
      summary: `Round ${round.round} context`,
      payload: {
        provider: "jait",
        model: llm.openaiModel,
        rounds: state.contextRounds,
      },
    });
  }

  private forwardAgentLoopEvent(sessionId: string, event: AgentLoopEvent): void {
    switch (event.type) {
      case "token":
        this.emit({ type: "token", sessionId, content: event.content });
        break;
      case "tool_start":
        this.emit({ type: "tool.start", sessionId, tool: event.tool, args: event.args, callId: event.call_id });
        break;
      case "tool_output":
        this.emit({ type: "tool.output", sessionId, callId: event.call_id, content: event.content });
        break;
      case "tool_result":
        this.emit({
          type: "tool.result",
          sessionId,
          tool: event.tool,
          ok: event.ok,
          message: event.message,
          callId: event.call_id,
          data: event.data,
        });
        break;
      case "error":
        this.emit({ type: "activity", sessionId, kind: "error", summary: event.message });
        break;
      default:
        break;
    }
  }
}

const JAIT_MODELS: ProviderModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o", description: "OpenAI's flagship multimodal model", isDefault: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable" },
  { id: "gpt-4.1", name: "GPT-4.1", description: "Latest GPT-4 series" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", description: "Fast GPT-4.1" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", description: "Ultra-fast, lightweight" },
  { id: "o4-mini", name: "o4 Mini", description: "Reasoning model", reasoningEffortSupported: true },
  { id: "o3", name: "o3", description: "Advanced reasoning", reasoningEffortSupported: true },
  { id: "o3-mini", name: "o3 Mini", description: "Fast reasoning", reasoningEffortSupported: true },
  { id: "claude-sonnet-4-6-20250318", name: "Claude Sonnet 4.6", description: "Via OpenRouter/compatible API" },
  { id: "deepseek-chat", name: "DeepSeek V3", description: "DeepSeek's latest" },
  { id: "deepseek-reasoner", name: "DeepSeek R1", description: "DeepSeek reasoning model" },
];

/** Models available when using OpenRouter as the base URL or API key. */
export const OPENROUTER_MODELS: ProviderModelInfo[] = [
  { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4", description: "Anthropic's latest Sonnet" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", description: "Fast and capable" },
  { id: "anthropic/claude-3-opus", name: "Claude 3 Opus", description: "Most powerful Claude" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", description: "Fast and affordable" },
  { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro", description: "Google's latest" },
  { id: "google/gemini-2.5-flash-preview", name: "Gemini 2.5 Flash", description: "Fast Google model" },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", description: "DeepSeek's latest via OpenRouter" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", description: "DeepSeek reasoning via OpenRouter", reasoningEffortSupported: true },
  { id: "xiaomi/mimo-v2-pro", name: "MiMo-V2-Pro", description: "Xiaomi's flagship agent model" },
  { id: "xiaomi/mimo-v2-flash", name: "MiMo-V2-Flash", description: "Fast Xiaomi reasoning and coding model" },
  { id: "xiaomi/mimo-v2-omni", name: "MiMo-V2-Omni", description: "Multimodal Xiaomi agent model" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", description: "Meta's latest open model" },
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", description: "Meta's efficient open model" },
  { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B", description: "Alibaba's largest model" },
  { id: "mistralai/mistral-large-2411", name: "Mistral Large", description: "Mistral's flagship" },
  { id: "x-ai/grok-3-mini-beta", name: "Grok 3 Mini", description: "xAI's reasoning model", reasoningEffortSupported: true },
];
