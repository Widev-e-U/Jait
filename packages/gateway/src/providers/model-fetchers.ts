/**
 * Model fetchers for external provider catalogues.
 *
 * Each function calls the provider's /models endpoint, applies provider-specific
 * filtering, and caches the result in-memory with a TTL. Caches are keyed by URL
 * so callers using different base URLs do not collide.
 */

import type { ProviderModelInfo } from "./contracts.js";

// ── Constants ────────────────────────────────────────────────────

/** TTL for remote provider catalogues (OpenAI, OpenRouter). */
const REMOTE_CACHE_TTL = 5 * 60 * 1000;

/** TTL for local Ollama catalogue (fast, often changing). */
const OLLAMA_CACHE_TTL = 30 * 1000;

/** Timeout for any single /models fetch. */
const FETCH_TIMEOUT_MS = 5_000;

/** Maximum number of OpenRouter models to return (UI list cap). */
const OPENROUTER_MAX_MODELS = 100;

/**
 * Maximum number of OmniRoute models to return (its catalogue runs to 500+).
 *
 * Overridable with `OMNIROUTE_MAX_MODELS` so a self-hosted router with a large
 * catalogue (or a specific model that sorts past the default cap) can surface
 * everything the owner wants in the picker. Set it to `0` to disable the cap
 * and return the full catalogue. The default of 150 keeps the UI list
 * responsive for the common case.
 */
const OMNIROUTE_MAX_MODELS = (() => {
  const raw = process.env["OMNIROUTE_MAX_MODELS"]?.trim();
  if (raw === undefined || raw === "") return 150;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0; // 0 (or garbage) => no cap
})();

/**
 * Bare `auto` is accepted as a request model but is *not* returned by
 * /v1/models (verified against OmniRoute 3.8.49), so it has to be added by
 * hand or the one id that always works would be missing from the picker.
 *
 * The narrower strategies (`auto/coding`, `auto/best-reasoning`, `auto/cheap`,
 * … — 38 of them in 3.8.49) are all listed by the catalogue itself and are
 * deliberately not duplicated here: hardcoding names that shift between
 * versions would eventually offer models the router no longer knows.
 */
const OMNIROUTE_ROUTING_ALIASES: ProviderModelInfo[] = [
  { id: "auto", name: "auto", description: "Smart routing with tier fallback", isDefault: true },
];

/** OpenAI model ID prefixes that represent chat-completion-capable models. */
const OPENAI_CHAT_PREFIXES = ["gpt-", "o1", "o3", "o4", "chatgpt-"];

/** Substrings that mark an OpenAI model as non-chat (realtime, audio, etc). */
const OPENAI_NON_CHAT_SUBSTRINGS = [
  ":ft-",
  "realtime",
  "transcribe",
  "tts",
  "dall-e",
  "whisper",
  "audio",
  "image",
  "embedding",
];

// ── Caches ───────────────────────────────────────────────────────

let openRouterCache: { models: ProviderModelInfo[]; fetchedAt: number } | null = null;
const openaiCaches = new Map<string, { models: ProviderModelInfo[]; fetchedAt: number }>();
const ollamaCaches = new Map<string, { models: ProviderModelInfo[]; fetchedAt: number }>();
const omnirouteCaches = new Map<string, { models: ProviderModelInfo[]; fetchedAt: number }>();

// In-flight guards so a stale-while-revalidate refresh never stampedes.
let openRouterInflight: Promise<ProviderModelInfo[]> | null = null;
const openaiInflight = new Map<string, Promise<ProviderModelInfo[]>>();
const ollamaInflight = new Map<string, Promise<ProviderModelInfo[]>>();
const omnirouteInflight = new Map<string, Promise<ProviderModelInfo[]>>();

/** Clear all cached model lists. Intended for tests. */
export function resetModelFetcherCaches(): void {
  openRouterCache = null;
  openaiCaches.clear();
  ollamaCaches.clear();
  omnirouteCaches.clear();
  openRouterInflight = null;
  openaiInflight.clear();
  ollamaInflight.clear();
  omnirouteInflight.clear();
}

// ── Filters (pure, exported for testing) ─────────────────────────

export function isChatCapableOpenAIModelId(id: string): boolean {
  if (!id) return false;
  if (!OPENAI_CHAT_PREFIXES.some((p) => id.startsWith(p))) return false;
  return !OPENAI_NON_CHAT_SUBSTRINGS.some((s) => id.includes(s));
}

/**
 * Whether a model id accepts the OpenAI `reasoning_effort` parameter.
 * Covers OpenAI o-series and GPT-5 reasoning models, plus reasoning variants
 * commonly exposed via OpenRouter (deepseek-r1, grok-3-mini, mimo, qwen3-thinking).
 */
export function supportsReasoningEffort(id: string): boolean {
  if (!id) return false;
  const lower = id.toLowerCase();
  // OpenAI o-series & GPT-5 reasoning models
  if (/^o\d+(?:-mini)?/i.test(lower)) return true;
  if (/^gpt-5/.test(lower)) return true;
  // Reasoning models reachable via OpenRouter / compatible gateways
  if (lower.includes("deepseek-r1")) return true;
  if (lower.includes("grok-3-mini")) return true;
  if (lower.includes("mimo")) return true;
  if (lower.includes("qwen3") && lower.includes("think")) return true;
  if (lower.includes("reason")) return true;
  return false;
}

// ── Fetchers ─────────────────────────────────────────────────────

/**
 * Fetch the OpenRouter catalogue. Returns [] on any non-OK response.
 *
 * Stale-while-revalidate: once a catalogue has been cached, callers get it
 * instantly and a refresh runs in the background when the entry has expired, so
 * the model list endpoint never blocks on the network after the first load.
 */
export async function fetchOpenRouterModels(apiKey: string): Promise<ProviderModelInfo[]> {
  if (openRouterCache) {
    if (Date.now() - openRouterCache.fetchedAt >= REMOTE_CACHE_TTL && !openRouterInflight) {
      openRouterInflight = doFetchOpenRouterModels(apiKey).finally(() => { openRouterInflight = null; });
      openRouterInflight.catch(() => {});
    }
    return openRouterCache.models;
  }
  if (!openRouterInflight) {
    openRouterInflight = doFetchOpenRouterModels(apiKey).finally(() => { openRouterInflight = null; });
  }
  return openRouterInflight;
}

async function doFetchOpenRouterModels(apiKey: string): Promise<ProviderModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return openRouterCache?.models ?? [];
    const data = (await res.json()) as {
      data?: Array<{ id: string; name?: string; description?: string }>;
    };
    const models: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => m.id && !m.id.includes(":free"))
      .slice(0, OPENROUTER_MAX_MODELS)
      .map((m) => ({
        id: m.id,
        name: m.name || m.id.split("/").pop() || m.id,
        description: m.description?.slice(0, 80),
        reasoningEffortSupported: supportsReasoningEffort(m.id),
      }));
    openRouterCache = { models, fetchedAt: Date.now() };
    return models;
  } catch (err) {
    if (openRouterCache) return openRouterCache.models;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch the OpenAI (or OpenAI-compatible) catalogue. Returns [] on any non-OK response. */
export async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ProviderModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  const cacheKey = `${url}\n${apiKey}`;
  const cached = openaiCaches.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.fetchedAt >= REMOTE_CACHE_TTL && !openaiInflight.has(cacheKey)) {
      const refresh = doFetchOpenAIModels(apiKey, url, cacheKey)
        .finally(() => { openaiInflight.delete(cacheKey); });
      openaiInflight.set(cacheKey, refresh);
      refresh.catch(() => {});
    }
    return cached.models;
  }
  let request = openaiInflight.get(cacheKey);
  if (!request) {
    request = doFetchOpenAIModels(apiKey, url, cacheKey)
      .finally(() => { openaiInflight.delete(cacheKey); });
    openaiInflight.set(cacheKey, request);
  }
  return request;
}

async function doFetchOpenAIModels(apiKey: string, url: string, cacheKey: string): Promise<ProviderModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return openaiCaches.get(cacheKey)?.models ?? [];
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    const officialOpenAI = url.toLowerCase().includes("api.openai.com");
    const models: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => !officialOpenAI || isChatCapableOpenAIModelId(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        description: m.owned_by ? `by ${m.owned_by}` : undefined,
        reasoningEffortSupported: supportsReasoningEffort(m.id),
      }));
    openaiCaches.set(cacheKey, { models, fetchedAt: Date.now() });
    return models;
  } catch (err) {
    const cached = openaiCaches.get(cacheKey);
    if (cached) return cached.models;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the OmniRoute catalogue from its OpenAI-compatible /models endpoint.
 *
 * Unlike {@link fetchOpenAIModels} this deliberately skips
 * {@link isChatCapableOpenAIModelId}: OmniRoute fronts ~290 providers, so
 * filtering to `gpt-*`/`o*` prefixes would discard almost the entire catalogue.
 *
 * The routing aliases are prepended on success because they are not reliably
 * listed by /v1/models. An unreachable router returns [] rather than the bare
 * aliases — the router is local and often simply not running, and offering
 * models that cannot answer is worse than showing no group at all.
 */
export async function fetchOmniRouteModels(
  apiKey: string,
  baseUrl: string,
): Promise<ProviderModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  const cacheKey = `${url}\n${apiKey}`;
  const cached = omnirouteCaches.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.fetchedAt >= REMOTE_CACHE_TTL && !omnirouteInflight.has(cacheKey)) {
      const refresh = doFetchOmniRouteModels(apiKey, url, cacheKey)
        .finally(() => { omnirouteInflight.delete(cacheKey); });
      omnirouteInflight.set(cacheKey, refresh);
      refresh.catch(() => {});
    }
    return cached.models;
  }
  let request = omnirouteInflight.get(cacheKey);
  if (!request) {
    request = doFetchOmniRouteModels(apiKey, url, cacheKey)
      .finally(() => { omnirouteInflight.delete(cacheKey); });
    omnirouteInflight.set(cacheKey, request);
  }
  return request;
}

async function doFetchOmniRouteModels(
  apiKey: string,
  url: string,
  cacheKey: string,
): Promise<ProviderModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) return omnirouteCaches.get(cacheKey)?.models ?? [];
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    const aliasIds = new Set(OMNIROUTE_ROUTING_ALIASES.map((m) => m.id));
    const catalogue: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => m.id && !aliasIds.has(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, OMNIROUTE_MAX_MODELS > 0 ? OMNIROUTE_MAX_MODELS : undefined)
      .map((m) => ({
        id: m.id,
        name: m.id,
        description: m.owned_by ? `by ${m.owned_by}` : undefined,
        reasoningEffortSupported: supportsReasoningEffort(m.id),
      }));
    const models = [...OMNIROUTE_ROUTING_ALIASES, ...catalogue];
    omnirouteCaches.set(cacheKey, { models, fetchedAt: Date.now() });
    return models;
  } catch {
    // The router is local and often simply not running — a normal state, not an
    // error worth failing the whole model list over.
    return omnirouteCaches.get(cacheKey)?.models ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch the Ollama tags catalogue. Returns [] on any non-OK response. */
export async function fetchOllamaModels(baseUrl: string): Promise<ProviderModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  const cached = ollamaCaches.get(url);
  if (cached) {
    if (Date.now() - cached.fetchedAt >= OLLAMA_CACHE_TTL && !ollamaInflight.has(url)) {
      const refresh = doFetchOllamaModels(url).finally(() => { ollamaInflight.delete(url); });
      ollamaInflight.set(url, refresh);
      refresh.catch(() => {});
    }
    return cached.models;
  }
  let request = ollamaInflight.get(url);
  if (!request) {
    request = doFetchOllamaModels(url).finally(() => { ollamaInflight.delete(url); });
    ollamaInflight.set(url, request);
  }
  return request;
}

async function doFetchOllamaModels(url: string): Promise<ProviderModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    if (!res.ok) return ollamaCaches.get(url)?.models ?? [];
    const data = (await res.json()) as {
      models?: Array<{
        name: string;
        size?: number;
        details?: { parameter_size?: string; family?: string };
      }>;
    };
    const models: ProviderModelInfo[] = (data.models ?? []).map((m) => ({
      id: m.name,
      name: m.name,
      description: [m.details?.family, m.details?.parameter_size].filter(Boolean).join(" · ") || undefined,
    }));
    ollamaCaches.set(url, { models, fetchedAt: Date.now() });
    return models;
  } catch (err) {
    const cached = ollamaCaches.get(url);
    if (cached) return cached.models;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
