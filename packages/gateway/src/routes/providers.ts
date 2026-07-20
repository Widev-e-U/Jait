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
import type { ProviderAccountService } from "../services/provider-accounts.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import { ProviderSnapshotCache } from "../providers/provider-snapshot.js";

// ── Route registration ───────────────────────────────────────────

export interface ProviderRouteDeps {
  providerRegistry: ProviderRegistry;
  providerAccountService?: ProviderAccountService;
  userService?: UserService;
  ws?: WsControlPlane;
}

export function registerProviderRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: ProviderRouteDeps,
): void {
  const { providerRegistry, ws } = deps;

  // Availability + auth probing is expensive (spawns provider CLIs / ACP agents).
  // Compute it once, serve from cache, and refresh in the background so page
  // loads are instant. Warm it now so the first request never pays the cost.
  const snapshotCache = new ProviderSnapshotCache(providerRegistry);
  snapshotCache.warm();

  app.get("/api/provider-accounts", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    return {
      accounts: deps.providerAccountService?.list(authUser.id) ?? [],
      providerTypes: deps.providerAccountService?.listTypes() ?? [],
    };
  });

  app.post("/api/provider-accounts", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!deps.providerAccountService) return reply.status(503).send({ error: "Provider account service is unavailable" });
    const body = (request.body ?? {}) as { providerType?: string; label?: string };
    try {
      const account = deps.providerAccountService.create(
        authUser.id,
        typeof body.providerType === "string" ? body.providerType : "",
        typeof body.label === "string" ? body.label : "",
      );
      snapshotCache.invalidate();
      return reply.status(201).send({ account });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create provider account";
      const status = message.includes("UNIQUE constraint") ? 409 : 400;
      return reply.status(status).send({ error: status === 409 ? "An account with this label already exists" : message });
    }
  });

  app.patch("/api/provider-accounts/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!deps.providerAccountService) return reply.status(503).send({ error: "Provider account service is unavailable" });
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { label?: string };
    try {
      const account = await deps.providerAccountService.rename(id, authUser.id, typeof body.label === "string" ? body.label : "");
      if (!account) return reply.status(404).send({ error: "Provider account not found" });
      snapshotCache.invalidate();
      return { account };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rename provider account";
      const status = message.includes("UNIQUE constraint") ? 409 : 400;
      return reply.status(status).send({ error: status === 409 ? "An account with this label already exists" : message });
    }
  });

  app.delete("/api/provider-accounts/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!deps.providerAccountService) return reply.status(503).send({ error: "Provider account service is unavailable" });
    const { id } = request.params as { id: string };
    const deleted = await deps.providerAccountService.delete(id, authUser.id);
    if (!deleted) return reply.status(404).send({ error: "Provider account not found" });
    if (deps.userService?.getSettings(authUser.id).chatProvider === id) {
      deps.userService.updateSettings(authUser.id, { chatProvider: "jait" });
    }
    snapshotCache.invalidate();
    return { ok: true };
  });

  /** List available providers (local + remote) */
  app.get("/api/providers", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    // `?fresh=1` forces a synchronous re-probe (used by explicit UI refresh).
    const fresh = (request.query as { fresh?: string } | undefined)?.fresh;
    const force = fresh === "1" || fresh === "true";
    const providerSnapshots = (await snapshotCache.get(force))
      .filter((provider) => providerRegistry.isVisibleTo(provider.id, authUser.id));

    // Collect remote provider info from connected filesystem nodes (cheap, live).
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
      providers: providerSnapshots,
      remoteProviders,
    };
  });

  /** Get provider auth status */
  app.get("/api/providers/:id/auth/status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = providerRegistry.getForUser(id as ProviderId, authUser.id);
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
    const provider = providerRegistry.getForUser(id as ProviderId, authUser.id);
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

    const provider = providerRegistry.getForUser(id as ProviderId, authUser.id);
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
    const provider = providerRegistry.getForUser(id as ProviderId, authUser.id);
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
    const provider = providerRegistry.getForUser(id as ProviderId, authUser.id);
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

        // Fetch each backend's catalogue concurrently — these are independent
        // network calls, so running them in parallel caps the worst case at a
        // single timeout instead of the sum of all three.

        // ── OpenAI models (dynamic when API key available) ────────
        const openaiKey = userApiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
        const openaiBaseUrl = userApiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl || "https://api.openai.com/v1";
        const openaiModelsP: Promise<ProviderModelInfo[]> = (async () => {
          const fallback = models.map((m) => ({ ...m, group: "OpenAI" }));
          if (!(openaiKey && openaiBaseUrl.includes("openai.com"))) return fallback;
          try {
            const apiModels = await fetchOpenAIModels(openaiKey, openaiBaseUrl);
            return apiModels.length > 0 ? apiModels.map((m) => ({ ...m, group: "OpenAI" })) : fallback;
          } catch {
            return fallback;
          }
        })();

        // ── OpenRouter models ─────────────────────────────────────
        const openRouterKey = userApiKeys["OPENROUTER_API_KEY"]?.trim();
        const openRouterModelsP: Promise<ProviderModelInfo[]> = (async () => {
          if (!openRouterKey) return [];
          try {
            const orModels = await fetchOpenRouterModels(openRouterKey);
            if (orModels.length > 0) return orModels.map((m) => ({ ...m, group: "OpenRouter" }));
          } catch {
            // fall through to static list
          }
          const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
          return OPENROUTER_MODELS.map((m) => ({ ...m, group: "OpenRouter" }));
        })();

        // ── Ollama models ─────────────────────────────────────────
        const ollamaUrl = userApiKeys["OLLAMA_URL"]?.trim() || config.ollamaUrl;
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

        const [openaiGroup, openRouterGroup, ollamaGroup] = await Promise.all([
          openaiModelsP,
          openRouterModelsP,
          ollamaModelsP,
        ]);

        models = [...openaiGroup, ...openRouterGroup, ...ollamaGroup];

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
