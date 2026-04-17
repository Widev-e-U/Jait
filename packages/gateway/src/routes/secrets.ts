import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { SecretInputService } from "../services/secret-input.js";

export function registerSecretRoutes(
  app: FastifyInstance,
  config: AppConfig,
  secretInput: SecretInputService,
): void {
  app.get("/api/secrets/requests", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as { sessionId?: string };
    return {
      requests: secretInput.listPending(
        typeof query.sessionId === "string" ? query.sessionId : undefined,
        authUser.id,
      ),
    };
  });

  app.post("/api/secrets/requests/:id/submit", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const value = typeof body.value === "string" ? body.value : "";
    if (!value) return reply.status(400).send({ error: "Secret value is required" });
    const ok = secretInput.submit(id, value, authUser.id);
    if (!ok) return reply.status(404).send({ error: "Secret request not found" });
    return { ok: true };
  });

  app.post("/api/secrets/requests/:id/cancel", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const ok = secretInput.cancel(id, authUser.id);
    if (!ok) return reply.status(404).send({ error: "Secret request not found" });
    return { ok: true };
  });
}
