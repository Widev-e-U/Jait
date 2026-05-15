import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { UserQuestionAnswer, UserQuestionService } from "../services/user-questions.js";

function normalizeAnswers(value: unknown): Record<string, UserQuestionAnswer> | null {
  if (!value || typeof value !== "object") return null;
  const out: Record<string, UserQuestionAnswer> = {};
  for (const [key, rawAnswer] of Object.entries(value as Record<string, unknown>)) {
    if (!rawAnswer || typeof rawAnswer !== "object") continue;
    const answer = rawAnswer as Record<string, unknown>;
    out[key] = {
      selected: Array.isArray(answer.selected)
        ? answer.selected.filter((item): item is string => typeof item === "string")
        : [],
      freeText: typeof answer.freeText === "string" && answer.freeText.trim() ? answer.freeText : null,
      skipped: answer.skipped === true,
    };
  }
  return out;
}

export function registerUserQuestionRoutes(
  app: FastifyInstance,
  config: AppConfig,
  userQuestions: UserQuestionService,
): void {
  app.get("/api/user-questions/requests", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as { sessionId?: string };
    return {
      requests: userQuestions.listPending(
        typeof query.sessionId === "string" ? query.sessionId : undefined,
        authUser.id,
      ),
    };
  });

  app.post("/api/user-questions/requests/:id/submit", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const answers = normalizeAnswers(body.answers);
    if (!answers) return reply.status(400).send({ error: "answers object is required" });
    const ok = userQuestions.submit(id, { answers }, authUser.id);
    if (!ok) return reply.status(404).send({ error: "Question request not found" });
    return { ok: true };
  });

  app.post("/api/user-questions/requests/:id/cancel", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const ok = userQuestions.cancel(id, authUser.id);
    if (!ok) return reply.status(404).send({ error: "Question request not found" });
    return { ok: true };
  });
}
