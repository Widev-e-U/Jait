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
import { resolveJaitLlmConfig } from "../services/jait-llm.js";
import type { ThreadService } from "../services/threads.js";
import type { UserService } from "../services/users.js";
import {
  buildSystemPrompt,
  buildTieredToolSchemas,
  runAgentLoop,
  type AgentLoopEvent,
  type LLMConfig,
} from "../tools/index.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { ToolRegistry } from "../tools/registry.js";
import type {
  CliProviderAdapter,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";

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
}

export class JaitProvider implements CliProviderAdapter {
  readonly id = "jait" as const;
  readonly info: ProviderInfo = {
    id: "jait",
    name: "Jait (Built-in)",
    description: "Jait's native agent loop using OpenAI-compatible APIs with full tool access",
    available: true, // Always available — it's the built-in provider
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessions = new Map<string, JaitSessionState>();

  constructor(private readonly deps: JaitProviderDeps) {}

  async checkAvailability(): Promise<boolean> {
    this.info.available = true;
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return JAIT_MODELS;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const thread = this.deps.threadService.getById(options.threadId);
    const userId = thread?.userId ?? undefined;
    const llm = this.buildLlmConfig(userId, options.model);
    const prompt = buildSystemPrompt(
      "agent",
      { model: llm.openaiModel, baseUrl: llm.openaiBaseUrl },
      { workspaceRoot: options.workingDirectory },
    );
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
    state.history.push({ role: "user", content: message });
    this.emit({ type: "turn.started", sessionId });

    const turnPromise = (async () => {
      try {
        const userSettings = state.userId ? this.deps.userService?.getSettings(state.userId) : undefined;
        const disabledTools = userSettings?.disabledTools?.length
          ? new Set(userSettings.disabledTools)
          : undefined;
        const toolSchemas = this.deps.toolRegistry
          ? buildTieredToolSchemas(this.deps.toolRegistry, disabledTools)
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
              runtimeMode: state.session.runtimeMode,
            },
            abort,
            maxRounds: 15,
            parallel: true,
            toolRegistry: this.deps.toolRegistry,
            disabledTools,
            mode: "agent",
            onEvent: (event) => this.forwardAgentLoopEvent(sessionId, event),
          },
          (toolName, input, sid, auth, onOutputChunk, signal) =>
            this.executeTool(toolName, input, sid, auth, onOutputChunk, signal, state.workingDirectory),
        );

        if (result.content) {
          this.emit({ type: "message", sessionId, role: "assistant", content: result.content });
        }

        const session = this.sessions.get(sessionId)?.session;
        if (session) {
          session.status = abort.signal.aborted ? "interrupted" : "running";
        }
        this.emit({ type: "turn.completed", sessionId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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

  private buildLlmConfig(userId?: string, requestedModel?: string): LLMConfig {
    const userSettings = userId ? this.deps.userService?.getSettings(userId) : undefined;
    return resolveJaitLlmConfig({
      config: this.deps.config,
      apiKeys: userSettings?.apiKeys,
      requestedModel,
      jaitBackend: userSettings?.jaitBackend,
    });
  }

  private async executeTool(
    toolName: string,
    input: unknown,
    sessionId: string,
    auth: { userId?: string; apiKeys?: Record<string, string>; providerId?: string; model?: string; runtimeMode?: string } | undefined,
    onOutputChunk: ((chunk: string) => void) | undefined,
    signal: AbortSignal | undefined,
    workspaceRoot: string,
  ): Promise<ToolResult> {
    if (!this.deps.toolRegistry) {
      return { ok: false, message: "Tool registry not available" };
    }
    const context: ToolContext = {
      sessionId,
      actionId: uuidv7(),
      workspaceRoot,
      requestedBy: "agent",
      userId: auth?.userId,
      apiKeys: auth?.apiKeys,
      providerId: auth?.providerId,
      model: auth?.model,
      runtimeMode: auth?.runtimeMode,
      onOutputChunk,
      signal,
    };
    try {
      return this.deps.toolExecutor
        ? await this.deps.toolExecutor(toolName, input, context)
        : await this.deps.toolRegistry.execute(toolName, input, context);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
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
  { id: "o4-mini", name: "o4 Mini", description: "Reasoning model" },
  { id: "o3", name: "o3", description: "Advanced reasoning" },
  { id: "o3-mini", name: "o3 Mini", description: "Fast reasoning" },
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
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", description: "DeepSeek reasoning via OpenRouter" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", description: "Meta's latest open model" },
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", description: "Meta's efficient open model" },
  { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B", description: "Alibaba's largest model" },
  { id: "mistralai/mistral-large-2411", name: "Mistral Large", description: "Mistral's flagship" },
  { id: "x-ai/grok-3-mini-beta", name: "Grok 3 Mini", description: "xAI's reasoning model" },
];
