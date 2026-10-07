/**
 * Consent Routes — Sprint 4.9
 *
 * REST API for consent management: list pending, approve, reject.
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../security/http-auth.js";
import { loadConfig, type AppConfig } from "../config.js";
import { ControlAccess } from "../security/control-access.js";
import type { ConsentManager } from "../security/consent-manager.js";
import type { ToolPermission } from "../security/tool-permissions.js";
import type { ProfileName } from "../security/tool-profiles.js";
import type { AuditWriter } from "../services/audit.js";
import { uuidv7 } from "../db/uuidv7.js";

export function registerConsentRoutes(
  app: FastifyInstance,
  consentManager: ConsentManager,
  audit: AuditWriter,
  options: {
    config?: AppConfig;
    access?: ControlAccess;
    activeProfileName?: ProfileName;
    permissions?: Map<string, ToolPermission>;
  } = {},
) {
  const config = options.config ?? loadConfig();
  const access = options.access ?? new ControlAccess(undefined, undefined, consentManager);
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/consent")) return;
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const { id, sessionId } = request.params as { id?: string; sessionId?: string };
    if ((id && !access.consentRequest(id, user.id)) || (sessionId && !access.session(sessionId, user.id))) {
      return reply.status(404).send({ error: "NOT_FOUND" });
    }
  });
  app.get("/api/consent/policy", async () => {
    const permissions = options.permissions ? [...options.permissions.values()] : [];
    return {
      activeProfileName: options.activeProfileName ?? null,
      toolCount: permissions.length,
      permissions,
      unknownToolsRequireConsent: true,
    };
  });

  // GET /api/consent/pending — list all pending consent requests
  app.get("/api/consent/pending", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const requests = consentManager.listPending().filter((r) => access.session(r.sessionId, user.id));
    return { requests };
  });

  // GET /api/consent/pending/:sessionId — list pending for a session
  app.get("/api/consent/pending/:sessionId", async (request, _reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const requests = consentManager.listPending(sessionId);
    return { requests };
  });

  // GET /api/consent/:id — get a specific consent request
  app.get("/api/consent/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const req = consentManager.getRequest(id);
    if (!req) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Consent request not found" });
    }
    return req;
  });

  // POST /api/consent/:id/approve — approve a pending request
  app.post("/api/consent/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const reason = typeof body["reason"] === "string" ? body["reason"] : undefined;

    const ok = consentManager.approve(id, "click", reason);
    if (!ok) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Consent request not found or already resolved" });
    }

    audit.write({
      actionId: uuidv7(),
      actionType: "consent.approve",
      status: "executed",
      inputs: { requestId: id, reason },
    });

    return { ok: true, decision: "approved" };
  });

  // POST /api/consent/:id/reject — reject a pending request
  app.post("/api/consent/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const reason = typeof body["reason"] === "string" ? body["reason"] : "User rejected";

    const ok = consentManager.reject(id, "click", reason);
    if (!ok) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Consent request not found or already resolved" });
    }

    audit.write({
      actionId: uuidv7(),
      actionType: "consent.reject",
      status: "executed",
      inputs: { requestId: id, reason },
    });

    return { ok: true, decision: "rejected" };
  });

  // Notification bulk approval applies only to currently pending requests in this chat.
  // The preHandler validates ownership of the originating request before any mutation.
  app.post("/api/consent/:id/approve-all", async (request, reply) => {
    const { id } = request.params as { id: string };
    const pending = consentManager.getRequest(id);
    if (!pending || pending.status !== "pending") {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Consent request not found or already resolved" });
    }
    const sessionId = pending.sessionId;
    const approvedRequestIds: string[] = [];
    for (const entry of consentManager.listPending(sessionId)) {
      if (consentManager.approve(entry.id, "click", "notification.approve-all")) {
        approvedRequestIds.push(entry.id);
        audit.write({
          sessionId,
          actionId: uuidv7(),
          actionType: "consent.approve",
          status: "executed",
          inputs: { requestId: entry.id, reason: "notification.approve-all", bulk: true },
        });
      }
    }
    return { ok: true, sessionId, approvedCount: approvedRequestIds.length, requestIds: approvedRequestIds };
  });

  // POST /api/consent/pending/:sessionId/approve-all — approve all pending for a session
  app.post("/api/consent/pending/:sessionId/approve-all", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const reason = typeof body["reason"] === "string" ? body["reason"] : undefined;

    // Enable session-wide bypass for future requests in this session.
    consentManager.enableApproveAllForSession(sessionId);

    const pending = consentManager.listPending(sessionId);
    const approvedRequestIds: string[] = [];

    for (const req of pending) {
      const ok = consentManager.approve(req.id, "click", reason);
      if (ok) {
        approvedRequestIds.push(req.id);
        audit.write({
          sessionId,
          actionId: uuidv7(),
          actionType: "consent.approve",
          status: "executed",
          inputs: { requestId: req.id, reason, bulk: true },
        });
      }
    }

    return {
      ok: true,
      sessionId,
      approveAllEnabled: true,
      approvedCount: approvedRequestIds.length,
      requestIds: approvedRequestIds,
    };
  });

  // GET /api/consent/pending/:sessionId/approve-all — check approve-all status
  app.get("/api/consent/pending/:sessionId/approve-all", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    return {
      sessionId,
      approveAllEnabled: consentManager.isApproveAllEnabledForSession(sessionId),
    };
  });

  // DELETE /api/consent/pending/:sessionId/approve-all — clear approve-all status
  app.delete("/api/consent/pending/:sessionId/approve-all", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    consentManager.disableApproveAllForSession(sessionId);
    audit.write({
      sessionId,
      actionId: uuidv7(),
      actionType: "consent.approve_all.clear",
      status: "executed",
      inputs: { sessionId },
    });
    return {
      ok: true,
      sessionId,
      approveAllEnabled: false,
    };
  });

  // GET /api/consent/count — pending count
  app.get("/api/consent/count", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    return { count: consentManager.listPending().filter((r) => access.session(r.sessionId, user.id)).length };
  });

  // GET /api/trust — list all trust levels
  app.get("/api/trust", async (_request, _reply) => {
    // Trust engine is accessed via the tool executor pipeline — provide via closure
    return { message: "Use GET /api/trust/levels for trust data" };
  });
}
