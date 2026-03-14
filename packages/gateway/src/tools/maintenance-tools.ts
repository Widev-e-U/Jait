/**
 * maintenance.run tool — invoked by the scheduler to run self-test checks
 * on a repository and create fix plans when failures are found.
 *
 * Input: { repoId: string }
 * The tool runs all configured checks, persists results, and creates
 * a Plan with proposed tasks if anything fails. The user supervises
 * by reviewing and approving plan tasks before agent threads start.
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { MaintenanceService } from "../services/maintenance.js";
import type { NotificationService } from "../services/notifications.js";

export function createMaintenanceRunTool(
  maintenanceService: MaintenanceService,
  notifications?: NotificationService,
): ToolDefinition {
  return {
    name: "maintenance.run",
    description:
      "Run maintenance checks (typecheck, test, lint) on a repository. " +
      "Creates a fix plan with proposed tasks if any check fails. " +
      "If repoId is omitted, checks all accessible repositories.",
    tier: "standard",
    parameters: {
      type: "object",
      properties: {
        repoId: {
          type: "string",
          description: "ID of the repository to check. Omit to check all repos.",
        },
      },
    },
    execute: async (
      input: unknown,
      context: ToolContext,
    ): Promise<ToolResult> => {
      const { repoId } = (input as { repoId?: string }) ?? {};
      const jobId = context.actionId ?? `manual-${Date.now()}`;

      try {
        if (repoId) {
          const result = await maintenanceService.runForRepo(repoId, jobId);
          const summary = result.checks
            .map((c) => `${c.passed ? "✓" : "✗"} ${c.name} (${c.durationMs}ms)`)
            .join("\n");

          const msg = result.allPassed
            ? "All checks passed"
            : `${result.checks.filter((c) => !c.passed).length} check(s) failed — fix plan created`;

          if (notifications) {
            if (result.allPassed) {
              notifications.success("Maintenance passed", `All checks passed for ${result.repoName}`);
            } else {
              notifications.warning(
                "Maintenance: checks failed",
                `${result.checks.filter((c) => !c.passed).length} check(s) failed in ${result.repoName}`,
                result.planId ? `/plans/${result.planId}` : undefined,
              );
            }
          }

          return {
            ok: true,
            message: msg,
            data: { runId: result.id, planId: result.planId, summary },
          };
        }

        // Run all repos
        const results = await maintenanceService.runAll(jobId);
        if (results.length === 0) {
          return { ok: true, message: "No accessible repositories found" };
        }

        const summary = results.map((r) => {
          const checks = r.checks
            .map((c) => `  ${c.passed ? "✓" : "✗"} ${c.name}`)
            .join("\n");
          return `${r.allPassed ? "✓" : "✗"} ${r.repoName}\n${checks}`;
        }).join("\n\n");

        const failed = results.filter((r) => !r.allPassed);
        const msg = failed.length === 0
          ? `All ${results.length} repo(s) passed`
          : `${failed.length}/${results.length} repo(s) have failures — fix plans created`;

        if (notifications) {
          if (failed.length === 0) {
            notifications.success("Maintenance passed", msg);
          } else {
            notifications.warning("Maintenance: failures found", msg);
          }
        }

        return {
          ok: true,
          message: msg,
          data: {
            repos: results.map((r) => ({
              repoName: r.repoName,
              allPassed: r.allPassed,
              runId: r.id,
              planId: r.planId,
            })),
            summary,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: msg };
      }
    },
  };
}
