import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { SecretInputService } from "../services/secret-input.js";
import type { UserSecretService } from "../services/user-secrets.js";

export function registerSecretRoutes(
  app: FastifyInstance,
  config: AppConfig,
  secretInput: SecretInputService,
  userSecrets?: UserSecretService,
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
    const pending = secretInput.listPending(undefined, authUser.id).find((item) => item.id === id);
    if (body.remember === true && pending?.rememberable && pending.secretType && pending.secretKey && userSecrets) {
      userSecrets.save({
        userId: authUser.id,
        type: pending.secretType,
        key: pending.secretKey,
        label: pending.rememberLabel || pending.prompt || pending.title,
        value,
      });
    }
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

  app.get("/api/secrets", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!userSecrets) return reply.status(503).send({ error: "Secret store is unavailable" });
    const query = request.query as Record<string, unknown>;
    const type = typeof query.type === "string" && query.type.trim() ? query.type.trim() : undefined;
    return { secrets: userSecrets.list(authUser.id, type) };
  });

  app.post("/api/secrets", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!userSecrets) return reply.status(503).send({ error: "Secret store is unavailable" });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type : "";
    const key = typeof body.key === "string" ? body.key : "";
    const label = typeof body.label === "string" ? body.label : "";
    const value = typeof body.value === "string" ? body.value : "";
    if (!type || !key || !label || !value) {
      return reply.status(400).send({ error: "type, key, label, and value are required" });
    }
    const secret = userSecrets.save({ userId: authUser.id, type, key, label, value });
    return reply.status(201).send({ secret });
  });

  app.delete<{ Params: { id: string } }>("/api/secrets/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    if (!userSecrets) return reply.status(503).send({ error: "Secret store is unavailable" });
    const ok = userSecrets.delete(request.params.id, authUser.id);
    if (!ok) return reply.status(404).send({ error: "Secret not found" });
    return { ok: true };
  });
}
