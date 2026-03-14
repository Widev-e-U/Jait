/**
 * MaintenanceService — supervised self-test and self-fix pipeline.
 *
 * Flow:
 *   1. Cron triggers a maintenance run for a repo
 *   2. Runs configured checks (typecheck, test, lint) via shell
 *   3. Parses failures from output
 *   4. If failures found → creates a Plan with proposed fix tasks
 *   5. Broadcasts results via WS so the user can supervise
 *   6. Tasks stay "proposed" until the user approves & starts them
 *
 * The user stays in the loop: they see every run, every failure, and
 * every proposed fix before any agent thread touches code.
 */

import { eq, desc } from "drizzle-orm";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { JaitDB } from "../db/connection.js";
import { scheduledJobRuns } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { PlanService, PlanTask } from "./plans.js";
import { newTaskId } from "./plans.js";
import type { RepositoryService, RepoRow } from "./repositories.js";

// ── Types ────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface MaintenanceRunResult {
  id: string;
  jobId: string;
  repoId: string;
  repoName: string;
  checks: CheckResult[];
  allPassed: boolean;
  planId?: string;
  startedAt: string;
  completedAt: string;
}

export interface MaintenanceConfig {
  /** Shell commands to run, in order. Each must exit 0 to pass. */
  checks: Array<{ name: string; command: string }>;
  /** Max ms per check before it's killed. Default 120s. */
  timeoutMs?: number;
  /** Provider to suggest for fix threads. Default "codex". */
  preferredProvider?: string;
}

const DEFAULT_CHECKS: MaintenanceConfig["checks"] = [
  { name: "Typecheck", command: "bun run typecheck" },
  { name: "Tests", command: "bun run test" },
  { name: "Lint", command: "bun run lint" },
];

const DEFAULT_TIMEOUT_MS = 120_000;

// ── Service ──────────────────────────────────────────────────────────

export class MaintenanceService {
  constructor(
    private db: JaitDB,
    private planService: PlanService,
    private repoService: RepositoryService,
  ) {}

  /**
   * Run maintenance checks for ALL accessible repositories.
   * Skips repos whose paths don't exist locally.
   */
  async runAll(
    jobId: string,
    config?: Partial<MaintenanceConfig>,
  ): Promise<MaintenanceRunResult[]> {
    const repos = this.repoService.list();
    const results: MaintenanceRunResult[] = [];
    for (const repo of repos) {
      if (!existsSync(repo.localPath)) continue;
      try {
        const result = await this.runForRepo(repo.id, jobId, config);
        results.push(result);
      } catch (err) {
        console.error(`Maintenance failed for ${repo.name}:`, err);
      }
    }
    return results;
  }

  /**
   * Run maintenance checks for a specific repository.
   * Returns structured results; creates a fix plan if anything failed.
   */
  async runForRepo(
    repoId: string,
    jobId: string,
    config?: Partial<MaintenanceConfig>,
  ): Promise<MaintenanceRunResult> {
    const repo = this.repoService.getById(repoId);
    if (!repo) throw new Error(`Repository not found: ${repoId}`);
    if (!existsSync(repo.localPath)) {
      throw new Error(`Repository path not accessible: ${repo.localPath}`);
    }

    const checks = config?.checks ?? DEFAULT_CHECKS;
    const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const runId = uuidv7();
    const startedAt = new Date().toISOString();

    // Persist run as "running"
    this.db.insert(scheduledJobRuns).values({
      id: runId,
      jobId,
      status: "running",
      triggeredBy: "maintenance",
      startedAt,
    }).run();

    const results: CheckResult[] = [];

    for (const check of checks) {
      const checkStart = Date.now();
      let output = "";
      let passed = false;

      try {
        output = execSync(check.command, {
          cwd: repo.localPath,
          timeout: timeoutMs,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 1024 * 1024, // 1MB
          env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
        });
        passed = true;
      } catch (err: unknown) {
        if (err && typeof err === "object" && "stdout" in err) {
          const execErr = err as { stdout?: string; stderr?: string; status?: number };
          output = [execErr.stdout ?? "", execErr.stderr ?? ""].filter(Boolean).join("\n");
        } else {
          output = err instanceof Error ? err.message : String(err);
        }
        passed = false;
      }

      results.push({
        name: check.name,
        command: check.command,
        passed,
        output: output.slice(0, 50_000), // cap stored output
        durationMs: Date.now() - checkStart,
      });
    }

    const allPassed = results.every((r) => r.passed);
    const completedAt = new Date().toISOString();

    // Create fix plan if there were failures
    let planId: string | undefined;
    if (!allPassed) {
      planId = this.createFixPlan(repo, results, config?.preferredProvider);
    }

    // Persist run result
    const outputSummary = results
      .map((r) => `${r.passed ? "✓" : "✗"} ${r.name} (${r.durationMs}ms)`)
      .join("\n");
    const errorSummary = results
      .filter((r) => !r.passed)
      .map((r) => `${r.name}: ${r.output.slice(0, 2000)}`)
      .join("\n---\n");

    this.db.update(scheduledJobRuns).set({
      status: allPassed ? "completed" : "failed",
      output: outputSummary,
      error: allPassed ? null : errorSummary.slice(0, 50_000),
      planId: planId ?? null,
      completedAt,
    }).where(eq(scheduledJobRuns.id, runId)).run();

    return {
      id: runId,
      jobId,
      repoId: repo.id,
      repoName: repo.name,
      checks: results,
      allPassed,
      planId,
      startedAt,
      completedAt,
    };
  }

  /** Get recent runs, optionally filtered by jobId. */
  listRuns(jobId?: string, limit = 50): Array<typeof scheduledJobRuns.$inferSelect> {
    if (jobId) {
      return this.db
        .select()
        .from(scheduledJobRuns)
        .where(eq(scheduledJobRuns.jobId, jobId))
        .orderBy(desc(scheduledJobRuns.startedAt))
        .limit(limit)
        .all();
    }
    return this.db
      .select()
      .from(scheduledJobRuns)
      .orderBy(desc(scheduledJobRuns.startedAt))
      .limit(limit)
      .all();
  }

  /** Get a single run by ID. */
  getRun(id: string) {
    return this.db
      .select()
      .from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.id, id))
      .get();
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Parse check failures and create a Plan with proposed fix tasks.
   * Tasks are left as "proposed" — the user must approve before they run.
   */
  private createFixPlan(
    repo: RepoRow,
    results: CheckResult[],
    _preferredProvider?: string,
  ): string {
    const failures = results.filter((r) => !r.passed);
    const tasks: PlanTask[] = failures.map((failure) => ({
      id: newTaskId(),
      title: `Fix ${failure.name} failures`,
      description: [
        `The \`${failure.command}\` check failed. Fix the errors below.`,
        "",
        "```",
        failure.output.slice(0, 8000),
        "```",
        "",
        "Run the same command again after fixing to verify.",
      ].join("\n"),
      status: "proposed" as const,
    }));

    const plan = this.planService.create({
      repoId: repo.id,
      title: `Maintenance: ${failures.length} check(s) failed — ${new Date().toLocaleDateString()}`,
      tasks,
    });

    return plan.id;
  }
}
