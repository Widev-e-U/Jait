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
    const session = await deps.previewService.refreshSessionCapture(sessionId);
    return { session };
  });

  app.get("/api/preview/screenshot/:sessionId", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    const screenshot = await deps.previewService.screenshot(sessionId);
    return { screenshot };
  });

  app.get("/api/preview/logs/:sessionId", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    const query = request.query as { sinceId?: string };
    const sinceId = query.sinceId ? Number.parseInt(query.sinceId, 10) : 0;
    const logs = deps.previewService.getLogs(sessionId, sinceId);
    return { logs };
  });

  app.get("/api/preview/inspect/:sessionId", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { sessionId } = request.params as { sessionId: string };
    const query = request.query as { selector?: string };
    const inspect = await deps.previewService.inspect(sessionId, typeof query.selector === "string" ? query.selector : undefined);
    return { inspect };
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
      frameworkHint?: string | null;
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
      frameworkHint: body.frameworkHint ?? null,
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
