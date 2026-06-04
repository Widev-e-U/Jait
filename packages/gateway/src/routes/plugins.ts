/**
 * Plugin management REST routes.
 *
 * GET    /api/plugins          — list installed plugins
 * GET    /api/plugins/:id      — get a single plugin
 * POST   /api/plugins/:id/enable   — enable & load
 * POST   /api/plugins/:id/disable  — disable & unload
 * DELETE /api/plugins/:id      — uninstall
 * GET    /api/plugins/:id/config   — get plugin config
 * PATCH  /api/plugins/:id/config   — update plugin config
 * POST   /api/plugins/scan     — re-scan extensions dir
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { PluginManager } from "../plugins/manager.js";
import { requireAuth } from "../security/http-auth.js";

export function registerPluginRoutes(app: FastifyInstance, config: AppConfig, pluginManager: PluginManager) {
  async function requirePluginAuth(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
    return requireAuth(req, reply, config.jwtSecret);
  }

  /** List all installed plugins. */
  app.get("/api/plugins", async (req, reply) => {
    const authUser = await requirePluginAuth(req, reply);
    if (!authUser) return;
    return pluginManager.listInstalled();
  });

  /** Get a single plugin. */
  app.get<{ Params: { id: string } }>("/api/plugins/:id", async (req, reply) => {
    const authUser = await requirePluginAuth(req, reply);
    if (!authUser) return;
    const plugin = pluginManager.getPlugin(req.params.id);
    if (!plugin) return reply.status(404).send({ error: "Plugin not found" });
    return plugin;
  });

  /** Enable a plugin. */
  app.post<{ Params: { id: string } }>("/api/plugins/:id/enable", async (req, reply) => {
    const authUser = await requirePluginAuth(req, reply);
    if (!authUser) return;
    try {
      const result = await pluginManager.enable(req.params.id);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  /** Disable a plugin. */
  app.post<{ Params: { id: string } }>("/api/plugins/:id/disable", async (req, reply) => {
    const authUser = await requirePluginAuth(req, reply);
    if (!authUser) return;
    try {
      const result = await pluginManager.disable(req.params.id);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  /** Uninstall a plugin (does not delete files, only removes from DB). */
  app.delete<{ Params: { id: string } }>("/api/plugins/:id", async (req, reply) => {
    const authUser = await requirePluginAuth(req, reply);
    if (!authUser) return;
    try {
      await pluginManager.uninstall(req.params.id);
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  /** Get plugin config. */
  app.get<{ Params: { id: string } }>("/api/plugins/:id/config", async (req, reply) => {
    const authUser = await requirePluginAuth(req, reply);
    if (!authUser) return;
    const plugin = pluginManager.getPlugin(req.params.id);
    if (!plugin) return reply.status(404).send({ error: "Plugin not found" });
    return plugin.config;
  });

  /** Update plugin config (shallow merge). */
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/plugins/:id/config",
    async (req, reply) => {
      const authUser = await requirePluginAuth(req, reply);
      if (!authUser) return;
      try {
        const current = pluginManager.getPluginConfig(req.params.id);
        const merged = { ...current, ...(req.body as Record<string, unknown>) };
        await pluginManager.setPluginConfig(req.params.id, merged);
        return merged;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  /** Trigger a re-scan of the extensions directory. */
  app.post("/api/plugins/scan", async (req, reply) => {
    const authUser = await requirePluginAuth(req, reply);
    if (!authUser) return;
    await pluginManager.syncAndLoad();
    return pluginManager.listInstalled();
  });
}
