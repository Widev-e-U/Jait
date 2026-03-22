import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { WorkspaceService } from "../services/workspaces.js";
import type { SessionService } from "../services/sessions.js";
import type { WorkspaceStateService } from "../services/workspace-state.js";
import { requireAuth } from "../security/http-auth.js";

export function registerWorkspaceEntityRoutes(
  app: FastifyInstance,
  config: AppConfig,
  workspaceService: WorkspaceService,
  sessionService: SessionService,
  workspaceState?: WorkspaceStateService,
) {
  const parseListLimit = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return undefined;
    return Math.min(parsed, 100);
  };

  app.post("/api/workspaces", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const workspace = workspaceService.getOrCreateForRoot({
      userId: authUser.id,
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      rootPath: typeof body["rootPath"] === "string" ? body["rootPath"] : null,
      nodeId: typeof body["nodeId"] === "string" ? body["nodeId"] : "gateway",
    });
    return reply.status(201).send(workspace);
  });

  app.get("/api/workspaces", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : "active";
    const limit = parseListLimit(query["limit"]);
    return workspaceService.listWithSessions(authUser.id, status, limit);
  });

  app.get("/api/workspaces/last-active", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const session = sessionService.lastActive(authUser.id);
    if (!session?.workspaceId) {
      return { workspace: null, session };
    }
    return {
      workspace: workspaceService.getById(session.workspaceId, authUser.id) ?? null,
      session,
    };
  });

  app.post("/api/workspaces/select", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const workspaceId = typeof body["workspaceId"] === "string" ? body["workspaceId"] : null;
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : null;
    if (!workspaceId) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "workspaceId is required" });
    }
    const workspace = workspaceService.getById(workspaceId, authUser.id);
    if (!workspace) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
    }
    workspaceService.touch(workspaceId);
    if (sessionId) {
      sessionService.touch(sessionId);
    }
    return { ok: true };
  });

  app.get("/api/workspaces/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const workspace = workspaceService.getById(id, authUser.id);
    if (!workspace) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
    }
    return {
      ...workspace,
      sessions: sessionService.listByWorkspace(id, "active", authUser.id),
    };
  });

  app.patch("/api/workspaces/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const workspace = workspaceService.getById(id, authUser.id);
    if (!workspace) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
    }
    const body = (request.body as Record<string, unknown>) ?? {};
    workspaceService.update(id, {
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      rootPath: typeof body["rootPath"] === "string" ? body["rootPath"] : undefined,
      nodeId: typeof body["nodeId"] === "string" ? body["nodeId"] : undefined,
    }, authUser.id);
    return workspaceService.getById(id, authUser.id);
  });

  app.delete("/api/workspaces/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const workspace = workspaceService.getById(id, authUser.id);
    if (!workspace) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
    }

    const sessionsInWorkspace = sessionService.listByWorkspace(id, undefined, authUser.id);
    const hasRetainedSessions = sessionsInWorkspace.some((session) => session.status !== "deleted");
    if (hasRetainedSessions) {
      return reply.status(409).send({
        error: "WORKSPACE_NOT_EMPTY",
        details: "Workspace still has sessions. Archive or move them before deleting the workspace.",
      });
    }

    workspaceService.delete(id, authUser.id);
    return reply.status(204).send();
  });

  app.get("/api/workspaces/:id/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const workspace = workspaceService.getById(id, authUser.id);
    if (!workspace) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
    }
    const query = request.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : "active";
    return { sessions: sessionService.listByWorkspace(id, status, authUser.id) };
  });

  app.post("/api/workspaces/:id/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const workspace = workspaceService.getById(id, authUser.id);
    if (!workspace) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
    }
    const body = (request.body as Record<string, unknown>) ?? {};
    const session = sessionService.create({
      userId: authUser.id,
      workspaceId: id,
      workspacePath: workspace.rootPath ?? undefined,
      name: typeof body["name"] === "string" ? body["name"] : undefined,
    });
    workspaceService.touch(id);
    return reply.status(201).send(session);
  });

  if (workspaceState) {
    app.get("/api/workspaces/:id/state", async (request, reply) => {
      const authUser = await requireAuth(request, reply, config.jwtSecret);
      if (!authUser) return;
      const { id } = request.params as { id: string };
      const workspace = workspaceService.getById(id, authUser.id);
      if (!workspace) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
      }
      const query = request.query as Record<string, unknown>;
      const keysParam = typeof query["keys"] === "string" ? query["keys"] : undefined;
      const keys = keysParam ? keysParam.split(",").map((k) => k.trim()).filter(Boolean) : undefined;
      return workspaceState.get(id, keys);
    });

    app.patch("/api/workspaces/:id/state", async (request, reply) => {
      const authUser = await requireAuth(request, reply, config.jwtSecret);
      if (!authUser) return;
      const { id } = request.params as { id: string };
      const workspace = workspaceService.getById(id, authUser.id);
      if (!workspace) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
      }
      const body = (request.body as Record<string, unknown>) ?? {};
      if (typeof body !== "object" || Array.isArray(body)) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", details: "Body must be a JSON object of key→value pairs" });
      }
      workspaceState.set(id, body);
      return { ok: true };
    });
  }
}
