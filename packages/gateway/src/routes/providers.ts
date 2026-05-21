/**
 * Provider REST routes.
 *
 * Lists available providers, exposes auth flows, and returns
 * dynamically-fetched model catalogues for each backend.
 *
 *   GET    /api/providers                  — list available providers
 *   GET    /api/providers/:id/auth/status  — get provider auth status
 *   POST   /api/providers/:id/auth/login   — start provider login
 *   POST   /api/providers/:id/auth/logout  — log out provider
 *   GET    /api/providers/:id/models       — list models for a provider
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ProviderModelInfo, ProviderId } from "../providers/contracts.js";
import type { UserService } from "../services/users.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";

// ── Model fetchers with in-memory caches ─────────────────────────

/** Fetch models from OpenRouter API with a 5-second timeout and in-memory cache. */
let orCache: { models: ProviderModelInfo[]; fetchedAt: number } | null = null;
const OR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchOpenRouterModels(apiKey: string): Promise<ProviderModelInfo[]> {
  if (orCache && Date.now() - orCache.fetchedAt < OR_CACHE_TTL) {
    return orCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ id: string; name?: string; description?: string }> };
    const models: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => m.id && !m.id.includes(":free"))
      .slice(0, 100)
      .map((m) => ({
        id: m.id,
        name: m.name || m.id.split("/").pop() || m.id,
        description: m.description?.slice(0, 80),
      }));
    orCache = { models, fetchedAt: Date.now() };
    return models;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch models from OpenAI /v1/models with a 5-second timeout and in-memory cache. */
let openaiCache: { models: ProviderModelInfo[]; fetchedAt: number; baseUrl: string } | null = null;
const OPENAI_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Model ID prefixes that represent chat-completion-capable models. */
const OPENAI_CHAT_PREFIXES = ["gpt-", "o1", "o3", "o4", "chatgpt-"];

async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ProviderModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  if (openaiCache && openaiCache.baseUrl === url && Date.now() - openaiCache.fetchedAt < OPENAI_CACHE_TTL) {
    return openaiCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    const models: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => m.id && OPENAI_CHAT_PREFIXES.some((p) => m.id.startsWith(p)))
      // Remove fine-tune snapshots, realtime, audio-only, transcription variants
      .filter((m) => !m.id.includes(":ft-") && !m.id.includes("realtime") && !m.id.includes("transcribe") && !m.id.includes("tts") && !m.id.includes("dall-e") && !m.id.includes("whisper"))
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

let ollamaCache: { models: ProviderModelInfo[]; fetchedAt: number; url: string } | null = null;
const OLLAMA_CACHE_TTL = 30 * 1000; // 30 seconds (local, fast)

async function fetchOllamaModels(baseUrl: string): Promise<ProviderModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  if (ollamaCache && ollamaCache.url === url && Date.now() - ollamaCache.fetchedAt < OLLAMA_CACHE_TTL) {
    return ollamaCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string; family?: string } }> };
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

// ── Route registration ───────────────────────────────────────────

export interface ProviderRouteDeps {
  providerRegistry: ProviderRegistry;
  userService?: UserService;
  ws?: WsControlPlane;
}

export function registerProviderRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: ProviderRouteDeps,
): void {
  const { providerRegistry, ws } = deps;

  /** List available providers (local + remote) */
  app.get("/api/providers", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const providers = providerRegistry.list();
    const providerSnapshots = await Promise.all(
      providers.map(async (p) => {
        await p.checkAvailability().catch(() => false);
        const auth = await p.getAuthStatus?.().catch(() => p.info.auth
          ? { ...p.info.auth, authenticated: null, detail: "Failed to check provider auth status." }
          : undefined);
        return { provider: p, auth };
      }),
    );

    // Collect remote provider info from connected filesystem nodes
    const remoteProviders: { nodeId: string; nodeName: string; platform: string; providers: string[] }[] = [];
    if (ws) {
      for (const node of ws.getFsNodes()) {
        if (node.isGateway) continue;
        remoteProviders.push({
          nodeId: node.id,
          nodeName: node.name,
          platform: node.platform,
          providers: node.providers ?? [],
        });
      }
    }

    return {
      providers: providerSnapshots.map(({ provider: p, auth }) => ({
        id: p.id,
        name: p.info.name,
        description: p.info.description,
        available: p.info.available,
        unavailableReason: p.info.unavailableReason,
        modes: p.info.modes,
        auth: auth ?? p.info.auth,
      })),
      remoteProviders,
    };
  });

  /** Get provider auth status */
  app.get("/api/providers/:id/auth/status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = providerRegistry.get(id as ProviderId);
    if (!provider) return reply.status(404).send({ error: `Unknown provider: ${id}` });
    if (!provider.getAuthStatus) {
      return reply.status(501).send({ error: `Provider ${id} does not support auth status` });
    }
    return provider.getAuthStatus();
  });

  /** Start provider login */
  app.post("/api/providers/:id/auth/login", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = providerRegistry.get(id as ProviderId);
    if (!provider) return reply.status(404).send({ error: `Unknown provider: ${id}` });
    if (!provider.startLogin) {
      return reply.status(501).send({ error: `Provider ${id} does not support login` });
    }
    const result = await provider.startLogin();
    if (!result.ok && result.status === "unsupported") {
      return reply.status(501).send(result);
    }
    if (!result.ok) {
      return reply.status(500).send(result);
    }
    return result;
  });

  /** Send code input to running login process (reverse device-code / browser-callback flow) */
  app.post("/api/providers/:id/auth/login/input", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const { code } = (request.body ?? {}) as { code?: string };
    if (!code || typeof code !== "string" || !code.trim()) {
      return reply.status(400).send({ error: "Missing or empty code" });
    }

    const provider = providerRegistry.get(id as ProviderId);
    if (!provider) return reply.status(404).send({ error: `Unknown provider: ${id}` });
    if (!provider.sendLoginInput) {
      return reply.status(501).send({ error: `Provider ${id} does not support code input` });
    }

    provider.sendLoginInput(code.trim());
    return { ok: true };
  });

  /** Log out provider */
  app.post("/api/providers/:id/auth/logout", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = providerRegistry.get(id as ProviderId);
    if (!provider) return reply.status(404).send({ error: `Unknown provider: ${id}` });
    if (!provider.logout) {
      return reply.status(501).send({ error: `Provider ${id} does not support logout` });
    }
    const result = await provider.logout();
    if (!result.ok && result.status === "unsupported") {
      return reply.status(501).send(result);
    }
    if (!result.ok) {
      return reply.status(500).send(result);
    }
    return result;
  });

  /** List models for a specific provider */
  app.get("/api/providers/:id/models", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = providerRegistry.get(id as ProviderId);
    if (!provider) {
      return reply.status(404).send({ error: `Unknown provider: ${id}` });
    }

    if (!provider.listModels) {
      return { models: [] };
    }

    try {
      let models = await provider.listModels();

      // For jait provider, return models from ALL configured backends, grouped
      if (id === "jait" && deps.userService) {
        const settings = deps.userService.getSettings(authUser.id);
        const userApiKeys = settings.apiKeys ?? {};
        const jaitBackend = settings.jaitBackend || "openai";

        const allModels: ProviderModelInfo[] = [];

        // ── OpenAI models (dynamic when API key available) ────────
        const openaiKey = userApiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
        const openaiBaseUrl = userApiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl || "https://api.openai.com/v1";
        if (openaiKey && openaiBaseUrl.includes("openai.com")) {
          try {
            const apiModels = await fetchOpenAIModels(openaiKey, openaiBaseUrl);
            if (apiModels.length > 0) {
              allModels.push(...apiModels.map((m) => ({ ...m, group: "OpenAI" })));
            } else {
              allModels.push(...models.map((m) => ({ ...m, group: "OpenAI" })));
            }
          } catch {
            allModels.push(...models.map((m) => ({ ...m, group: "OpenAI" })));
          }
        } else {
          allModels.push(...models.map((m) => ({ ...m, group: "OpenAI" })));
        }

        // ── OpenRouter models ─────────────────────────────────────
        const openRouterKey = userApiKeys["OPENROUTER_API_KEY"]?.trim();
        if (openRouterKey) {
          try {
            const orModels = await fetchOpenRouterModels(openRouterKey);
            if (orModels.length > 0) {
              allModels.push(...orModels.map((m) => ({ ...m, group: "OpenRouter" })));
            } else {
              const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
              allModels.push(...OPENROUTER_MODELS.map((m) => ({ ...m, group: "OpenRouter" })));
            }
          } catch {
            const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
            allModels.push(...OPENROUTER_MODELS.map((m) => ({ ...m, group: "OpenRouter" })));
          }
        }

        // ── Ollama models ─────────────────────────────────────────
        const ollamaUrl = userApiKeys["OLLAMA_URL"]?.trim() || config.ollamaUrl;
        if (ollamaUrl) {
          try {
            const ollamaModels = await fetchOllamaModels(ollamaUrl);
            if (ollamaModels.length > 0) {
              allModels.push(...ollamaModels.map((m) => ({ ...m, group: "Ollama" })));
            }
          } catch {
            // Ollama unreachable — skip
          }
        }

        models = allModels;

        // Prepend recent models (if they exist in the full list)
        const recentIds = settings.recentModels ?? [];
        if (recentIds.length > 0) {
          const modelMap = new Map(models.map((m) => [m.id, m]));
          const recents = recentIds
            .filter((rid) => modelMap.has(rid))
            .map((rid) => ({ ...modelMap.get(rid)!, isRecent: true }));
          return { models, currentBackend: jaitBackend, recentModels: recents.slice(0, 5).map((r) => r.id) };
        }

        return { models, currentBackend: jaitBackend };
      }

      return { models };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to list models" });
    }
  });

  app.log.info("Provider routes registered at /api/providers");
}
