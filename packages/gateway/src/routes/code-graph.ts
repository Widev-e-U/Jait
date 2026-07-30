import { resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { CodeGraphService } from "../services/code-graph/code-graphs.js";
import { GraphifyUnavailableError } from "../services/code-graph/graphify-runner.js";
import { getProjectRepositoryId, type ProjectService } from "../services/projects.js";

function normalizeRoot(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

function resolveOwnedProject(
  projectService: ProjectService,
  projectRoot: string,
  userId: string,
): ReturnType<ProjectService["getById"]> {
  const target = normalizeRoot(projectRoot);
  return projectService.list("active", userId).find((project) => (
    typeof project.rootPath === "string"
    && normalizeRoot(project.rootPath) === target
  ));
}

function sendGraphError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof GraphifyUnavailableError) {
    return reply.status(503).send({
      error: message,
      code: "GRAPHIFY_UNAVAILABLE",
      installCommand: "jait doctor",
    });
  }
  if (/not been indexed|has not been indexed/i.test(message)) {
    return reply.status(409).send({ error: message, code: "GRAPH_NOT_READY" });
  }
  return reply.status(500).send({ error: message });
}

export function registerCodeGraphRoutes(
  app: FastifyInstance,
  config: AppConfig,
  service: CodeGraphService,
  projectService: ProjectService,
): void {
  const requireProject = async (
    request: { query?: unknown; body?: unknown },
    reply: FastifyReply,
  ) => {
    const authUser = await requireAuth(request as never, reply, config.jwtSecret);
    if (!authUser) return null;
    const input = {
      ...(request.query && typeof request.query === "object" ? request.query : {}),
      ...(request.body && typeof request.body === "object" ? request.body : {}),
    } as { projectRoot?: string };
    const projectRoot = input.projectRoot?.trim();
    if (!projectRoot) {
      reply.status(400).send({ error: "projectRoot is required" });
      return null;
    }
    const project = resolveOwnedProject(projectService, projectRoot, authUser.id);
    if (!project) {
      reply.status(404).send({ error: "Project not found" });
      return null;
    }
    if (project.nodeId && project.nodeId !== "gateway") {
      reply.status(409).send({
        error: "Code graph indexing for remote projects must run on the project node",
        code: "REMOTE_GRAPH_UNSUPPORTED",
        nodeId: project.nodeId,
      });
      return null;
    }
    return {
      authUser,
      project,
      projectRoot: resolve(projectRoot),
      repositoryId: getProjectRepositoryId(project),
    };
  };

  app.get("/api/code-graph", async (request, reply) => {
    const context = await requireProject(request, reply);
    if (!context) return;
    return { index: service.getIndex(context.projectRoot, context.authUser.id) };
  });

  app.post("/api/code-graph/index", async (request, reply) => {
    const context = await requireProject(request, reply);
    if (!context) return;
    try {
      const index = await service.index({
        projectRoot: context.projectRoot,
        userId: context.authUser.id,
        repositoryId: context.repositoryId,
        signal: request.signal,
      });
      return { index };
    } catch (error) {
      return sendGraphError(reply, error);
    }
  });

  app.get("/api/code-graph/snapshot", async (request, reply) => {
    const context = await requireProject(request, reply);
    if (!context) return;
    const query = request.query as { maxNodes?: string | number };
    const maxNodes = typeof query.maxNodes === "number"
      ? query.maxNodes
      : Number.parseInt(query.maxNodes ?? "", 10);
    try {
      return {
        snapshot: await service.snapshot({
          projectRoot: context.projectRoot,
          userId: context.authUser.id,
          maxNodes: Number.isFinite(maxNodes) ? maxNodes : undefined,
        }),
      };
    } catch (error) {
      return sendGraphError(reply, error);
    }
  });

  app.post("/api/code-graph/query", async (request, reply) => {
    const context = await requireProject(request, reply);
    if (!context) return;
    const body = (request.body ?? {}) as {
      query?: string;
      mode?: "structural" | "global" | "hybrid";
      maxNodes?: number;
      maxDepth?: number;
    };
    if (!body.query?.trim()) {
      return reply.status(400).send({ error: "query is required" });
    }
    try {
      return {
        result: await service.query({
          projectRoot: context.projectRoot,
          userId: context.authUser.id,
          query: body.query,
          mode: body.mode,
          maxNodes: body.maxNodes,
          maxDepth: body.maxDepth,
        }),
      };
    } catch (error) {
      return sendGraphError(reply, error);
    }
  });

  app.post("/api/code-graph/graphrag/prepare", async (request, reply) => {
    const context = await requireProject(request, reply);
    if (!context) return;
    try {
      return await service.prepareGraphRag({
        projectRoot: context.projectRoot,
        userId: context.authUser.id,
      });
    } catch (error) {
      return sendGraphError(reply, error);
    }
  });

  app.post("/api/code-graph/path", async (request, reply) => {
    const context = await requireProject(request, reply);
    if (!context) return;
    const body = (request.body ?? {}) as {
      source?: string;
      target?: string;
      maxDepth?: number;
    };
    if (!body.source?.trim() || !body.target?.trim()) {
      return reply.status(400).send({ error: "source and target are required" });
    }
    try {
      const result = await service.shortestPath({
        projectRoot: context.projectRoot,
        userId: context.authUser.id,
        source: body.source,
        target: body.target,
        maxDepth: body.maxDepth,
      });
      if (!result) return reply.status(404).send({ error: "No graph path found" });
      return { result };
    } catch (error) {
      return sendGraphError(reply, error);
    }
  });
}
