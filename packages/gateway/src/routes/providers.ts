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
import type { ProviderId } from "../providers/contracts.js";
import { listJaitModels } from "../services/jait-models.js";
import type { UserService } from "../services/users.js";
import type { ProviderAccountService } from "../services/provider-accounts.js";
import type { ProviderUsageService } from "../services/provider-usage.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import { ProviderSnapshotCache, type ProviderSnapshot } from "../providers/provider-snapshot.js";
import { RemoteCliProvider } from "../providers/remote-cli-provider.js";

// ── Route registration ───────────────────────────────────────────

const GATEWAY_NODE_NAME = "Gateway";

type ProviderInfoPayload = ProviderSnapshot & { nodeId: string; nodeName: string };

interface RemoteProviderPayload {
  nodeId: string;
  nodeName: string;
  platform: string;
  providers: string[];
  availableProviderTypes?: string[];
  providerStatuses?: Array<{
    id: string;
    providerType?: string;
    name?: string;
    installed: boolean;
    authenticated: boolean | null;
    detail?: string;
  }>;
}

export interface ProviderRouteDeps {
  providerRegistry: ProviderRegistry;
  providerAccountService?: ProviderAccountService;
  providerUsageService?: ProviderUsageService;
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

  const resolveProvider = (id: string, userId: string) => {
    const account = deps.providerAccountService?.get(id, userId);
    if (account && account.nodeId !== "gateway") {
      if (!ws) return undefined;
      const node = ws.getFsNodes().find((candidate) => candidate.id === account.nodeId && !candidate.isGateway);
      if (!node) return undefined;
      return new RemoteCliProvider(ws, node.id, account.id, account.providerType);
    }
    return providerRegistry.getForUser(id as ProviderId, userId);
  };

  app.get("/api/provider-accounts", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    return {
      accounts: deps.providerAccountService?.list(authUser.id) ?? [],
      providerTypes: deps.providerAccountService?.listTypes() ?? [],
    };
  });

  app.get("/api/provider-usage", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const accountIds = (deps.providerAccountService?.list(authUser.id) ?? []).map((account) => account.id);
    return { usage: deps.providerUsageService?.listForUser(accountIds) ?? [] };
  });

  app.post("/api/provider-accounts", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!deps.providerAccountService) return reply.status(503).send({ error: "Provider account service is unavailable" });
    const body = (request.body ?? {}) as { providerType?: string; label?: string; nodeId?: string };
    try {
      const nodeId = typeof body.nodeId === "string" && body.nodeId.trim() ? body.nodeId.trim() : "gateway";
      if (nodeId !== "gateway") {
        const node = ws?.getFsNodes().find((candidate) => candidate.id === nodeId && !candidate.isGateway);
        if (!node) return reply.status(404).send({ error: `Node ${nodeId} is not connected` });
        if (!node.providers?.includes(typeof body.providerType === "string" ? body.providerType : "")) {
          return reply.status(409).send({ error: `Provider ${body.providerType ?? ""} is not installed on ${node.name}` });
        }
      }
      const account = deps.providerAccountService.create(
        authUser.id,
        typeof body.providerType === "string" ? body.providerType : "",
        typeof body.label === "string" ? body.label : "",
        nodeId,
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
    const existingAccount = deps.providerAccountService.get(id, authUser.id);
    if (existingAccount && existingAccount.nodeId !== "gateway" && ws) {
      await ws.proxyProviderOp(existingAccount.nodeId, "delete-account", {
        providerId: existingAccount.id,
        providerType: existingAccount.providerType,
      }, 90_000).catch(() => {});
    }
    const deleted = await deps.providerAccountService.delete(id, authUser.id);
    if (!deleted) return reply.status(404).send({ error: "Provider account not found" });
    if (deps.userService?.getSettings(authUser.id).chatProvider === id) {
      deps.userService.updateSettings(authUser.id, { chatProvider: "jait" });
    }
    snapshotCache.invalidate();
    return { ok: true };
  });

  /**
   * List available providers.
   *
   * `providers` is the single authoritative list: every entry — gateway-hosted
   * or living on a connected node — carries the `nodeId`/`nodeName` of the
   * device it runs on. Clients scope by that field rather than cross-referencing
   * node capability lists, which used to mix provider *types* with account ids.
   *
   * `remoteProviders` is the same data grouped per node, kept for the settings
   * screen and older clients.
   */
  app.get("/api/providers", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    // `?fresh=1` forces a synchronous re-probe (used by explicit UI refresh).
    const fresh = (request.query as { fresh?: string } | undefined)?.fresh;
    const force = fresh === "1" || fresh === "true";
    const accounts = deps.providerAccountService?.list(authUser.id) ?? [];
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const gatewayProviders: ProviderInfoPayload[] = (await snapshotCache.get(force))
      .filter((provider) => providerRegistry.isVisibleTo(provider.id, authUser.id))
      .filter((provider) => (accountById.get(provider.id)?.nodeId ?? "gateway") === "gateway")
      .map((provider) => ({ ...provider, nodeId: "gateway", nodeName: GATEWAY_NODE_NAME }));

    // Collect remote provider info from connected filesystem nodes (cheap, live).
    const remoteProviders: RemoteProviderPayload[] = [];
    const nodeProviders: ProviderInfoPayload[] = [];
    if (ws) {
      for (const node of ws.getFsNodes()) {
        if (node.isGateway) continue;
        const nodeAccounts = accounts.filter((account) => account.nodeId === node.id);
        const accountStatuses = await Promise.all(nodeAccounts.map(async (account) => {
          const provider = new RemoteCliProvider(ws, node.id, account.id, account.providerType);
          const status = await provider.getAuthStatus().catch((error) => ({
            authenticated: null,
            detail: error instanceof Error ? error.message : "Unable to check account",
            login: true,
            logout: true,
            deviceCode: true,
          }));
          return {
            id: account.id,
            providerType: account.providerType,
            name: `${account.providerType === "claude-code" ? "Claude Code" : "Codex"} — ${account.label}`,
            installed: node.providers?.includes(account.providerType) ?? false,
            authenticated: status.authenticated,
            detail: status.detail,
          };
        }));
        remoteProviders.push({
          nodeId: node.id,
          nodeName: node.name,
          platform: node.platform,
          providers: ["jait", ...accountStatuses.filter((status) => status.installed && status.authenticated === true).map((status) => status.id)],
          availableProviderTypes: node.providers ?? [],
          providerStatuses: accountStatuses,
        });
        for (const status of accountStatuses) {
          nodeProviders.push({
            id: status.id,
            providerType: status.providerType,
            name: status.name,
            description: status.detail ?? `Runs on ${node.name}`,
            available: status.installed && status.authenticated === true,
            unavailableReason: !status.installed
              ? `Not installed on ${node.name}`
              : status.authenticated === false
                ? `Login required on ${node.name}`
                : status.authenticated === null
                  ? status.detail ?? `Unable to check this account on ${node.name}`
                  : undefined,
            modes: ["full-access", "supervised"],
            auth: {
              login: true,
              logout: status.authenticated === true,
              deviceCode: true,
              authenticated: status.authenticated,
              detail: status.detail,
            },
            nodeId: node.id,
            nodeName: node.name,
          });
        }
      }
    }

    return {
      providers: [...gatewayProviders, ...nodeProviders],
      remoteProviders,
    };
  });

  /** Get provider auth status */
  app.get("/api/providers/:id/auth/status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = resolveProvider(id, authUser.id);
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
    const provider = resolveProvider(id, authUser.id);
    if (!provider) return reply.status(404).send({ error: `Unknown provider: ${id}` });
    if (!provider.startLogin) {
      return reply.status(501).send({ error: `Provider ${id} does not support login` });
    }
    const result = await provider.startLogin();
    // Auth state is about to change — drop the cached snapshot so the next
    // `/api/providers` reflects the login instead of serving a stale probe.
    snapshotCache.invalidate();
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

    const provider = resolveProvider(id, authUser.id);
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
    const provider = resolveProvider(id, authUser.id);
    if (!provider) return reply.status(404).send({ error: `Unknown provider: ${id}` });
    if (!provider.logout) {
      return reply.status(501).send({ error: `Provider ${id} does not support logout` });
    }
    const result = await provider.logout();
    snapshotCache.invalidate();
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
    // The provider account itself decides where models come from. The `nodeId`
    // query param is only a hint from older clients: honouring it caused a hard
    // 404 whenever the open project's device disagreed with the selected
    // provider's device (e.g. a gateway account selected inside a remote
    // project), which surfaced as "models failed to load".
    const account = id === "jait" ? null : deps.providerAccountService?.get(id, authUser.id) ?? null;
    const providerNodeId = account?.nodeId ?? "gateway";

    if (account && providerNodeId !== "gateway") {
      if (!ws) return reply.status(503).send({ error: "Remote provider routing is unavailable" });
      const node = ws.getFsNodes().find((candidate) => candidate.id === providerNodeId);
      if (!node) return reply.status(404).send({ error: `The device hosting ${account.label} is not connected` });

      const remoteProvider = new RemoteCliProvider(ws, node.id, account.id, account.providerType);
      if (!await remoteProvider.checkAvailability()) {
        return reply.status(409).send({ error: remoteProvider.info.unavailableReason ?? `Provider ${id} is unavailable on ${node.name}` });
      }
      return { models: await remoteProvider.listModels() };
    }

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

        models = await listJaitModels({
          config,
          apiKeys: userApiKeys,
          fallbackModels: models,
        });

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
