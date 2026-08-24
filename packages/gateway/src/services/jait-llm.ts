import { decodeJaitModelId, parseJaitBackendInstances } from "@jait/shared";
import { inferContextWindow, type AppConfig } from "../config.js";
import type { LLMConfig } from "../tools/agent-loop.js";
import type { JaitBackend } from "./users.js";

/**
 * Issue a one-shot (non-streaming) OpenAI-compatible /chat/completions request
 * through the user's configured Jait backend. This is the exact same request
 * path the agent loop uses for non-Ollama backends, so model aliases, the
 * OpenRouter base URL, the BigModel (GLM) OpenAI-compatible API, and per-user
 * API keys are all handled consistently. Ad-hoc callers (git commit-message
 * generation, thread-title generation, etc.) should use this instead of
 * hand-rolling their own fetch, so they never diverge from how chat resolves
 * the model.
 */
export async function callJaitLlmCompletion(
  llm: ResolvedJaitLlmConfig,
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  // Ollama's native /api/chat endpoint is only needed for streaming num_ctx
  // control. For a single non-streaming completion the OpenAI-compatible
  // /v1/chat/completions endpoint works fine and keeps the URL shape uniform.
  const url = `${llm.openaiBaseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llm.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: llm.openaiModel,
      messages,
      max_tokens: options.maxTokens ?? 256,
      temperature: options.temperature ?? 0.3,
      // Explicit, not implied: OpenAI treats a missing `stream` as false, but
      // OmniRoute defaults to streaming and answers with text/event-stream —
      // which makes the res.json() below throw. Every caller here wants one
      // complete response, so say so rather than relying on the backend's default.
      stream: false,
    }),
    signal: options.signal,
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = (errBody["error"] as Record<string, unknown> | undefined)?.["message"] as
      | string
      | undefined;
    throw new Error(msg ?? `LLM request failed (${res.status})`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === "text" ? part.text ?? "" : ""))
      .join("")
      .trim();
  }
  throw new Error("LLM returned no content");
}

export class JaitConfigError extends Error {
  readonly code = "CONFIG_ERROR" as const;
}

export interface ResolveJaitLlmOptions {
  config: AppConfig;
  apiKeys?: Record<string, string>;
  requestedModel?: string;
  jaitBackend?: JaitBackend | null;
}

export interface ResolvedJaitLlmConfig extends LLMConfig {
  backend: JaitBackend;
}

const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4.1": "openai/gpt-4.1",
  "gpt-4.1-mini": "openai/gpt-4.1-mini",
  "gpt-4.1-nano": "openai/gpt-4.1-nano",
  "o4-mini": "openai/o4-mini",
  "o3": "openai/o3",
  "o3-mini": "openai/o3-mini",
  "deepseek-chat": "deepseek/deepseek-chat-v3-0324",
  "deepseek-reasoner": "deepseek/deepseek-r1",
  "mimo v2 pro": "xiaomi/mimo-v2-pro",
  "mimo-v2-pro": "xiaomi/mimo-v2-pro",
  "xiaomi mimo v2 pro": "xiaomi/mimo-v2-pro",
  "xiaomi: mimo-v2-pro": "xiaomi/mimo-v2-pro",
  "xiaomi/mimo-v2-pro": "xiaomi/mimo-v2-pro",
  // Compatibility shim for stale UI state / user-entered labels.
  "mimo v3 pro": "xiaomi/mimo-v2-pro",
  "mimo-v3-pro": "xiaomi/mimo-v2-pro",
  "xiaomi mimo v3 pro": "xiaomi/mimo-v2-pro",
  "xiaomi/mimo-v3-pro": "xiaomi/mimo-v2-pro",
  "hunter-alpha": "xiaomi/mimo-v2-pro",
  "mimo v2 flash": "xiaomi/mimo-v2-flash",
  "mimo-v2-flash": "xiaomi/mimo-v2-flash",
  "xiaomi mimo v2 flash": "xiaomi/mimo-v2-flash",
  "xiaomi: mimo-v2-flash": "xiaomi/mimo-v2-flash",
  "xiaomi/mimo-v2-flash": "xiaomi/mimo-v2-flash",
  "mimo v2 omni": "xiaomi/mimo-v2-omni",
  "mimo-v2-omni": "xiaomi/mimo-v2-omni",
  "xiaomi mimo v2 omni": "xiaomi/mimo-v2-omni",
  "xiaomi: mimo-v2-omni": "xiaomi/mimo-v2-omni",
  "xiaomi/mimo-v2-omni": "xiaomi/mimo-v2-omni",
};

export function normalizeOpenRouterModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;
  const normalizedKey = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (OPENROUTER_MODEL_ALIASES[normalizedKey]) {
    return OPENROUTER_MODEL_ALIASES[normalizedKey];
  }
  if (trimmed.includes("/")) return trimmed;
  return OPENROUTER_MODEL_ALIASES[trimmed] ?? trimmed;
}

/**
 * Bare Claude Code CLI model aliases (see CLAUDE_CODE_FALLBACK_MODELS in
 * acp-provider.ts). These only resolve inside the Claude Code ACP subprocess
 * — they are not real model ids for any HTTP /chat/completions backend
 * (OpenAI-compatible, Ollama, OpenRouter). If one of these leaks through to
 * resolveJaitLlmConfig — e.g. a swarm specialist inheriting the parent
 * session's ACP model name while sub-agent delegation only supports HTTP
 * backends — sending it straight to Ollama/OpenAI/OpenRouter 404s with a
 * cryptic "model not found" deep inside the LLM call, after which the
 * sub-agent (and often the whole swarm turn) silently produces nothing.
 * Fail fast with an actionable message instead.
 */
const ACP_ONLY_MODEL_ALIASES = new Set(["default", "fable", "sonnet", "opus", "haiku", "opusplan"]);

export function resolveJaitLlmConfig(options: ResolveJaitLlmOptions): ResolvedJaitLlmConfig {
  const apiKeys = options.apiKeys ?? {};
  const routedModel = options.requestedModel
    ? decodeJaitModelId(options.requestedModel.trim())
    : null;
  const instances = parseJaitBackendInstances(apiKeys["JAIT_BACKEND_INSTANCES"]);
  const routedInstance = routedModel
    ? instances.find((instance) => (
        instance.id === routedModel.instanceId
        && instance.type === routedModel.backend
      ))
    : undefined;

  if (routedModel && !routedInstance) {
    throw new JaitConfigError(
      `Jait backend instance "${routedModel.instanceId}" is no longer configured. Pick a model from an available backend instance.`,
    );
  }

  const backend = routedModel?.backend ?? options.jaitBackend ?? "openai";
  const concreteRequestedModel = routedModel?.model
    || routedInstance?.model
    || options.requestedModel?.trim()
    || apiKeys["OPENAI_MODEL"]?.trim()
    || options.config.openaiModel;

  if (ACP_ONLY_MODEL_ALIASES.has(concreteRequestedModel.toLowerCase())) {
    throw new JaitConfigError(
      `Model "${concreteRequestedModel}" is a Claude Code CLI alias and only resolves inside the Claude Code app — it can't be used for sub-agent/swarm delegation, which calls models over HTTP. Pick a concrete API model (not a CLI provider) for swarm work, or run this task without swarm mode.`,
    );
  }

  if (backend === "ollama") {
    const ollamaUrl = routedInstance?.baseUrl
      || apiKeys["OLLAMA_URL"]?.trim()
      || options.config.ollamaUrl
      || "http://localhost:11434";
    const ollamaModel = routedModel?.model
      || routedInstance?.model
      || options.requestedModel?.trim()
      || apiKeys["OLLAMA_MODEL"]?.trim()
      || options.config.ollamaModel
      || "llama3";
    const ollamaNumCtx = routedInstance?.numCtx || parseInt(
      apiKeys["OLLAMA_NUM_CTX"]?.trim()
        || apiKeys["OLLAMA_CONTEXT_LENGTH"]?.trim()
        || "",
      10,
    ) || options.config.ollamaContextWindow;
    return {
      backend: "ollama",
      openaiApiKey: routedInstance?.apiKey || "ollama",
      openaiBaseUrl: `${ollamaUrl.replace(/\/+$/, "")}/v1`,
      openaiModel: ollamaModel,
      contextWindow: ollamaNumCtx,
      numCtx: ollamaNumCtx,
    };
  }

  if (backend === "omniroute") {
    const omnirouteBaseUrl = routedInstance?.baseUrl
      || apiKeys["OMNIROUTE_BASE_URL"]?.trim()
      || options.config.omnirouteBaseUrl
      || "http://localhost:20128/v1";
    const omnirouteModel = routedModel?.model
      || routedInstance?.model
      || options.requestedModel?.trim()
      || apiKeys["OMNIROUTE_MODEL"]?.trim()
      || "auto";
    return {
      backend: "omniroute",
      openaiApiKey: routedInstance?.apiKey
        || apiKeys["OMNIROUTE_API_KEY"]?.trim()
        || options.config.omnirouteApiKey
        || "omniroute",
      openaiBaseUrl: omnirouteBaseUrl.replace(/\/+$/, ""),
      openaiModel: omnirouteModel,
      contextWindow: inferContextWindow(omnirouteModel),
    };
  }

  const configuredBaseUrl = routedInstance?.baseUrl
    || apiKeys["OPENAI_BASE_URL"]?.trim()
    || options.config.openaiBaseUrl;
  const requestedModel = routedModel?.model
    || routedInstance?.model
    || options.requestedModel?.trim()
    || apiKeys["OPENAI_MODEL"]?.trim()
    || options.config.openaiModel;
  const openRouterKey = routedInstance?.apiKey || apiKeys["OPENROUTER_API_KEY"]?.trim();
  const isOpenRouterBaseUrl = configuredBaseUrl.toLowerCase().includes("openrouter.ai");
  const useOpenRouter = backend === "openrouter"
    || (!routedInstance && requestedModel.includes("/"))
    || isOpenRouterBaseUrl;
  const effectiveModel = useOpenRouter ? normalizeOpenRouterModelId(requestedModel) : requestedModel;

  if (backend === "openrouter" && !openRouterKey) {
    throw new JaitConfigError(
      routedInstance
        ? "An API key is required for the selected OpenRouter backend instance"
        : "OPENROUTER_API_KEY is required when the Jait backend provider is set to OpenRouter",
    );
  }

  return {
    backend,
    openaiApiKey: backend === "openai" && routedInstance?.apiKey
      ? routedInstance.apiKey
      : useOpenRouter && openRouterKey
        ? openRouterKey
        : (apiKeys["OPENAI_API_KEY"]?.trim() || options.config.openaiApiKey),
    openaiBaseUrl: routedInstance
      ? configuredBaseUrl.replace(/\/+$/, "")
      : useOpenRouter && openRouterKey
        ? "https://openrouter.ai/api/v1"
        : configuredBaseUrl,
    openaiModel: effectiveModel,
    contextWindow: inferContextWindow(effectiveModel),
  };
}
