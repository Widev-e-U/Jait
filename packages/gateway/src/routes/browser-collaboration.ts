import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type {
  BrowserCollaborationService,
  BrowserInterventionKind,
  BrowserSessionController,
  BrowserSessionMode,
  BrowserSessionOrigin,
  BrowserSessionStatus,
} from "../services/browser-collaboration.js";

interface BrowserCollaborationRouteDeps {
  browserCollaborationService: BrowserCollaborationService;
}

export function registerBrowserCollaborationRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: BrowserCollaborationRouteDeps,
): void {
  app.get("/api/browser/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    return { sessions: deps.browserCollaborationService.listSessions(authUser.id) };
  });

  app.post("/api/browser/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const session = deps.browserCollaborationService.createSession({
      name: typeof body.name === "string" ? body.name : null,
      workspaceRoot: typeof body.workspaceRoot === "string" ? body.workspaceRoot : null,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : null,
      previewUrl: typeof body.previewUrl === "string" ? body.previewUrl : null,
      previewSessionId: typeof body.previewSessionId === "string" ? body.previewSessionId : null,
      browserId: typeof body.browserId === "string" ? body.browserId : null,
      mode: body.mode === "isolated" ? "isolated" : "shared" as BrowserSessionMode,
      origin: (body.origin === "managed" || body.origin === "attached" || body.origin === "direct")
        ? body.origin as BrowserSessionOrigin
        : "direct",
      controller: (body.controller === "user" || body.controller === "observer")
        ? body.controller as BrowserSessionController
        : "agent",
      status: (body.status === "running" || body.status === "paused" || body.status === "intervention-required" || body.status === "closed")
        ? body.status as BrowserSessionStatus
        : "ready",
      secretSafe: Boolean(body.secretSafe),
      storageProfile: body.storageProfile && typeof body.storageProfile === "object"
        ? body.storageProfile as Record<string, unknown>
        : null,
      createdBy: authUser.id,
    });
    return { session };
  });

  app.post("/api/browser/sessions/:id/take-control", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = deps.browserCollaborationService.takeControl(id, authUser.id);
    if (!session) return reply.status(404).send({ error: "Browser session not found" });
    return { session };
  });

  app.post("/api/browser/sessions/:id/return-control", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = deps.browserCollaborationService.returnControl(id, authUser.id);
    if (!session) return reply.status(404).send({ error: "Browser session not found" });
    return { session };
  });

  app.post("/api/browser/sessions/:id/pause", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = deps.browserCollaborationService.pause(id, authUser.id);
    if (!session) return reply.status(404).send({ error: "Browser session not found" });
    return { session };
  });

  app.post("/api/browser/sessions/:id/resume", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = deps.browserCollaborationService.resume(id, authUser.id);
    if (!session) return reply.status(404).send({ error: "Browser session not found" });
    return { session };
  });

  app.post("/api/browser/sessions/:id/secret-safe/start", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = deps.browserCollaborationService.setSecretSafe(id, true, authUser.id);
    if (!session) return reply.status(404).send({ error: "Browser session not found" });
    return { session };
  });

  app.post("/api/browser/sessions/:id/secret-safe/stop", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const session = deps.browserCollaborationService.setSecretSafe(id, false, authUser.id);
    if (!session) return reply.status(404).send({ error: "Browser session not found" });
    return { session };
  });

  app.get("/api/browser/interventions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as { status?: string };
    const status = query.status === "resolved" || query.status === "cancelled" ? query.status : (query.status === "open" ? "open" : undefined);
    return { interventions: deps.browserCollaborationService.listInterventions(authUser.id, status) };
  });

  app.post("/api/browser/interventions", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const browserSessionId = typeof body.browserSessionId === "string" ? body.browserSessionId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    if (!browserSessionId || !reason || !instructions) {
      return reply.status(400).send({ error: "browserSessionId, reason, and instructions are required" });
    }
    const intervention = deps.browserCollaborationService.requestIntervention({
      browserSessionId,
      threadId: typeof body.threadId === "string" ? body.threadId : null,
      chatSessionId: typeof body.chatSessionId === "string" ? body.chatSessionId : null,
      kind: (typeof body.kind === "string" ? body.kind : "custom") as BrowserInterventionKind,
      reason,
      instructions,
      secretSafe: Boolean(body.secretSafe),
      allowUserNote: typeof body.allowUserNote === "boolean" ? body.allowUserNote : true,
      requestedBy: authUser.id,
    });
    return { intervention };
  });

  app.post("/api/browser/interventions/:id/resolve", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const intervention = deps.browserCollaborationService.resolveIntervention(
      id,
      authUser.id,
      typeof body.userNote === "string" ? body.userNote : null,
    );
    if (!intervention) return reply.status(404).send({ error: "Browser intervention not found" });
    return { intervention };
  });

  app.post("/api/browser/interventions/:id/cancel", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const intervention = deps.browserCollaborationService.cancelIntervention(id, authUser.id);
    if (!intervention) return reply.status(404).send({ error: "Browser intervention not found" });
    return { intervention };
  });
}
