import type { FastifyInstance } from "fastify";
import type { HookBus } from "../scheduler/hooks.js";

export function registerHookRoutes(app: FastifyInstance, deps: {
  hookSecret: string;
  hooks: HookBus;
  onWake: () => Promise<unknown>;
  onAgentHook: (payload: unknown) => Promise<unknown>;
}) {
  const isAuthorized = (token: string | undefined) => token === deps.hookSecret;

  app.post("/hooks/wake", async (request, reply) => {
    const token = request.headers["x-hook-token"];
    if (!isAuthorized(typeof token === "string" ? token : undefined)) {
      return reply.status(401).send({ error: "UNAUTHORIZED" });
    }

    deps.hooks.emit("hook.wake", { source: "webhook" });
    const result = await deps.onWake();
    return { ok: true, result };
  });

  app.post("/hooks/agent", async (request, reply) => {
    const token = request.headers["x-hook-token"];
    if (!isAuthorized(typeof token === "string" ? token : undefined)) {
      return reply.status(401).send({ error: "UNAUTHORIZED" });
    }

    deps.hooks.emit("hook.agent", request.body ?? {});
    const result = await deps.onAgentHook(request.body ?? {});
    return { ok: true, result };
  });
}
