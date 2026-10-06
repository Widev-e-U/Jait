import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { SecurityCheckInput } from "@jait/shared";
import { getSecurityWorkbench } from "../security/workbench.js";
import type { SchedulerService } from "../scheduler/service.js";
import { createSecurityWorkbenchTools } from "../tools/security-workbench-tools.js";

export function registerSecurityWorkbenchRoutes(app: FastifyInstance, config: AppConfig, scheduler?: SchedulerService): void {
  app.get("/api/security/workbench", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    return getSecurityWorkbench().history(user.id);
  });
  app.post("/api/security/comparisons", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try {
      const body = request.body as {beforeRunId: string; afterRunId: string};
      return getSecurityWorkbench().compare(body.beforeRunId, body.afterRunId, user.id);
    } catch { return reply.status(404).send({error: "Comparison runs not found"}); }
  });
  app.get("/api/security/engines", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    return getSecurityWorkbench().engines();
  });
  app.post("/api/security/checks", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try { return reply.status(202).send(getSecurityWorkbench().start(request.body as SecurityCheckInput, user.id)); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "Invalid check" }); }
  });
  app.get<{Params: {id: string}}>("/api/security/checks/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try { return getSecurityWorkbench().get(request.params.id, user.id); }
    catch { return reply.status(404).send({ error: "Check not found" }); }
  });
  app.post<{Params: {id: string}}>("/api/security/checks/:id/cancel", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try { getSecurityWorkbench().cancel(request.params.id, user.id); return {ok: true}; }
    catch { return reply.status(404).send({error: "Check not found"}); }
  });
  app.get<{Params: {id: string}}>("/api/security/checks/:id/report", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try { return getSecurityWorkbench().report(request.params.id, user.id); }
    catch { return reply.status(404).send({error: "Check not found"}); }
  });
  app.delete<{Params: {id: string}}>("/api/security/checks/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try { getSecurityWorkbench().deleteRun(request.params.id, user.id); return {ok: true}; }
    catch (error) { return reply.status(400).send({error: error instanceof Error ? error.message : "Deletion failed"}); }
  });
  app.get<{Params: {id: string}}>("/api/security/findings/:id/plan", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try { return getSecurityWorkbench().plan(request.params.id, user.id); }
    catch { return reply.status(404).send({error: "Finding not found"}); }
  });
  app.post<{Params: {id: string}}>("/api/security/findings/:id/verify", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try { return await getSecurityWorkbench().verify(request.params.id, user.id); }
    catch (error) { return reply.status(400).send({error: error instanceof Error ? error.message : "Verification failed"}); }
  });
  app.post<{Params: {id: string}}>("/api/security/findings/:id/decision", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try {
      return getSecurityWorkbench().decide(request.params.id, user.id, (request.body as {disposition: "open" | "accepted-risk" | "false-positive"}).disposition);
    } catch { return reply.status(400).send({error: "Invalid finding or disposition"}); }
  });
  if (scheduler) app.post("/api/security/monitors", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    const tool = createSecurityWorkbenchTools(scheduler).find(tool => tool.name === "security.monitor.schedule")!;
    const result = await tool.execute(request.body, {
      sessionId: "security-monitor", actionId: request.id, projectRoot: process.cwd(), requestedBy: user.id, userId: user.id, executionNodeId: "gateway",
    });
    return reply.status(result.ok ? 200 : 400).send(result.ok ? result.data : {error: result.message});
  });
}
