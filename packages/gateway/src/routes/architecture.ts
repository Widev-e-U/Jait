import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ArchitectureDiagramService } from "../services/architecture-diagrams.js";
import { requireAuth } from "../security/http-auth.js";

export function registerArchitectureRoutes(
  app: FastifyInstance,
  config: AppConfig,
  diagrams: ArchitectureDiagramService,
): void {
  app.get("/api/architecture", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const query = request.query as { workspaceRoot?: string };
    const workspaceRoot = query.workspaceRoot?.trim();
    if (!workspaceRoot) {
      return reply.status(400).send({ error: "workspaceRoot is required" });
    }

    const diagram = diagrams.getByWorkspace(workspaceRoot, authUser.id);
    return {
      diagram: diagram ? {
        workspaceRoot: diagram.workspaceRoot,
        diagram: diagram.diagram,
        updatedAt: diagram.updatedAt,
      } : null,
    };
  });

  app.put("/api/architecture", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const body = (request.body ?? {}) as { workspaceRoot?: string; diagram?: string };
    const workspaceRoot = body.workspaceRoot?.trim();
    const diagram = body.diagram?.trim();
    if (!workspaceRoot) {
      return reply.status(400).send({ error: "workspaceRoot is required" });
    }
    if (!diagram) {
      return reply.status(400).send({ error: "diagram is required" });
    }

    const saved = diagrams.save({
      workspaceRoot,
      diagram,
      userId: authUser.id,
    });
    return {
      diagram: {
        workspaceRoot: saved.workspaceRoot,
        diagram: saved.diagram,
        updatedAt: saved.updatedAt,
      },
    };
  });
}
