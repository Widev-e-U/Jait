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

    const query = request.query as { projectRoot?: string };
    const projectRoot = query.projectRoot?.trim();
    if (!projectRoot) {
      return reply.status(400).send({ error: "projectRoot is required" });
    }

    const diagram = diagrams.getByProject(projectRoot, authUser.id);
    return {
      diagram: diagram ? {
        projectRoot: diagram.projectRoot,
        diagram: diagram.diagram,
        filePath: diagram.filePath,
        updatedAt: diagram.updatedAt,
      } : null,
    };
  });

  app.put("/api/architecture", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const body = (request.body ?? {}) as { projectRoot?: string; diagram?: string };
    const projectRoot = body.projectRoot?.trim();
    const diagram = body.diagram?.trim();
    if (!projectRoot) {
      return reply.status(400).send({ error: "projectRoot is required" });
    }
    if (!diagram) {
      return reply.status(400).send({ error: "diagram is required" });
    }

    const saved = await diagrams.save({
      projectRoot,
      diagram,
      userId: authUser.id,
    });
    return {
      diagram: {
        projectRoot: saved.projectRoot,
        diagram: saved.diagram,
        filePath: saved.filePath,
        updatedAt: saved.updatedAt,
      },
    };
  });
}
