import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { WorkspaceService } from "../services/workspaces.js";
import type { SessionService } from "../services/sessions.js";
import type { WorkspaceStateService } from "../services/workspace-state.js";
import type { RepositoryService } from "../services/repositories.js";
import { GitService } from "../services/git.js";
import {
  assignRepositoryToWorkspace,
  autoAssignWorkspaceRepositories,
  WorkspaceRepositoryAssignmentError,
} from "../services/workspace-repositories.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";

export interface WorkspaceEntityRouteDeps {
  repoService?: RepositoryService;
  gitService?: GitService;
  ws?: WsControlPlane;
}

export function registerWorkspaceEntityRoutes(
  app: FastifyInstance,
  config: AppConfig,
  workspaceService: WorkspaceService,
  sessionService: SessionService,
  workspaceState?: WorkspaceStateService,
  deps: WorkspaceEntityRouteDeps = {},
) {
  const gitService = deps.repoService ? (deps.gitService ?? new GitService()) : undefined;

  const parseListLimit = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return undefined;
    return Math.min(parsed, 100);
  };

  const maybeAutoAssignWorkspaceRepos = async (userId: string) => {
    if (!deps.repoService || !gitService) return;
    await autoAssignWorkspaceRepositories({
      workspaceService,
      repoService: deps.repoService,
      gitService,
      userId,
      ws: deps.ws,
    });
  };

  const maybeAssignWorkspaceRepo = async (workspaceId: string, userId: string) => {
    if (!deps.repoService || !gitService) return;
    try {
      await assignRepositoryToWorkspace({
        workspaceService,
        repoService: deps.repoService,
        gitService,
        workspaceId,
        userId,
        ws: deps.ws,
      });
    } catch (err) {
      if (err instanceof WorkspaceRepositoryAssignmentError) {
        if (err.code === "WORKSPACE_NOT_GIT" || err.code === "WORKSPACE_HAS_NO_ROOT") return;
      }
      throw err;
    }
  };

  const sendAssignmentError = (reply: FastifyReply, err: unknown) => {
    if (err instanceof WorkspaceRepositoryAssignmentError) {
      const statusCode = err.code === "WORKSPACE_NOT_FOUND" || err.code === "REPOSITORY_NOT_FOUND" ? 404 : 400;
      return reply.status(statusCode).send({ error: err.code, details: err.message });
    }
    throw err;
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
    await maybeAssignWorkspaceRepo(workspace.id, authUser.id);
    return reply.status(201).send(workspaceService.getById(workspace.id, authUser.id) ?? workspace);
  });

  app.get("/api/workspaces", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : "active";
    const limit = parseListLimit(query["limit"]);
    if (status === "active") await maybeAutoAssignWorkspaceRepos(authUser.id);
    return workspaceService.listWithSessions(authUser.id, status, limit);
  });

  app.get("/api/workspaces/last-active", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const session = sessionService.lastActive(authUser.id);
    await maybeAutoAssignWorkspaceRepos(authUser.id);
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
    if (workspaceId) {
      const workspace = workspaceService.getById(workspaceId, authUser.id);
      if (!workspace) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
      }
      workspaceService.touch(workspaceId);
    }
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
    await maybeAssignWorkspaceRepo(id, authUser.id);
    return workspaceService.getById(id, authUser.id);
  });

  app.post("/api/workspaces/:id/repository", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!deps.repoService || !gitService) {
      return reply.status(503).send({ error: "UNAVAILABLE", details: "Repository service is not available" });
    }
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const repoId = typeof body["repoId"] === "string" ? body["repoId"] : undefined;

    try {
      const assignment = await assignRepositoryToWorkspace({
        workspaceService,
        repoService: deps.repoService,
        gitService,
        workspaceId: id,
        userId: authUser.id,
        repoId,
        ws: deps.ws,
      });
      return assignment;
    } catch (err) {
      return sendAssignmentError(reply, err);
    }
  });

  app.delete("/api/workspaces/archived", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const archived = workspaceService.list("archived", authUser.id);
    for (const workspace of archived) {
      sessionService.deleteByWorkspace(workspace.id, authUser.id);
    }
    const removed = workspaceService.deleteArchived(authUser.id);
    return { ok: true, removed };
  });

  app.get("/api/workspaces/archived", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const archived = workspaceService.list("archived", authUser.id);
    return { workspaces: archived };
  });

  app.post("/api/workspaces/:id/restore", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const workspace = workspaceService.getById(id, authUser.id);
    if (!workspace) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Workspace not found" });
    }
    if (workspace.status !== "archived") {
      return reply.status(400).send({ error: "BAD_REQUEST", details: "Workspace is not archived" });
    }
    sessionService.restoreByWorkspace(id, authUser.id);
    workspaceService.restore(id, authUser.id);
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
    const sessions = sessionService.listByWorkspace(id, "active", authUser.id);
    if (sessions.length > 0) {
      return reply.status(409).send({ error: "CONFLICT", details: "Workspace still has active sessions" });
    }
    sessionService.archiveByWorkspace(id, authUser.id);
    workspaceService.archive(id, authUser.id);
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
