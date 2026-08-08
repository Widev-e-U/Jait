/**
 * Catalogue of models reachable through the built-in Jait provider.
 *
 * The Jait provider talks to whichever OpenAI-compatible backend the owner has
 * configured, so "which models exist" is the union of the OpenAI, OpenRouter
 * and Ollama catalogues rather than one static list. Both the provider REST
 * route and the messaging channels resolve it through here, so the model picker
 * in the web UI and `/model` in a chat offer exactly the same set.
 */

import type { AppConfig } from "../config.js";
import type { ProviderModelInfo } from "../providers/contracts.js";
import {
  fetchOpenAIModels,
  fetchOpenRouterModels,
  fetchOllamaModels,
} from "../providers/model-fetchers.js";

/** Backend a model is served by — shown as the group/provider in pickers. */
export type JaitModelGroup = "OpenAI" | "OpenRouter" | "Ollama";

export interface ListJaitModelsOptions {
  config: AppConfig;
  /** Owner API keys; per-user values win over the gateway config. */
  apiKeys?: Record<string, string>;
  /**
   * Static catalogue used as the OpenAI fallback when no key is configured or
   * the API call fails — normally `JaitProvider.listModels()`.
   */
  fallbackModels: ProviderModelInfo[];
}

/**
 * Union of the configured backends' catalogues, each tagged with its group.
 *
 * The three fetches are independent network calls and run concurrently, so the
 * worst case is a single timeout instead of the sum of all three. A backend
 * that is unreachable contributes nothing rather than failing the lot.
 */
export async function listJaitModels(options: ListJaitModelsOptions): Promise<ProviderModelInfo[]> {
  const { config, fallbackModels } = options;
  const apiKeys = options.apiKeys ?? {};

  const openaiKey = apiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
  const openaiBaseUrl = apiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl || "https://api.openai.com/v1";
  const openaiModelsP: Promise<ProviderModelInfo[]> = (async () => {
    const fallback = fallbackModels.map((m) => ({ ...m, group: "OpenAI" }));
    if (!(openaiKey && openaiBaseUrl.includes("openai.com"))) return fallback;
    try {
      const apiModels = await fetchOpenAIModels(openaiKey, openaiBaseUrl);
      return apiModels.length > 0 ? apiModels.map((m) => ({ ...m, group: "OpenAI" })) : fallback;
    } catch {
      return fallback;
    }
  })();

  const openRouterKey = apiKeys["OPENROUTER_API_KEY"]?.trim();
  const openRouterModelsP: Promise<ProviderModelInfo[]> = (async () => {
    if (!openRouterKey) return [];
    try {
      const orModels = await fetchOpenRouterModels(openRouterKey);
      if (orModels.length > 0) return orModels.map((m) => ({ ...m, group: "OpenRouter" }));
    } catch {
      // fall through to the static list
    }
    const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
    return OPENROUTER_MODELS.map((m) => ({ ...m, group: "OpenRouter" }));
  })();

  const ollamaUrl = apiKeys["OLLAMA_URL"]?.trim() || config.ollamaUrl;
  const ollamaModelsP: Promise<ProviderModelInfo[]> = (async () => {
    if (!ollamaUrl) return [];
    try {
      const ollamaModels = await fetchOllamaModels(ollamaUrl);
      return ollamaModels.map((m) => ({ ...m, group: "Ollama" }));
    } catch {
      // Ollama unreachable — skip
      return [];
    }
  })();

  const [openai, openRouter, ollama] = await Promise.all([
    openaiModelsP,
    openRouterModelsP,
    ollamaModelsP,
  ]);

  return [...openai, ...openRouter, ...ollama];
}
