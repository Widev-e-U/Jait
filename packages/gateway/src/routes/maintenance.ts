/**
 * Maintenance REST routes — supervision endpoints.
 *
 *   GET    /api/maintenance/runs          — list recent maintenance runs
 *   GET    /api/maintenance/runs/:id      — get a specific run
 *   POST   /api/maintenance/run           — manually trigger a maintenance run
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { MaintenanceService } from "../services/maintenance.js";
import type { NotificationService } from "../services/notifications.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import type { WsEventType } from "@jait/shared";

export interface MaintenanceRouteDeps {
  maintenanceService: MaintenanceService;
  notifications?: NotificationService;
  ws?: WsControlPlane;
}

export function registerMaintenanceRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: MaintenanceRouteDeps,
): void {
  const { maintenanceService, notifications, ws } = deps;

  /** List recent maintenance runs */
  app.get("/api/maintenance/runs", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const query = (request.query as Record<string, unknown>) ?? {};
    const jobId = typeof query["jobId"] === "string" ? query["jobId"] : undefined;
    const limit = Math.min(200, Math.max(1, Number(query["limit"]) || 50));

    const runs = maintenanceService.listRuns(jobId, limit);
    return { runs };
  });

  /** Get a specific maintenance run */
  app.get("/api/maintenance/runs/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const { id } = request.params as { id: string };
    const run = maintenanceService.getRun(id);
    if (!run) return reply.status(404).send({ error: "Run not found" });
    return { run };
  });

  /** Manually trigger a maintenance run */
  app.post("/api/maintenance/run", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = (request.body as Record<string, unknown>) ?? {};
    const repoId = typeof body["repoId"] === "string" ? body["repoId"] : "";
    if (!repoId) {
      return reply.status(400).send({ error: "repoId is required" });
    }

    try {
      const result = await maintenanceService.runForRepo(
        repoId,
        `manual-${Date.now()}`,
      );

      // Broadcast so the UI updates in real-time
      if (ws) {
        ws.broadcastAll({
          type: "plan.created" as WsEventType,
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: {
            maintenance: true,
            run: {
              id: result.id,
              repoName: result.repoName,
              allPassed: result.allPassed,
              planId: result.planId,
              checks: result.checks.map((c) => ({
                name: c.name,
                passed: c.passed,
                durationMs: c.durationMs,
              })),
            },
          },
        });
      }

      // Send cross-platform notification
      if (notifications) {
        const failCount = result.checks.filter((c) => !c.passed).length;
        if (result.allPassed) {
          notifications.success(
            "Maintenance passed",
            `All checks passed for ${result.repoName}`,
          );
        } else {
          notifications.warning(
            "Maintenance: checks failed",
            `${failCount} check(s) failed in ${result.repoName} — fix plan created`,
            result.planId ? `/plans/${result.planId}` : undefined,
          );
        }
      }

      return {
        run: result,
        message: result.allPassed
          ? "All checks passed"
          : `${result.checks.filter((c) => !c.passed).length} check(s) failed — review the plan`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });
}
