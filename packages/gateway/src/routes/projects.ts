import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { ProjectService } from "../services/projects.js";
import type { SessionService } from "../services/sessions.js";
import type { ProjectStateService } from "../services/project-state.js";
import type { RepositoryService } from "../services/repositories.js";
import { GitService } from "../services/git.js";
import {
  assignRepositoryToProject,
  autoAssignProjectRepositories,
  ProjectRepositoryAssignmentError,
} from "../services/project-repositories.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";

export interface ProjectEntityRouteDeps {
  repoService?: RepositoryService;
  gitService?: GitService;
  ws?: WsControlPlane;
}

export function registerProjectEntityRoutes(
  app: FastifyInstance,
  config: AppConfig,
  projectService: ProjectService,
  sessionService: SessionService,
  projectState?: ProjectStateService,
  deps: ProjectEntityRouteDeps = {},
) {
  const gitService = deps.repoService ? (deps.gitService ?? new GitService()) : undefined;

  const parseListLimit = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return undefined;
    return Math.min(parsed, 100);
  };

  const maybeAutoAssignProjectRepos = async (userId: string) => {
    if (!deps.repoService || !gitService) return;
    await autoAssignProjectRepositories({
      projectService,
      repoService: deps.repoService,
      gitService,
      userId,
      ws: deps.ws,
    });
  };

  const maybeAssignProjectRepo = async (projectId: string, userId: string) => {
    if (!deps.repoService || !gitService) return;
    try {
      await assignRepositoryToProject({
        projectService,
        repoService: deps.repoService,
        gitService,
        projectId,
        userId,
        ws: deps.ws,
      });
    } catch (err) {
      if (err instanceof ProjectRepositoryAssignmentError) {
        if (err.code === "PROJECT_NOT_GIT" || err.code === "PROJECT_HAS_NO_ROOT") return;
      }
      throw err;
    }
  };

  const sendAssignmentError = (reply: FastifyReply, err: unknown) => {
    if (err instanceof ProjectRepositoryAssignmentError) {
      const statusCode = err.code === "PROJECT_NOT_FOUND" || err.code === "REPOSITORY_NOT_FOUND" ? 404 : 400;
      return reply.status(statusCode).send({ error: err.code, details: err.message });
    }
    throw err;
  };

  app.post("/api/projects", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const project = projectService.getOrCreateForRoot({
      userId: authUser.id,
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      rootPath: typeof body["rootPath"] === "string" ? body["rootPath"] : null,
      nodeId: typeof body["nodeId"] === "string" ? body["nodeId"] : "gateway",
    });
    await maybeAssignProjectRepo(project.id, authUser.id);
    return reply.status(201).send(projectService.getById(project.id, authUser.id) ?? project);
  });

  app.get("/api/projects", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : "active";
    const limit = parseListLimit(query["limit"]);
    if (status === "active") await maybeAutoAssignProjectRepos(authUser.id);
    return projectService.listWithSessions(authUser.id, status, limit);
  });

  app.get("/api/projects/last-active", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const session = sessionService.lastActive(authUser.id);
    await maybeAutoAssignProjectRepos(authUser.id);
    if (!session?.projectId) {
      return { project: null, session };
    }
    return {
      project: projectService.getById(session.projectId, authUser.id) ?? null,
      session,
    };
  });

  app.post("/api/projects/select", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const projectId = typeof body["projectId"] === "string" ? body["projectId"] : null;
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : null;
    if (projectId) {
      const project = projectService.getById(projectId, authUser.id);
      if (!project) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
      }
      projectService.touch(projectId);
    }
    if (sessionId) {
      sessionService.touch(sessionId);
    }
    return { ok: true };
  });

  app.get("/api/projects/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const project = projectService.getById(id, authUser.id);
    if (!project) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
    }
    return {
      ...project,
      sessions: sessionService.listByProject(id, "active", authUser.id),
    };
  });

  app.patch("/api/projects/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const project = projectService.getById(id, authUser.id);
    if (!project) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
    }
    const body = (request.body as Record<string, unknown>) ?? {};
    projectService.update(id, {
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      rootPath: typeof body["rootPath"] === "string" ? body["rootPath"] : undefined,
      nodeId: typeof body["nodeId"] === "string" ? body["nodeId"] : undefined,
    }, authUser.id);
    await maybeAssignProjectRepo(id, authUser.id);
    return projectService.getById(id, authUser.id);
  });

  app.post("/api/projects/:id/repository", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!deps.repoService || !gitService) {
      return reply.status(503).send({ error: "UNAVAILABLE", details: "Repository service is not available" });
    }
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const repoId = typeof body["repoId"] === "string" ? body["repoId"] : undefined;

    try {
      const assignment = await assignRepositoryToProject({
        projectService,
        repoService: deps.repoService,
        gitService,
        projectId: id,
        userId: authUser.id,
        repoId,
        ws: deps.ws,
      });
      return assignment;
    } catch (err) {
      return sendAssignmentError(reply, err);
    }
  });

  app.delete("/api/projects/archived", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const archived = projectService.list("archived", authUser.id);
    for (const project of archived) {
      sessionService.deleteByProject(project.id, authUser.id);
    }
    const removed = projectService.deleteArchived(authUser.id);
    return { ok: true, removed };
  });

  app.get("/api/projects/archived", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const archived = projectService.list("archived", authUser.id);
    return { projects: archived };
  });

  app.post("/api/projects/:id/restore", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const project = projectService.getById(id, authUser.id);
    if (!project) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
    }
    if (project.status !== "archived") {
      return reply.status(400).send({ error: "BAD_REQUEST", details: "Project is not archived" });
    }
    sessionService.restoreByProject(id, authUser.id);
    projectService.restore(id, authUser.id);
    return projectService.getById(id, authUser.id);
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const project = projectService.getById(id, authUser.id);
    if (!project) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
    }
    const sessions = sessionService.listByProject(id, "active", authUser.id);
    if (sessions.length > 0) {
      return reply.status(409).send({ error: "CONFLICT", details: "Project still has active sessions" });
    }
    sessionService.archiveByProject(id, authUser.id);
    projectService.archive(id, authUser.id);
    return reply.status(204).send();
  });

  app.get("/api/projects/:id/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const project = projectService.getById(id, authUser.id);
    if (!project) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
    }
    const query = request.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : "active";
    return { sessions: sessionService.listByProject(id, status, authUser.id) };
  });

  app.post("/api/projects/:id/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const project = projectService.getById(id, authUser.id);
    if (!project) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
    }
    const body = (request.body as Record<string, unknown>) ?? {};
    const session = sessionService.create({
      userId: authUser.id,
      projectId: id,
      projectPath: project.rootPath ?? undefined,
      name: typeof body["name"] === "string" ? body["name"] : undefined,
    });
    projectService.touch(id);
    return reply.status(201).send(session);
  });

  if (projectState) {
    app.get("/api/projects/:id/state", async (request, reply) => {
      const authUser = await requireAuth(request, reply, config.jwtSecret);
      if (!authUser) return;
      const { id } = request.params as { id: string };
      const project = projectService.getById(id, authUser.id);
      if (!project) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
      }
      const query = request.query as Record<string, unknown>;
      const keysParam = typeof query["keys"] === "string" ? query["keys"] : undefined;
      const keys = keysParam ? keysParam.split(",").map((k) => k.trim()).filter(Boolean) : undefined;
      return projectState.get(id, keys);
    });

    app.patch("/api/projects/:id/state", async (request, reply) => {
      const authUser = await requireAuth(request, reply, config.jwtSecret);
      if (!authUser) return;
      const { id } = request.params as { id: string };
      const project = projectService.getById(id, authUser.id);
      if (!project) {
        return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
      }
      const body = (request.body as Record<string, unknown>) ?? {};
      if (typeof body !== "object" || Array.isArray(body)) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", details: "Body must be a JSON object of key→value pairs" });
      }
      projectState.set(id, body);
      return { ok: true };
    });
  }
}
