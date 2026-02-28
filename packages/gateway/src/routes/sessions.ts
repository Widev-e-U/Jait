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
import type { SessionService } from "../services/sessions.js";
import type { AuditWriter } from "../services/audit.js";
import { uuidv7 } from "../lib/uuidv7.js";

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  audit: AuditWriter,
) {
  // Create session
  app.post("/api/sessions", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const session = sessionService.create({
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

    return reply.status(201).send(session);
  });

  // List sessions
  app.get("/api/sessions", async (request) => {
    const query = request.query as Record<string, unknown>;
    const status =
      typeof query["status"] === "string" ? query["status"] : undefined;
    return { sessions: sessionService.list(status) };
  });

  // Get the most recently active session
  app.get("/api/sessions/last-active", async () => {
    const session = sessionService.lastActive();
    return { session };
  });

  // Get session by ID
  app.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // Skip the /:sessionId/messages route (handled by chat.ts)
    if (id === "messages") return reply.callNotFound();
    const session = sessionService.getById(id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    return session;
  });

  // Update session
  app.patch("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const session = sessionService.getById(id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    sessionService.update(id, {
      name: typeof body["name"] === "string" ? body["name"] : undefined,
    });
    return sessionService.getById(id);
  });

  // Soft-delete session
  app.delete("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionService.getById(id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    sessionService.delete(id);

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
    const { id } = request.params as { id: string };
    const session = sessionService.getById(id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    sessionService.archive(id);
    return sessionService.getById(id);
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
}
