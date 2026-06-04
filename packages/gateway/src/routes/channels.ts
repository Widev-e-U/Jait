/**
 * Channel management REST routes.
 *
 * GET    /api/channels            — list channels with status + QR
 * GET    /api/channels/:id/status — current status + QR (for polling during linking)
 * POST   /api/channels/:id/start  — start/link a channel
 * POST   /api/channels/:id/stop   — stop a channel
 * PATCH  /api/channels/:id/config — update channel config (allowed senders, tools, …)
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ChannelManager } from "../channels/manager.js";
import type { ChannelConfig } from "../channels/types.js";
import { requireAuth } from "../security/http-auth.js";

export function registerChannelRoutes(app: FastifyInstance, config: AppConfig, channelManager: ChannelManager) {
  async function requireChannelAuth(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
    return requireAuth(req, reply, config.jwtSecret);
  }

  /** List channels + status. */
  app.get("/api/channels", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    return channelManager.list();
  });

  /** Poll status + QR for one channel (used by the linking UI). */
  app.get<{ Params: { id: string } }>("/api/channels/:id/status", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    const managed = channelManager.get(req.params.id);
    if (!managed) return reply.status(404).send({ error: "Channel not found" });
    return {
      id: managed.connector.id,
      status: managed.status,
      qr: managed.detail.qr ?? managed.connector.currentQr(),
      error: managed.detail.error,
    };
  });

  /** Start / link a channel. */
  app.post<{ Params: { id: string } }>("/api/channels/:id/start", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    try {
      await channelManager.start(req.params.id);
      const managed = channelManager.get(req.params.id);
      return { ok: true, status: managed?.status, qr: managed?.detail.qr ?? managed?.connector.currentQr() ?? null };
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Stop a channel. */
  app.post<{ Params: { id: string } }>("/api/channels/:id/stop", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    try {
      await channelManager.stop(req.params.id);
      return { ok: true };
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Update channel config. */
  app.patch<{ Params: { id: string }; Body: Partial<ChannelConfig> }>(
    "/api/channels/:id/config",
    async (req, reply) => {
      const authUser = await requireChannelAuth(req, reply);
      if (!authUser) return;
      const managed = channelManager.get(req.params.id);
      if (!managed) return reply.status(404).send({ error: "Channel not found" });
      const body = (req.body as Partial<ChannelConfig> | null) ?? {};
      const next = channelManager.setConfig(req.params.id, body);
      return next;
    },
  );
}
