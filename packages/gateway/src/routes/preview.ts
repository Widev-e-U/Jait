import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { PreviewService } from "../services/preview.js";

export function registerPreviewRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: { previewService: PreviewService },
): void {
  app.get("/api/preview/session/:sessionId", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    return { session: deps.previewService.get(sessionId) };
  });

  app.post("/api/preview/start", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body ?? {}) as {
      sessionId?: string;
      workspaceRoot?: string | null;
      target?: string | null;
      command?: string | null;
      port?: number | null;
    };
    if (!body.sessionId) {
      return reply.status(400).send({ error: "sessionId is required" });
    }
    const session = await deps.previewService.start({
      sessionId: body.sessionId,
      workspaceRoot: body.workspaceRoot ?? null,
      target: body.target ?? null,
      command: body.command ?? null,
      port: typeof body.port === "number" ? body.port : null,
    });
    return { session };
  });

  app.post("/api/preview/restart", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body ?? {}) as { sessionId?: string };
    if (!body.sessionId) {
      return reply.status(400).send({ error: "sessionId is required" });
    }
    const session = await deps.previewService.restart(body.sessionId);
    if (!session) {
      return reply.status(404).send({ error: "Preview session not found" });
    }
    return { session };
  });

  app.post("/api/preview/stop", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body ?? {}) as { sessionId?: string };
    if (!body.sessionId) {
      return reply.status(400).send({ error: "sessionId is required" });
    }
    const stopped = await deps.previewService.stop(body.sessionId);
    return { ok: stopped };
  });
}
