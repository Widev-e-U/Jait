/**
 * Per-agent GitHub App routes (issue #246).
 *
 * Each persistent agent (Agents page profile) can be connected to its own
 * GitHub App so its commits, pull requests and reviews are authored by the
 * agent instead of the user's personal account.
 *
 *   GET    /api/github-apps                          — list this user's connections
 *   GET    /api/agents/:agentId/github-app           — one agent's connection state
 *   POST   /api/agents/:agentId/github-app/setup     — begin manifest App registration
 *   POST   /api/agents/:agentId/github-app/manual    — register an existing App (id + PEM)
 *   POST   /api/agents/:agentId/github-app/installation — bind an installation id
 *   POST   /api/agents/:agentId/github-app/verify    — re-check credentials against GitHub
 *   POST   /api/agents/:agentId/github-app/test      — end-to-end proof the token works
 *   DELETE /api/agents/:agentId/github-app           — disconnect and drop credentials
 *   GET    /api/github/apps/callback                 — GitHub manifest/install redirect (state-signed)
 *   POST   /api/github/apps/webhook                  — App webhook receiver (HMAC verified)
 *
 * The private key is never returned by any of these routes.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { validateGithubIntakeRules, type GithubIntakeService } from "../services/github-intake.js";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { AgentGithubAppConnection, AgentGithubAppService } from "../services/agent-github-apps.js";

export interface AgentGithubWebhookEvent {
  userId: string;
  agentId: string;
  event: string | null;
  deliveryId: string | null;
  payload: Record<string, unknown>;
}

export interface AgentGithubAppRouteDeps {
  service: AgentGithubAppService;
  /** Optional existence check so routes only target real agent profiles. */
  agentExists?: (userId: string, agentId: string) => boolean;
  /** Optional sink for accepted webhook deliveries. */
  intake?: GithubIntakeService;
  onWebhook?: (event: AgentGithubWebhookEvent) => void | Promise<void>;
}

/** Base URL the browser actually reached, so GitHub calls back to the same host. */
function getRequestBaseUrl(request: FastifyRequest): string | undefined {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0]?.trim() : request.protocol;
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = typeof forwardedHost === "string" ? forwardedHost.split(",")[0]?.trim() : request.headers.host;
  if (!proto || !host) return undefined;
  return `${proto}://${host}`;
}

function verifyWebhookSignature(secret: string, body: Buffer, header: string | undefined): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const received = header.trim();
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerAgentGithubAppRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: AgentGithubAppRouteDeps,
): void {
  const { service } = deps;

  /** Reject unknown agents before touching GitHub, when a checker is wired. */
  function agentMissing(userId: string, agentId: string): boolean {
    return deps.agentExists ? !deps.agentExists(userId, agentId) : false;
  }

  function fail(reply: FastifyReply, error: unknown, status = 400) {
    return reply.status(status).send({ detail: error instanceof Error ? error.message : String(error) });
  }

  app.get("/api/github-apps", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const connections = service.list(authUser.id);
    return {
      connections,
      webhookUrl: `${service.publicBaseUrl()}/api/github/apps/webhook`,
      configured: connections.filter((connection) => connection.status === "connected").length,
    };
  });

  app.get("/api/agents/:agentId/github-app", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(authUser.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    const connection = service.get(authUser.id, agentId);
    return { connection, webhookSecretAvailable: Boolean(service.webhookSecret(authUser.id, agentId)) };
  });

  app.get("/api/agents/:agentId/github-app/intake", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(user.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    if (!deps.intake) return reply.status(503).send({ detail: "intake_unavailable" });
    return { mode: "observe", rules: deps.intake.rules(user.id, agentId), decisions: deps.intake.list(user.id, agentId) };
  });

  app.put("/api/agents/:agentId/github-app/intake", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(user.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    if (!deps.intake) return reply.status(503).send({ detail: "intake_unavailable" });
    try {
      const rules = validateGithubIntakeRules((request.body as { rules?: unknown } | null)?.rules);
      deps.intake.save(user.id, agentId, rules);
      return { mode: "observe", rules };
    } catch (error) { return fail(reply, error); }
  });

  app.post("/api/agents/:agentId/github-app/setup", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(authUser.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const appName = typeof body["appName"] === "string" ? body["appName"] : "";
    if (!appName.trim()) return reply.status(400).send({ detail: "appName is required" });
    try {
      return await service.beginSetup(authUser.id, agentId, {
        appName,
        organization: typeof body["organization"] === "string" ? body["organization"] : null,
        description: typeof body["description"] === "string" ? body["description"] : undefined,
        homepage: typeof body["homepage"] === "string" ? body["homepage"] : undefined,
        baseUrl: getRequestBaseUrl(request),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post("/api/agents/:agentId/github-app/manual", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(authUser.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const connection = await service.saveManualApp(authUser.id, agentId, {
        appId: typeof body["appId"] === "string" ? body["appId"] : "",
        privateKey: typeof body["privateKey"] === "string" ? body["privateKey"] : "",
        appSlug: typeof body["appSlug"] === "string" ? body["appSlug"] : null,
        appName: typeof body["appName"] === "string" ? body["appName"] : null,
      });
      return { connection };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post("/api/agents/:agentId/github-app/installation", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(authUser.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const installationId = typeof body["installationId"] === "string" || typeof body["installationId"] === "number"
      ? String(body["installationId"]).trim()
      : "";
    if (!/^\d+$/.test(installationId)) return reply.status(400).send({ detail: "installationId must be numeric" });
    try {
      return { connection: await service.attachInstallation(authUser.id, agentId, installationId) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post("/api/agents/:agentId/github-app/verify", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(authUser.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    try {
      return await service.verify(authUser.id, agentId);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post("/api/agents/:agentId/github-app/test", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { agentId } = request.params as { agentId: string };
    if (agentMissing(authUser.id, agentId)) return reply.status(404).send({ detail: "agent_not_found" });
    try {
      return await service.testConnection(authUser.id, agentId);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete("/api/agents/:agentId/github-app", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { agentId } = request.params as { agentId: string };
    return service.disconnect(authUser.id, agentId);
  });

  // ── Public callback + webhook ──────────────────────────────────────────
  //
  // Both are called by GitHub, not by the browser, so they cannot require a
  // session. The callback authorises itself with the signed manifest state and
  // the webhook with the App's webhook secret.

  app.get("/api/github/apps/callback", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const state = query["state"] ?? "";
    const code = query["code"] ?? "";
    const installationId = query["installation_id"] ?? "";
    const origin = service.publicBaseUrl();

    const readState = service.readState(state);
    if (!readState) {
      return reply.redirect(`${origin}/agents?github=error&reason=invalid_state`, 302);
    }
    const { userId, agentId } = readState;
    const redirect = (status: string, reason?: string) =>
      reply.redirect(
        `${origin}/agents?github=${status}&agentId=${encodeURIComponent(agentId)}${
          reason ? `&reason=${encodeURIComponent(reason)}` : ""
        }`,
        302,
      );

    if (!code && !installationId) return redirect("error", "missing_code");

    try {
      const existing = service.get(userId, agentId);
      if (code && !existing?.appId) {
        await service.completeSetup(userId, agentId, code);
      }
      if (installationId) {
        await service.attachInstallation(userId, agentId, installationId);
        const connection = service.get(userId, agentId);
        if (connection?.status === "connected") return redirect("connected");
      }
      const connection = service.get(userId, agentId);
      return redirect(connection?.installationId ? "connected" : "installed");
    } catch (error) {
      return redirect("error", error instanceof Error ? error.message.slice(0, 180) : "callback_failed");
    }
  });

  // Own scope so the raw-body parser does not affect other JSON routes.
  app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );

    scope.post("/api/github/apps/webhook", async (request, reply) => {
      const headers = request.headers as Record<string, string | string[] | undefined>;
      const headerValue = (name: string): string | undefined => {
        const value = headers[name];
        return Array.isArray(value) ? value[0] : value;
      };
      const targetType = headerValue("x-github-hook-installation-target-type");
      if (targetType && targetType !== "integration") {
        return reply.status(202).send({ ignored: "not_an_app_delivery" });
      }
      const appId = headerValue("x-github-hook-installation-target-id") ?? "";
      const raw = request.body as unknown;
      const rawBody = Buffer.isBuffer(raw)
        ? raw
        : Buffer.from(typeof raw === "string" ? raw : JSON.stringify(raw ?? {}), "utf8");
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
      } catch {
        return reply.status(400).send({ detail: "invalid_json" });
      }

      const installation = (payload["installation"] ?? {}) as { id?: number | string };
      const owner = service.findByAppId(appId)
        ?? service.findByInstallationId(installation.id === undefined ? "" : String(installation.id));
      if (!owner) return reply.status(404).send({ detail: "unknown_github_app" });

      const secret = service.webhookSecret(owner.userId, owner.agentId);
      if (!secret) {
        return reply.status(202).send({ accepted: false, reason: "no_webhook_secret" });
      }
      if (!verifyWebhookSignature(secret, rawBody, headerValue("x-hub-signature-256"))) {
        return reply.status(401).send({ detail: "invalid_signature" });
      }

      const event: AgentGithubWebhookEvent = {
        userId: owner.userId,
        agentId: owner.agentId,
        event: headerValue("x-github-event") ?? null,
        deliveryId: headerValue("x-github-delivery") ?? null,
        payload,
      };
      try {
        deps.intake?.receive(event);
        await deps.onWebhook?.(event);
      } catch (error) {
        request.log?.warn?.({ err: error, event: event.event }, "agent github webhook handler failed");
        return reply.status(503).send({ accepted: false, reason: "intake_failed" });
      }
      return { accepted: true, agentId: owner.agentId, event: event.event };
    });
  });
}

export type { AgentGithubAppConnection };
