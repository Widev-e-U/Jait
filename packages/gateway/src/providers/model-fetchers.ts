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
let openaiCache: { models: ProviderModelInfo[]; fetchedAt: number; baseUrl: string } | null = null;
let ollamaCache: { models: ProviderModelInfo[]; fetchedAt: number; url: string } | null = null;

/** Clear all cached model lists. Intended for tests. */
export function resetModelFetcherCaches(): void {
  openRouterCache = null;
  openaiCache = null;
  ollamaCache = null;
}

// ── Filters (pure, exported for testing) ─────────────────────────

export function isChatCapableOpenAIModelId(id: string): boolean {
  if (!id) return false;
  if (!OPENAI_CHAT_PREFIXES.some((p) => id.startsWith(p))) return false;
  return !OPENAI_NON_CHAT_SUBSTRINGS.some((s) => id.includes(s));
}

// ── Fetchers ─────────────────────────────────────────────────────

/** Fetch the OpenRouter catalogue. Returns [] on any non-OK response. */
export async function fetchOpenRouterModels(apiKey: string): Promise<ProviderModelInfo[]> {
  if (openRouterCache && Date.now() - openRouterCache.fetchedAt < REMOTE_CACHE_TTL) {
    return openRouterCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return [];
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
      }));
    openRouterCache = { models, fetchedAt: Date.now() };
    return models;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch the OpenAI (or OpenAI-compatible) catalogue. Returns [] on any non-OK response. */
export async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ProviderModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  if (openaiCache && openaiCache.baseUrl === url && Date.now() - openaiCache.fetchedAt < REMOTE_CACHE_TTL) {
    return openaiCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    const models: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => isChatCapableOpenAIModelId(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        description: m.owned_by ? `by ${m.owned_by}` : undefined,
      }));
    openaiCache = { models, fetchedAt: Date.now(), baseUrl: url };
    return models;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch the Ollama tags catalogue. Returns [] on any non-OK response. */
export async function fetchOllamaModels(baseUrl: string): Promise<ProviderModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  if (ollamaCache && ollamaCache.url === url && Date.now() - ollamaCache.fetchedAt < OLLAMA_CACHE_TTL) {
    return ollamaCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    if (!res.ok) return [];
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
    ollamaCache = { models, fetchedAt: Date.now(), url };
    return models;
  } finally {
    clearTimeout(timeout);
  }
}
