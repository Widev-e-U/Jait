/**
 * Model fetchers for external provider catalogues.
 *
 * Each function calls the provider's /models endpoint, applies provider-specific
 * filtering, and caches the result in-memory with a TTL. Caches are keyed by URL
 * so callers using different base URLs do not collide.
 */

import { normalizeJaitBackendBaseUrl } from "@jait/shared";
import type { ProviderModelInfo } from "./contracts.js";

// ── Constants ────────────────────────────────────────────────────

/** TTL for remote provider catalogues (OpenAI, OpenRouter). */
const REMOTE_CACHE_TTL = 5 * 60 * 1000;

/** TTL for local Ollama catalogue (fast, often changing). */
const OLLAMA_CACHE_TTL = 30 * 1000;

/** Timeout for any single /models fetch. */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Public Ollama Cloud catalogue.
 *
 * A local daemon's `/api/tags` only reports the hosted models somebody already
 * pulled, so relying on it alone hid most of Ollama Cloud from the picker.
 */
const OLLAMA_CLOUD_CATALOGUE_URL = "https://ollama.com/api/tags";

/** Timeout for the cloud probes. They are optional extras, never blockers. */
const OLLAMA_CLOUD_TIMEOUT_MS = 4_000;

/** TTL for the cloud catalogue probe of a given daemon. */
const OLLAMA_CLOUD_CACHE_TTL = 5 * 60 * 1000;

/** Group label used for hosted models so the picker can show them separately. */
const OLLAMA_CLOUD_GROUP = "Ollama Cloud";

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
/** Cloud catalogue per daemon URL — `[]` records a signed-out daemon. */
const ollamaCloudCaches = new Map<string, { models: ProviderModelInfo[]; fetchedAt: number }>();
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
  ollamaCloudCaches.clear();
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
      data?: Array<{
        id: string;
        name?: string;
        description?: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => m.id && !m.id.includes(":free"))
      .slice(0, OPENROUTER_MAX_MODELS)
      .map((m) => {
        const pricing = parseOpenRouterPricing(m.pricing);
        const info: ProviderModelInfo = {
          id: m.id,
          name: m.name || m.id.split("/").pop() || m.id,
          description: m.description?.slice(0, 80),
          reasoningEffortSupported: supportsReasoningEffort(m.id),
        };
        if (pricing) info.pricing = pricing;
        return info;
      });
    openRouterCache = { models, fetchedAt: Date.now() };
    return models;
  } catch (err) {
    if (openRouterCache) return openRouterCache.models;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * OpenRouter publishes USD per *token* as decimal strings; convert to the
 * per-1M-token shape used elsewhere. Returns undefined when the payload has no
 * usable numbers, so callers see "price unknown" instead of a fake zero.
 */
function parseOpenRouterPricing(
  pricing?: { prompt?: string; completion?: string },
): ProviderModelInfo["pricing"] | undefined {
  const perMillion = (value?: string): number | undefined => {
    if (!value) return undefined;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return Math.round(parsed * 1_000_000 * 1e6) / 1e6;
  };
  const promptPerMTok = perMillion(pricing?.prompt);
  const completionPerMTok = perMillion(pricing?.completion);
  if (promptPerMTok === undefined && completionPerMTok === undefined) return undefined;
  const result: NonNullable<ProviderModelInfo["pricing"]> = {};
  if (promptPerMTok !== undefined) result.promptPerMTok = promptPerMTok;
  if (completionPerMTok !== undefined) result.completionPerMTok = completionPerMTok;
  return result;
}

/** Fetch the OpenAI (or OpenAI-compatible) catalogue. Returns [] on any non-OK response. */
export async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ProviderModelInfo[]> {
  const url = normalizeJaitBackendBaseUrl(baseUrl);
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
  const url = normalizeJaitBackendBaseUrl(baseUrl);
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

export interface FetchOllamaModelsOptions {
  /** Bypass the caches — used by the picker's "Refresh models" action. */
  force?: boolean;
  /** Merge the hosted Ollama Cloud catalogue for signed-in daemons. */
  includeCloud?: boolean;
}

/** Shape of an entry in either the local `/api/tags` or the cloud catalogue. */
interface OllamaTag {
  name?: string;
  model?: string;
  capabilities?: string[];
  details?: { family?: string; parameter_size?: string };
}

/**
 * Is this daemon signed in to Ollama Cloud?
 *
 * `/api/me` is the only account endpoint a local daemon exposes; it answers 200
 * with a `plan` for signed-in users and 404/401 otherwise.
 */
async function isOllamaCloudSignedIn(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/me`, { method: "POST", signal });
    if (!res.ok) return false;
    const data = (await res.json()) as { plan?: unknown };
    return typeof data?.plan === "string" && data.plan.length > 0;
  } catch {
    return false;
  }
}

/**
 * Map cloud catalogue entries to provider models.
 *
 * Cloud entries carry no `family` or `parameter_size`, so the description falls
 * back to the reported capabilities.
 */
export function mapOllamaCloudModels(tags: OllamaTag[]): ProviderModelInfo[] {
  const seen = new Set<string>();
  const models: ProviderModelInfo[] = [];
  for (const tag of tags) {
    const id = (tag?.name ?? tag?.model ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const description =
      [tag.details?.family, tag.details?.parameter_size].filter(Boolean).join(" · ") ||
      (tag.capabilities ?? [])
        .filter((capability) => capability && capability !== "completion")
        .join(", ") ||
      undefined;
    models.push({ id, name: id, description, group: OLLAMA_CLOUD_GROUP });
  }
  return models;
}

/**
 * Merge the hosted catalogue into the local list.
 *
 * Local entries win, and the `:cloud`/`-cloud` suffix is ignored when comparing
 * so a locally pulled `llama3:8b` (or `llama3:8b-cloud`) does not show up twice
 * next to its hosted counterpart.
 */
export function mergeOllamaModels(
  local: ProviderModelInfo[],
  cloud: ProviderModelInfo[],
): ProviderModelInfo[] {
  if (cloud.length === 0) return local;
  const stripCloudSuffix = (id: string) => id.replace(/(:cloud|-cloud)$/, "");
  const known = new Set<string>();
  for (const model of local) {
    known.add(model.id);
    known.add(stripCloudSuffix(model.id));
  }
  return [
    ...local,
    ...cloud.filter((model) => !known.has(model.id) && !known.has(stripCloudSuffix(model.id))),
  ];
}

async function doFetchOllamaCloudModels(url: string): Promise<ProviderModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_CLOUD_TIMEOUT_MS);
  try {
    if (!(await isOllamaCloudSignedIn(url, controller.signal))) {
      ollamaCloudCaches.set(url, { models: [], fetchedAt: Date.now() });
      return [];
    }
    const res = await fetch(OLLAMA_CLOUD_CATALOGUE_URL, { signal: controller.signal });
    if (!res.ok) return ollamaCloudCaches.get(url)?.models ?? [];
    const data = (await res.json()) as { models?: OllamaTag[] };
    const models = mapOllamaCloudModels(data.models ?? []);
    ollamaCloudCaches.set(url, { models, fetchedAt: Date.now() });
    return models;
  } catch {
    // The cloud catalogue is an optional extra; never fail the list over it.
    return ollamaCloudCaches.get(url)?.models ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOllamaCloudModels(url: string, force: boolean): Promise<ProviderModelInfo[]> {
  const cached = ollamaCloudCaches.get(url);
  if (!force && cached && Date.now() - cached.fetchedAt < OLLAMA_CLOUD_CACHE_TTL) {
    return cached.models;
  }
  return doFetchOllamaCloudModels(url);
}

/**
 * Fetch the Ollama tags catalogue. Returns [] on any non-OK response.
 *
 * `includeCloud` also merges the hosted Ollama Cloud catalogue for daemons that
 * are signed in, because `/api/tags` only reports cloud models already pulled.
 */
export async function fetchOllamaModels(
  baseUrl: string,
  opts: FetchOllamaModelsOptions = {},
): Promise<ProviderModelInfo[]> {
  const url = normalizeJaitBackendBaseUrl(baseUrl);
  const force = opts.force === true;
  const cached = ollamaCaches.get(url);

  let local: ProviderModelInfo[];
  if (force || !cached) {
    local = await refreshOllamaModels(url);
  } else {
    if (Date.now() - cached.fetchedAt >= OLLAMA_CACHE_TTL && !ollamaInflight.has(url)) {
      const refresh = doFetchOllamaModels(url).finally(() => { ollamaInflight.delete(url); });
      ollamaInflight.set(url, refresh);
      refresh.catch(() => {});
    }
    local = cached.models;
  }

  if (!opts.includeCloud) return local;
  const cloud = await fetchOllamaCloudModels(url, force);
  return mergeOllamaModels(local, cloud);
}

function refreshOllamaModels(url: string): Promise<ProviderModelInfo[]> {
  const inflight = ollamaInflight.get(url);
  if (inflight) return inflight;
  const request = doFetchOllamaModels(url).finally(() => { ollamaInflight.delete(url); });
  ollamaInflight.set(url, request);
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
