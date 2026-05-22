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
import {
  fetchOpenAIModels,
  fetchOpenRouterModels,
  fetchOllamaModels,
} from "../providers/model-fetchers.js";
import type { UserService } from "../services/users.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";

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
