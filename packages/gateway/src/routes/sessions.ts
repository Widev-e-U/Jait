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
import type { ProjectService } from "../services/projects.js";
import type { WsControlPlane } from "../ws.js";
import type { WsEventType } from "@jait/shared/types";
import type { UserService } from "../services/users.js";
import { generateTitleViaApi, normalizeGeneratedThreadTitle } from "../services/thread-title.js";

export function registerSessionRoutes(
  app: FastifyInstance,
  config: AppConfig,
  sessionService: SessionService,
  audit: AuditWriter,
  hooks?: HookBus,
  sessionState?: SessionStateService,
  projectService?: ProjectService,
  ws?: WsControlPlane,
  userService?: UserService,
) {
  /** Broadcast a chat/session event over WS to the owning user's other clients */
  const broadcastChatEvent = (
    userId: string,
    event: "created" | "updated" | "archived" | "deleted",
    data: Record<string, unknown>,
  ): void => {
    if (!ws) return;
    ws.broadcastToUser(userId, {
      type: `chat.${event}` as WsEventType,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: data,
    });
  };
  const parseSessionListLimit = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return undefined;
    return Math.min(parsed, 100);
  };

  // Create session
  app.post("/api/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    let projectId =
      typeof body["projectId"] === "string"
        ? body["projectId"]
        : undefined;
    if (projectId) {
      const project = projectService?.getById(projectId, authUser.id);
      if (!project) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
      }
    } else if (projectService && typeof body["projectPath"] === "string" && body["projectPath"].trim().length > 0) {
      const project = projectService.getOrCreateForRoot({
        userId: authUser.id,
        title: typeof body["projectTitle"] === "string" ? body["projectTitle"] : undefined,
        rootPath: body["projectPath"],
        nodeId: typeof body["nodeId"] === "string" ? body["nodeId"] : "gateway",
      });
      projectId = project.id;
    }
    const session = sessionService.create({
      userId: authUser.id,
      projectId,
      name: typeof body["name"] === "string" ? body["name"] : undefined,
      projectPath:
        typeof body["projectPath"] === "string"
          ? body["projectPath"]
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
      projectRoot: session.projectPath ?? process.cwd(),
    });
    if (session.projectId) {
      projectService?.touch(session.projectId);
    }

    broadcastChatEvent(authUser.id, "created", { projectId: session.projectId ?? null, session });
    return reply.status(201).send(session);
  });

  // List sessions
  app.get("/api/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as Record<string, unknown>;
    const status =
      typeof query["status"] === "string" ? query["status"] : undefined;
    const limit = parseSessionListLimit(query["limit"]);
    if (!limit) {
      return { sessions: sessionService.list(status, authUser.id), hasMore: false };
    }
    const sessions = sessionService.list(status, authUser.id, limit + 1);
    return {
      sessions: sessions.slice(0, limit),
      hasMore: sessions.length > limit,
    };
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
    if ("provider" in body || "model" in body || "reasoningEffort" in body) {
      sessionService.updateChatSelection(id, {
        provider: typeof body["provider"] === "string" || body["provider"] === null ? body["provider"] as string | null : undefined,
        model: typeof body["model"] === "string" || body["model"] === null ? body["model"] as string | null : undefined,
        reasoningEffort: typeof body["reasoningEffort"] === "string" || body["reasoningEffort"] === null ? body["reasoningEffort"] as string | null : undefined,
      }, authUser.id);
    }
    const updated = sessionService.getById(id, authUser.id);
    broadcastChatEvent(authUser.id, "updated", { projectId: session.projectId ?? null, session: updated });
    return updated;
  });

  // Mark a session as read/viewed by the user (used for the unread indicator)
  app.post("/api/sessions/:id/viewed", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = sessionService.getById(id, authUser.id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    sessionService.markViewed(id, authUser.id);
    return { ok: true, session: sessionService.getById(id, authUser.id) };
  });

  app.post("/api/sessions/:id/generate-title", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const prompt = typeof body["prompt"] === "string" ? body["prompt"].trim() : "";
    if (!prompt) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "prompt is required" });
    }

    const session = sessionService.getById(id, authUser.id);
    if (!session) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }
    const currentName = session.name?.trim() ?? "";
    if (currentName && currentName !== "New Chat" && !currentName.startsWith("Session ")) {
      return { session, generated: false };
    }

    const settings = userService?.getSettings(authUser.id);
    let generated = true;
    let title: string;
    try {
      title = await generateTitleViaApi({
        task: prompt,
        config,
        apiKeys: settings?.apiKeys,
        model: typeof body["model"] === "string" ? body["model"] : undefined,
        jaitBackend: settings?.jaitBackend,
      });
    } catch {
      generated = false;
      title = normalizeGeneratedThreadTitle(prompt, "New Chat");
    }

    const latest = sessionService.getById(id, authUser.id);
    const latestName = latest?.name?.trim() ?? "";
    if (!latest || (latestName && latestName !== "New Chat" && !latestName.startsWith("Session "))) {
      return { session: latest ?? session, generated: false };
    }

    sessionService.update(id, { name: title }, authUser.id);
    const updated = sessionService.getById(id, authUser.id);
    broadcastChatEvent(authUser.id, "updated", { projectId: session.projectId ?? null, session: updated });
    return { session: updated, generated };
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

    broadcastChatEvent(authUser.id, "deleted", { projectId: session.projectId ?? null, sessionId: id });
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
    broadcastChatEvent(authUser.id, "archived", { projectId: session.projectId ?? null, sessionId: id });
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
    // GET /api/sessions/:id/state?keys=project.panel,terminal.visible
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

    // PATCH /api/sessions/:id/state  — body: { "project.panel": {...}, "key2": null }
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
