import type { FastifyInstance } from "fastify";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import type { AppConfig } from "../config.js";
import type { SecurityScopeInput } from "@jait/shared";
import { requireAuth } from "../security/http-auth.js";
import { getAssessmentService } from "../security/assessment.js";

export function registerSecurityAssessmentRoutes(app: FastifyInstance, config: AppConfig, sqlite?: SqliteDatabase): void {
  app.get("/api/security/assessments", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    return getAssessmentService().history(user.id);
  });
  app.post("/api/security/scopes", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    try {
      const body = request.body as SecurityScopeInput & { sessionId?: string };
      let projectRoot: string | undefined;
      if (body?.paths?.length) {
        if (!sqlite || !body.sessionId) throw new Error("Select an owned project session for filesystem checks");
        const session = sqlite.prepare("SELECT s.project_path, s.metadata, p.node_id FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ? AND s.user_id = ? AND s.status != 'deleted' AND (s.project_id IS NULL OR p.user_id = s.user_id)").get(body.sessionId, user.id) as {project_path?: string; metadata?: string; node_id?: string} | undefined;
        if (!session?.project_path) throw new Error("Owned project session not found");
        const metadata = session.metadata ? JSON.parse(session.metadata) as {executionNodeId?: string; nodeId?: string} : {};
        if ([session.node_id, metadata.executionNodeId, metadata.nodeId].some(node => node && node !== "gateway")) throw new Error("Filesystem assessment requires a gateway-local project session");
        projectRoot = session.project_path;
      }
      return getAssessmentService().createScope(body, user.id, projectRoot);
    }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "Invalid scope" }); }
  });
  app.post("/api/security/assessments", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    try {
      const scopeId = (request.body as {scopeId?: string} | null)?.scopeId;
      if (typeof scopeId !== "string") throw new Error("scopeId required");
      return reply.status(202).send(getAssessmentService().start(scopeId, user.id));
    } catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "Assessment failed" }); }
  });
  app.get<{ Params: { id: string } }>("/api/security/assessments/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    try { return getAssessmentService().getRun(request.params.id, user.id); }
    catch { return reply.status(404).send({ error: "Assessment not found" }); }
  });
  app.post<{ Params: { id: string } }>("/api/security/assessments/:id/cancel", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    try { getAssessmentService().cancel(request.params.id, user.id); return { ok: true }; }
    catch { return reply.status(404).send({ error: "Assessment not found" }); }
  });
}
