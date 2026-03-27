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

export function resolveJaitLlmConfig(options: ResolveJaitLlmOptions): ResolvedJaitLlmConfig {
  const apiKeys = options.apiKeys ?? {};
  const configuredBaseUrl = apiKeys["OPENAI_BASE_URL"]?.trim() || options.config.openaiBaseUrl;
  const backend = options.jaitBackend ?? "openai";
  const effectiveModel = options.requestedModel?.trim()
    || apiKeys["OPENAI_MODEL"]?.trim()
    || options.config.openaiModel;
  const isOpenRouterModel = effectiveModel.includes("/");
  const isOpenRouterBaseUrl = configuredBaseUrl.toLowerCase().includes("openrouter.ai");
  const openRouterKey = apiKeys["OPENROUTER_API_KEY"]?.trim();
  const useOpenRouter = backend === "openrouter" || isOpenRouterModel || isOpenRouterBaseUrl;

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
