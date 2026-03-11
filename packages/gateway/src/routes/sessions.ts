/**
 * Session REST routes.
 *
 *   POST   /api/sessions              — create
 *   GET    /api/sessions              — list (filter by ?status=active)
 *   GET    /api/sessions/:id          — get by ID
 *   PATCH  /api/sessions/:id          — update name / metadata
 *   DELETE /api/sessions/:id          — soft-delete
 *   POST   /api/sessions/:id/archive  — archive
 */
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { SessionService } from "../services/sessions.js";
import type { SessionStateService } from "../services/session-state.js";
import type { AuditWriter } from "../services/audit.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { HookBus } from "../scheduler/hooks.js";
import { requireAuth } from "../security/http-auth.js";

export function registerSessionRoutes(
  app: FastifyInstance,
  config: AppConfig,
  sessionService: SessionService,
  audit: AuditWriter,
  hooks?: HookBus,
  sessionState?: SessionStateService,
) {
  // Create session
  app.post("/api/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const session = sessionService.create({
      userId: authUser.id,
      name: typeof body["name"] === "string" ? body["name"] : undefined,
      workspacePath:
        typeof body["workspacePath"] === "string"
          ? body["workspacePath"]
          : undefined,
    });

    audit.write({
      sessionId: session.id,
      actionId: uuidv7(),
      actionType: "session.create",
      status: "executed",
      consentMethod: "auto",
    });

    hooks?.emit("session.start", {
      sessionId: session.id,
      workspaceRoot: session.workspacePath ?? process.cwd(),
    });

    return reply.status(201).send(session);
  });

  // List sessions
  app.get("/api/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as Record<string, unknown>;
    const status =
      typeof query["status"] === "string" ? query["status"] : undefined;
    return { sessions: sessionService.list(status, authUser.id) };
  });

  // Get the most recently active session
  app.get("/api/sessions/last-active", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const session = sessionService.lastActive(authUser.id);
    return { session };
  });

  // Get session by ID
  app.get("/api/sessions/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    // Skip the /:sessionId/messages route (handled by chat.ts)
    if (id === "messages") return reply.callNotFound();
    const session = sessionService.getById(id, authUser.id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    return session;
  });

  // Update session
  app.patch("/api/sessions/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const session = sessionService.getById(id, authUser.id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    sessionService.update(id, {
      name: typeof body["name"] === "string" ? body["name"] : undefined,
    }, authUser.id);
    return sessionService.getById(id, authUser.id);
  });

  // Soft-delete session
  app.delete("/api/sessions/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = sessionService.getById(id, authUser.id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    sessionService.delete(id, authUser.id);

    audit.write({
      sessionId: id,
      actionId: uuidv7(),
      actionType: "session.delete",
      status: "executed",
      consentMethod: "auto",
    });

    return { ok: true };
  });

  // Archive session
  app.post("/api/sessions/:id/archive", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = sessionService.getById(id, authUser.id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    sessionService.archive(id, authUser.id);
    hooks?.emit("session.end", { sessionId: id });
    return sessionService.getById(id, authUser.id);
  });

  // ─── Self-control tools ────────────────────────────────────────────
  // These endpoints are called by the LLM agent itself.

  // sessions.list — agent can list active sessions
  app.get("/api/tools/sessions.list", async () => {
    return { sessions: sessionService.list("active") };
  });

  // sessions.status — agent can check a specific session's status
  app.get("/api/tools/sessions.status", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const sessionId =
      typeof query["sessionId"] === "string" ? query["sessionId"] : undefined;
    if (!sessionId) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", details: "sessionId query param required" });
    }
    const session = sessionService.getById(sessionId);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    return session;
  });

  // ─── Session State (per-session key-value store) ───────────────────
  if (sessionState) {
    // GET /api/sessions/:id/state?keys=workspace.panel,terminal.visible
    app.get("/api/sessions/:id/state", async (request, reply) => {
      const authUser = await requireAuth(request, reply, config.jwtSecret);
      if (!authUser) return;
      const { id } = request.params as { id: string };
      const session = sessionService.getById(id, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
      const query = request.query as Record<string, unknown>;
      const keysParam = typeof query["keys"] === "string" ? query["keys"] : undefined;
      const keys = keysParam ? keysParam.split(",").map((k) => k.trim()).filter(Boolean) : undefined;
      return sessionState.get(id, keys);
    });

    // PATCH /api/sessions/:id/state  — body: { "workspace.panel": {...}, "key2": null }
    app.patch("/api/sessions/:id/state", async (request, reply) => {
      const authUser = await requireAuth(request, reply, config.jwtSecret);
      if (!authUser) return;
      const { id } = request.params as { id: string };
      const session = sessionService.getById(id, authUser.id);
      if (!session) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
      }
      const body = (request.body as Record<string, unknown>) ?? {};
      if (typeof body !== "object" || Array.isArray(body)) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", details: "Body must be a JSON object of key→value pairs" });
      }
      sessionState.set(id, body);
      return { ok: true };
    });
  }
}
