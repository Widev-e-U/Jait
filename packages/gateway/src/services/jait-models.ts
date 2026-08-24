/**
 * Catalogue of models reachable through the built-in Jait provider.
 *
 * Legacy environment-style settings expose the historic four backend groups.
 * Once named backend instances are configured, every model id carries the
 * owning instance so the request can be routed deterministically.
 */

import {
  encodeJaitModelId,
  parseJaitBackendInstances,
  type JaitBackend,
  type JaitBackendInstanceConfig,
} from "@jait/shared";
import type { AppConfig } from "../config.js";
import type { ProviderModelInfo } from "../providers/contracts.js";
import {
  fetchOpenAIModels,
  fetchOpenRouterModels,
  fetchOllamaModels,
  fetchOmniRouteModels,
} from "../providers/model-fetchers.js";

export type JaitModelGroup = "OpenAI" | "OpenRouter" | "Ollama" | "OmniRoute";

export interface ListJaitModelsOptions {
  config: AppConfig;
  apiKeys?: Record<string, string>;
  fallbackModels: ProviderModelInfo[];
}

const BACKEND_LABELS: Record<JaitBackend, JaitModelGroup> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  omniroute: "OmniRoute",
};

function configuredModelFallback(
  instance: JaitBackendInstanceConfig,
  fallbackModels: ProviderModelInfo[],
): ProviderModelInfo[] {
  if (instance.model) {
    return [{
      id: instance.model,
      name: instance.model,
      isDefault: true,
    }];
  }
  return instance.type === "openai" ? fallbackModels : [];
}

async function fetchConfiguredInstanceModels(
  instance: JaitBackendInstanceConfig,
  fallbackModels: ProviderModelInfo[],
): Promise<ProviderModelInfo[]> {
  let models: ProviderModelInfo[] = [];
  try {
    if (instance.type === "openai") {
      models = await fetchOpenAIModels(instance.apiKey ?? "", instance.baseUrl);
    } else if (instance.type === "openrouter") {
      models = await fetchOpenRouterModels(instance.apiKey ?? "");
      if (models.length === 0) {
        const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
        models = OPENROUTER_MODELS;
      }
    } else if (instance.type === "ollama") {
      models = await fetchOllamaModels(instance.baseUrl);
    } else {
      models = await fetchOmniRouteModels(instance.apiKey ?? "", instance.baseUrl);
    }
  } catch {
    models = [];
  }

  if (models.length === 0) {
    models = configuredModelFallback(instance, fallbackModels);
  }

  const group = `${instance.name} · ${BACKEND_LABELS[instance.type]}`;
  return models.map((model) => ({
    ...model,
    id: encodeJaitModelId(instance.type, instance.id, model.id),
    group,
    description: [BACKEND_LABELS[instance.type], model.description].filter(Boolean).join(" · "),
  }));
}

async function listConfiguredModels(
  instances: JaitBackendInstanceConfig[],
  fallbackModels: ProviderModelInfo[],
): Promise<ProviderModelInfo[]> {
  const catalogues = await Promise.all(
    instances.map((instance) => fetchConfiguredInstanceModels(instance, fallbackModels)),
  );
  return catalogues.flat();
}

async function listLegacyModels(options: ListJaitModelsOptions): Promise<ProviderModelInfo[]> {
  const { config, fallbackModels } = options;
  const apiKeys = options.apiKeys ?? {};

  const openaiKey = apiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
  const openaiBaseUrl = apiKeys["OPENAI_BASE_URL"]?.trim()
    || config.openaiBaseUrl
    || "https://api.openai.com/v1";
  const openaiModelsP: Promise<ProviderModelInfo[]> = (async () => {
    const fallback = fallbackModels.map((model) => ({ ...model, group: "OpenAI" }));
    if (!openaiKey) return fallback;
    try {
      const models = await fetchOpenAIModels(openaiKey, openaiBaseUrl);
      return models.length > 0
        ? models.map((model) => ({ ...model, group: "OpenAI" }))
        : fallback;
    } catch {
      return fallback;
    }
  })();

  const openRouterKey = apiKeys["OPENROUTER_API_KEY"]?.trim();
  const openRouterModelsP: Promise<ProviderModelInfo[]> = (async () => {
    if (!openRouterKey) return [];
    try {
      const models = await fetchOpenRouterModels(openRouterKey);
      if (models.length > 0) {
        return models.map((model) => ({ ...model, group: "OpenRouter" }));
      }
    } catch {
      // Fall through to the static catalogue.
    }
    const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
    return OPENROUTER_MODELS.map((model) => ({ ...model, group: "OpenRouter" }));
  })();

  const ollamaUrl = apiKeys["OLLAMA_URL"]?.trim() || config.ollamaUrl;
  const ollamaModelsP: Promise<ProviderModelInfo[]> = (async () => {
    if (!ollamaUrl) return [];
    try {
      const models = await fetchOllamaModels(ollamaUrl);
      return models.map((model) => ({ ...model, group: "Ollama" }));
    } catch {
      return [];
    }
  })();

  const omnirouteBaseUrl = apiKeys["OMNIROUTE_BASE_URL"]?.trim() || config.omnirouteBaseUrl;
  const omnirouteModelsP: Promise<ProviderModelInfo[]> = (async () => {
    if (!omnirouteBaseUrl) return [];
    try {
      const key = apiKeys["OMNIROUTE_API_KEY"]?.trim() || config.omnirouteApiKey;
      const models = await fetchOmniRouteModels(key, omnirouteBaseUrl);
      return models.map((model) => ({ ...model, group: "OmniRoute" }));
    } catch {
      return [];
    }
  })();

  const catalogues = await Promise.all([
    openaiModelsP,
    openRouterModelsP,
    ollamaModelsP,
    omnirouteModelsP,
  ]);
  return catalogues.flat();
}

export async function listJaitModels(options: ListJaitModelsOptions): Promise<ProviderModelInfo[]> {
  const instances = parseJaitBackendInstances(options.apiKeys?.["JAIT_BACKEND_INSTANCES"]);
  if (instances.length > 0) {
    return listConfiguredModels(instances, options.fallbackModels);
  }
  return listLegacyModels(options);
}
