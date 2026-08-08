/**
 * Channel management REST routes.
 *
 * GET    /api/channels            — list channels with status + QR
 * GET    /api/channels/:id/status — current status + QR (for polling during linking)
 * GET    /api/channels/:id/setup  — how to create the account (QR into @BotFather)
 * POST   /api/channels/:id/start  — start/link a channel
 * POST   /api/channels/:id/stop   — stop a channel
 * POST   /api/channels/:id/pair   — re-enter pairing mode (link another account)
 * PATCH  /api/channels/:id/config — update channel config (allowed senders, tools, token, …)
 *
 * Channel credentials (Telegram bot token) are write-only: they can be set via
 * PATCH but are never echoed back — responses carry `tokenSet` instead.
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ChannelManager } from "../channels/manager.js";
import type { ChannelConfig } from "../channels/types.js";
import { extractBotToken } from "../channels/telegram/connector.js";
import { requireAuth } from "../security/http-auth.js";

/** Public view of a channel config — strips the credential. */
type PublicChannelConfig = Omit<ChannelConfig, "token"> & { tokenSet: boolean };

function toPublicConfig(config: ChannelConfig): PublicChannelConfig {
  const { token, ...rest } = config;
  return { ...rest, tokenSet: Boolean(token?.trim()) };
}

/**
 * Sanitize an incoming config patch. A blank/absent token means "leave the
 * stored one alone" so saving other settings never wipes the credential;
 * `token: null` clears it explicitly.
 */
function sanitizePatch(body: Partial<ChannelConfig> & { token?: string | null }): Partial<ChannelConfig> {
  const { token, ...rest } = body;
  const patch: Partial<ChannelConfig> = { ...rest };
  if (token === null) patch.token = "";
  else if (typeof token === "string" && token.trim()) {
    // Accept the whole BotFather reply pasted verbatim, not just the token.
    patch.token = extractBotToken(token) ?? token.trim();
  }
  return patch;
}

/** `returnUrl` is the only transient option a client may pass to start/pair. */
function pairOptions(body: unknown): { returnUrl?: string } {
  const returnUrl = (body as { returnUrl?: unknown } | null)?.returnUrl;
  return typeof returnUrl === "string" ? { returnUrl } : {};
}

export function registerChannelRoutes(app: FastifyInstance, config: AppConfig, channelManager: ChannelManager) {
  async function requireChannelAuth(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
    return requireAuth(req, reply, config.jwtSecret);
  }

  /** List channels + status. */
  app.get("/api/channels", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    return channelManager.list().map((channel) => ({
      ...channel,
      config: toPublicConfig(channel.config),
    }));
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
      link: managed.detail.link ?? null,
      expiresAt: managed.detail.expiresAt ?? null,
      error: managed.detail.error,
      config: toPublicConfig(channelManager.getConfig(req.params.id)),
    };
  });

  /** How to create the underlying messenger account (Telegram: the bot). */
  app.get<{ Params: { id: string } }>("/api/channels/:id/setup", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    try {
      const guide = await channelManager.setupGuide(req.params.id);
      if (!guide) return reply.status(404).send({ error: "Channel needs no setup step" });
      return guide;
    } catch (err: unknown) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Start / link a channel. */
  app.post<{ Params: { id: string } }>("/api/channels/:id/start", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    try {
      await channelManager.start(req.params.id, pairOptions(req.body));
      const managed = channelManager.get(req.params.id);
      return {
        ok: true,
        status: managed?.status,
        qr: managed?.detail.qr ?? managed?.connector.currentQr() ?? null,
        link: managed?.detail.link ?? null,
        expiresAt: managed?.detail.expiresAt ?? null,
        error: managed?.detail.error,
      };
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

  /** Re-enter pairing mode to link an additional account. */
  app.post<{ Params: { id: string } }>("/api/channels/:id/pair", async (req, reply) => {
    const authUser = await requireChannelAuth(req, reply);
    if (!authUser) return;
    const managed = channelManager.get(req.params.id);
    if (!managed) return reply.status(404).send({ error: "Channel not found" });
    try {
      await channelManager.pair(req.params.id, pairOptions(req.body));
      return {
        ok: true,
        status: managed.status,
        qr: managed.detail.qr ?? managed.connector.currentQr(),
        link: managed.detail.link ?? null,
        expiresAt: managed.detail.expiresAt ?? null,
      };
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Update channel config. */
  app.patch<{ Params: { id: string }; Body: Partial<ChannelConfig> & { token?: string | null } }>(
    "/api/channels/:id/config",
    async (req, reply) => {
      const authUser = await requireChannelAuth(req, reply);
      if (!authUser) return;
      const managed = channelManager.get(req.params.id);
      if (!managed) return reply.status(404).send({ error: "Channel not found" });
      const body = (req.body as (Partial<ChannelConfig> & { token?: string | null }) | null) ?? {};
      const next = channelManager.setConfig(req.params.id, sanitizePatch(body));
      return toPublicConfig(next);
    },
  );
}
