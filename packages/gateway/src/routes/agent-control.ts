/**
 * Agent control routes — the user-facing "stop all agents" switch.
 *
 *   GET  /api/agent-control          — current halt state
 *   POST /api/agent-control/halt     — freeze autonomous execution and stop runners
 *   POST /api/agent-control/resume   — lift the halt
 *
 * Kept in its own module (and separate from `/api/threads/*`) because the halt
 * must remain reachable when a thread route is what is misbehaving: an
 * emergency stop that shares a code path with the thing being stopped is not a
 * stop. These routes never consult the halt themselves — stopping and resuming
 * are exactly the two actions that must work while halted — so they are the
 * only write paths to the `agent_control` row.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { AuditWriter } from "../services/audit.js";
import type { AgentControlService } from "../services/agent-control.js";

const haltSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export function registerAgentControlRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: {
    agentControl: AgentControlService;
    audit?: AuditWriter;
  },
) {
  const { agentControl, audit } = deps;

  /** Read the halt without changing it (safe while halted). */
  app.get("/api/agent-control", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    return { state: agentControl.getState(authUser.id) };
  });

  /** Emergency stop: persist the halt first, then tear down running work. */
  app.post("/api/agent-control/halt", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const parsed = haltSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Invalid halt request" });

    const result = await agentControl.halt(authUser.id, { reason: parsed.data.reason ?? null });
    try {
      audit?.write({
        sessionId: undefined,
        actionId: `agent-halt:${authUser.id}:${result.state.updatedAt ?? Date.now()}`,
        actionType: "agent.control.halt",
        toolName: "agent_control",
        inputs: { reason: result.state.reason, stopped: result.stopped },
        outputs: { halted: result.state.halted, haltedAt: result.state.haltedAt, stopError: result.stopError },
        status: result.stopError ? "partial" : "success",
      });
    } catch { /* audit is best effort; the halt already landed */ }

    // The halt is the contract; a runner that refused to stop is reported so
    // the user can stop it by hand instead of assuming everything is frozen.
    return reply.status(200).send(result);
  });

  /** Lift the halt. The only path that clears a stop. */
  app.post("/api/agent-control/resume", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const state = agentControl.resume(authUser.id);
    try {
      audit?.write({
        sessionId: undefined,
        actionId: `agent-resume:${authUser.id}:${state.updatedAt ?? Date.now()}`,
        actionType: "agent.control.resume",
        toolName: "agent_control",
        outputs: { halted: state.halted },
        status: "success",
      });
    } catch { /* best effort */ }
    return { state };
  });
}
