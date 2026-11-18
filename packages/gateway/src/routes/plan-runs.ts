import type { FastifyInstance, FastifyReply } from "fastify";
import { ORCHESTRATION_LIMITS } from "@jait/shared";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import { AgentHaltedError } from "../services/agent-control.js";
import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationValidationError,
  type InspectionDecision,
  type OrchestrationService,
} from "../services/orchestration/orchestrator.js";

type RunParams = { runId: string };

function respond(reply: FastifyReply, operation: () => object, success = 200) {
  try {
    return reply.code(success).send(operation());
  } catch (error) {
    if (error instanceof OrchestrationNotFoundError) {
      return reply.code(404).send({ error: error.message });
    }
    if (error instanceof OrchestrationValidationError) {
      return reply.code(400).send({ error: error.message, issues: error.issues });
    }
    if (error instanceof OrchestrationConflictError || error instanceof AgentHaltedError) {
      return reply.code(409).send({ error: error.message });
    }
    throw error;
  }
}

export function registerPlanRunRoutes(app: FastifyInstance, config: AppConfig, orchestration: OrchestrationService): void {
  app.post<{ Params: { id: string }; Body: { maxWorkers?: number } }>("/api/plans/:id/runs", {
    schema: {
      body: {
        type: "object",
        properties: {
          maxWorkers: { type: "integer", minimum: ORCHESTRATION_LIMITS.minWorkers, maximum: ORCHESTRATION_LIMITS.maxWorkers },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    return respond(reply, () => ({ run: orchestration.createRun(user.id, {
      planId: request.params.id,
      maxWorkers: request.body.maxWorkers,
    }) }), 201);
  });

  app.get<{ Params: RunParams }>("/api/plan-runs/:runId", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    return respond(reply, () => ({ run: orchestration.getRun(user.id, request.params.runId) }));
  });

  app.get<{ Params: RunParams & { taskId: string } }>("/api/plan-runs/:runId/tasks/:taskId/attempts", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const { runId, taskId } = request.params;
    return respond(reply, () => ({ attempts: orchestration.getTaskAttempts(user.id, runId, taskId) }));
  });

  app.post<{ Params: RunParams }>("/api/plan-runs/:runId/cancel", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    return respond(reply, () => ({ run: orchestration.cancelRun(user.id, request.params.runId) }));
  });

  app.post<{ Params: RunParams; Body: { decisions?: InspectionDecision[] } }>("/api/plan-runs/:runId/resume", {
    schema: {
      body: {
        type: "object",
        properties: {
          decisions: {
            type: "array",
            maxItems: ORCHESTRATION_LIMITS.maxTasks,
            items: {
              type: "object",
              properties: {
                taskId: { type: "string", minLength: 1 },
                decision: { type: "string", enum: ["retry", "fail"] },
                note: { type: "string", minLength: 1, maxLength: 500 },
              },
              required: ["taskId", "decision", "note"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    return respond(reply, () => ({ run: orchestration.resumeRun(user.id, request.params.runId, request.body.decisions) }));
  });
}
