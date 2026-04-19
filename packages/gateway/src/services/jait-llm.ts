import { inferContextWindow, type AppConfig } from "../config.js";
import type { LLMConfig } from "../tools/agent-loop.js";
import type { JaitBackend } from "./users.js";

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

export function resolveJaitLlmConfig(options: ResolveJaitLlmOptions): ResolvedJaitLlmConfig {
  const apiKeys = options.apiKeys ?? {};
  const configuredBaseUrl = apiKeys["OPENAI_BASE_URL"]?.trim() || options.config.openaiBaseUrl;
  const backend = options.jaitBackend ?? "openai";
  const requestedModel = options.requestedModel?.trim()
    || apiKeys["OPENAI_MODEL"]?.trim()
    || options.config.openaiModel;

  // ── Ollama backend ───────────────────────────────────────────────
  if (backend === "ollama") {
    const ollamaUrl = apiKeys["OLLAMA_URL"]?.trim()
      || options.config.ollamaUrl
      || "http://localhost:11434";
    // Only use the explicit request model (from the UI model picker), not OpenAI defaults
    const ollamaModel = options.requestedModel?.trim()
      || apiKeys["OLLAMA_MODEL"]?.trim()
      || options.config.ollamaModel
      || "llama3";
    return {
      backend: "ollama",
      openaiApiKey: "ollama", // Ollama's OpenAI-compat endpoint ignores the key but requires a non-empty value
      openaiBaseUrl: `${ollamaUrl.replace(/\/+$/, "")}/v1`,
      openaiModel: ollamaModel,
      contextWindow: inferContextWindow(ollamaModel),
    };
  }

  const isOpenRouterModel = requestedModel.includes("/");
  const isOpenRouterBaseUrl = configuredBaseUrl.toLowerCase().includes("openrouter.ai");
  const openRouterKey = apiKeys["OPENROUTER_API_KEY"]?.trim();
  const useOpenRouter = backend === "openrouter" || isOpenRouterModel || isOpenRouterBaseUrl;
  const effectiveModel = useOpenRouter ? normalizeOpenRouterModelId(requestedModel) : requestedModel;

  if (backend === "openrouter" && !openRouterKey && !isOpenRouterBaseUrl) {
    throw new JaitConfigError(
      "OPENROUTER_API_KEY is required when the Jait backend provider is set to OpenRouter",
    );
  }

  return {
    backend,
    openaiApiKey: useOpenRouter && openRouterKey
      ? openRouterKey
      : (apiKeys["OPENAI_API_KEY"]?.trim() || options.config.openaiApiKey),
    openaiBaseUrl: useOpenRouter && openRouterKey
      ? "https://openrouter.ai/api/v1"
      : configuredBaseUrl,
    openaiModel: effectiveModel,
    contextWindow: inferContextWindow(effectiveModel),
  };
}
