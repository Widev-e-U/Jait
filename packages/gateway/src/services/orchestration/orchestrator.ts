/**
 * Orchestration service: starts plan runs, dispatches ready tasks within worker
 * limits, runs attempts through the injected executor and verifier, and applies
 * every outcome through fenced store writes. Attempts left unfinished by a
 * restart become `interrupted` and wait for an operator decision; nothing
 * re-runs them on its own.
 */
import { ORCHESTRATION_LIMITS } from "@jait/shared";
import type {
  AgentTaskReport,
  OrchestrationRunView,
  OrchestrationTaskState,
  OrchestrationTaskView,
  VerificationCheck,
  VerificationGate,
  VerificationOutcome,
} from "@jait/shared/types";
import { eq } from "drizzle-orm";
import type { JaitDB } from "../../db/connection.js";
import { automationPlans } from "../../db/schema.js";
import { uuidv7 } from "../../db/uuidv7.js";
import { AgentHaltedError } from "../agent-control.js";
import { boundText, parseAgentTaskReport, redactSecrets } from "./agent-report.js";
import { type NormalizedPlanTask, type PlanGraphIssue, validatePlanGraph } from "./dag.js";
import type { ResourceClaims } from "./resources.js";
import { computeDependencyChanges, type SchedulableTask, selectDispatch } from "./scheduler.js";
import { type AttemptOutcome, type NewTask, OrchestrationStore, type RunRow, type TaskRow } from "./store.js";

export interface TaskExecutionInput {
  runId: string;
  taskId: string;
  attemptId: string;
  attemptNo: number;
  userId: string;
  title: string;
  description: string;
  claims: ResourceClaims;
  /** Success criteria. The agent can read them; only the orchestrator runs them. */
  verification: VerificationGate[];
  /** Validated results of the passed dependencies. */
  dependencyResults: Array<{
    taskId: string;
    summary: string;
    changedFiles: string[];
    artifacts: AgentTaskReport["artifacts"];
  }>;
  /** Failure context from the previous attempt, for repair attempts. */
  previousAttempt: { error: string; verification: VerificationOutcome[] | null } | null;
  timeoutSeconds: number;
  signal: AbortSignal;
}

export interface TaskExecutor {
  /** Runs one attempt. Resolve with the agent's raw report; it is validated before use. */
  execute(input: TaskExecutionInput): Promise<unknown>;
}

export interface VerificationRunInput {
  check: VerificationCheck;
  runId: string;
  taskId: string;
  attemptId: string;
  signal: AbortSignal;
}

export interface VerificationRunner {
  run(input: VerificationRunInput): Promise<{ passed: boolean; detail: string }>;
}

/** Fail-closed default: without a configured runner, no gate can pass. */
export const refusingVerificationRunner: VerificationRunner = {
  async run() {
    return { passed: false, detail: "no verification runner is configured, so gates cannot pass" };
  },
};

export interface OrchestrationServiceOptions {
  db: JaitDB;
  executor: TaskExecutor;
  verifier?: VerificationRunner;
  /** Owner halt state; normally AgentControlService.isHalted. */
  isHalted?: (userId: string) => boolean;
  /** Process-wide cap on concurrent attempts across all runs. */
  globalMaxWorkers?: number;
  /** Cap on concurrent attempts per owner. */
  perUserMaxWorkers?: number;
  now?: () => Date;
}

export interface CreateRunInput {
  planId?: string;
  title?: string;
  /** Ad-hoc tasks, used when no planId is given. Validated like plan tasks. */
  tasks?: unknown;
  maxWorkers?: number;
}

export interface InspectionDecision {
  taskId: string;
  decision: "retry" | "fail";
  /** What was inspected in the workspace before deciding. Required, 1-500 characters. */
  note: string;
}

export class OrchestrationValidationError extends Error {
  constructor(readonly issues: readonly PlanGraphIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "OrchestrationValidationError";
  }
}

export class OrchestrationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestrationNotFoundError";
  }
}

export class OrchestrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestrationConflictError";
  }
}

interface RunDefinition {
  order: string[];
  tasks: NormalizedPlanTask[];
}

interface ActiveAttempt {
  attemptId: string;
  runId: string;
  taskId: string;
  userId: string;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
}

const MANUAL_RETRY_BUDGET = 1; // one operator retry beyond maxAttempts
const MAX_NOTE = 500;
const MAX_ERROR = 2000;
const MAX_DETAIL = 2000;
const DEFAULT_GLOBAL_WORKERS = 4;
const DEFAULT_USER_WORKERS = 4;
const TIMEOUT_REASON = "attempt timed out; outcome unknown, not retried automatically";
const HALT_REASON = "stopped by agent halt; outcome unknown, not retried automatically";
const RESTART_REASON = "gateway restarted before the attempt finished; outcome unknown, not retried automatically";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseDefinition(raw: string): RunDefinition {
  return JSON.parse(raw) as RunDefinition;
}

function parseStored<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readWorkers(raw: number | undefined): number {
  if (raw === undefined) return ORCHESTRATION_LIMITS.defaultWorkers;
  if (!Number.isInteger(raw) || raw < ORCHESTRATION_LIMITS.minWorkers || raw > ORCHESTRATION_LIMITS.maxWorkers) {
    throw new OrchestrationValidationError([
      {
        code: "invalid_workers",
        taskId: null,
        message: `maxWorkers must be an integer from ${ORCHESTRATION_LIMITS.minWorkers} to ${ORCHESTRATION_LIMITS.maxWorkers}`,
      },
    ]);
  }
  return raw;
}

export class OrchestrationService {
  private readonly store: OrchestrationStore;
  private readonly active = new Map<string, ActiveAttempt>();
  private readonly inflight = new Set<Promise<void>>();
  private readonly verifier: VerificationRunner;
  private readonly isHalted: (userId: string) => boolean;
  private readonly globalMaxWorkers: number;
  private readonly perUserMaxWorkers: number;
  private readonly clock: () => Date;

  constructor(private readonly options: OrchestrationServiceOptions) {
    this.store = new OrchestrationStore(options.db);
    this.verifier = options.verifier ?? refusingVerificationRunner;
    this.isHalted = options.isHalted ?? (() => false);
    this.globalMaxWorkers = options.globalMaxWorkers ?? DEFAULT_GLOBAL_WORKERS;
    this.perUserMaxWorkers = options.perUserMaxWorkers ?? DEFAULT_USER_WORKERS;
    this.clock = options.now ?? (() => new Date());
  }

  // ── Public operations ──────────────────────────────────────────────

  createRun(userId: string, input: CreateRunInput): OrchestrationRunView {
    this.assertNotHalted(userId);
    const source = this.resolveSource(userId, input);
    const graph = validatePlanGraph(source.tasks);
    if (!graph.ok) throw new OrchestrationValidationError(graph.issues);
    const maxWorkers = readWorkers(input.maxWorkers);
    const runId = uuidv7();
    const definition: RunDefinition = { order: graph.order, tasks: graph.tasks };
    this.store.insertRun(
      {
        id: runId,
        planId: source.planId,
        userId,
        repoId: source.repoId,
        title: source.title,
        maxWorkers,
        definition: JSON.stringify(definition),
        createdAt: this.nowIso(),
      },
      graph.tasks.map((task): NewTask => ({ taskId: task.id, state: task.dependsOn.length === 0 ? "ready" : "pending" })),
    );
    this.pump(runId);
    return this.toView(this.requireRunRow(userId, runId));
  }

  getRun(userId: string, runId: string): OrchestrationRunView {
    return this.toView(this.requireRunRow(userId, runId));
  }

  listRuns(userId: string): OrchestrationRunView[] {
    return this.store.listRunsForUser(userId).map((run) => this.toView(run));
  }

  /**
   * Operator resume. Every interrupted task needs a retry or fail decision made
   * after inspecting the workspace; nothing restarts without one.
   */
  resumeRun(userId: string, runId: string, decisions: readonly InspectionDecision[] = []): OrchestrationRunView {
    const run = this.requireRunRow(userId, runId);
    this.assertNotHalted(userId);
    if (run.status !== "running" && run.status !== "interrupted") {
      throw new OrchestrationConflictError(`run is ${run.status}; there is nothing to resume`);
    }
    const defs = new Map(parseDefinition(run.definition).tasks.map((task) => [task.id, task] as const));
    const rows = new Map(this.store.getTasks(runId).map((row) => [row.taskId, row] as const));
    const inFlight = this.inFlightTaskIds(runId);
    const byTask = new Map<string, InspectionDecision>();
    for (const decision of decisions) {
      const note = decision.note.trim();
      if (byTask.has(decision.taskId)) throw new OrchestrationConflictError(`duplicate decision for task "${decision.taskId}"`);
      if (decision.decision !== "retry" && decision.decision !== "fail") {
        throw new OrchestrationConflictError(`decision for "${decision.taskId}" must be retry or fail`);
      }
      if (!note || note.length > MAX_NOTE) {
        throw new OrchestrationConflictError(`inspection note for "${decision.taskId}" must be 1-${MAX_NOTE} characters`);
      }
      const row = rows.get(decision.taskId);
      if (!row || row.state !== "interrupted") {
        throw new OrchestrationConflictError(`task "${decision.taskId}" is not interrupted`);
      }
      const maxAttempts = defs.get(decision.taskId)?.maxAttempts ?? 0;
      if (decision.decision === "retry" && row.attemptCount >= maxAttempts + MANUAL_RETRY_BUDGET) {
        throw new OrchestrationConflictError(`task "${decision.taskId}" has no attempts left; decide fail instead`);
      }
      byTask.set(decision.taskId, decision);
    }
    for (const row of rows.values()) {
      if (row.state !== "interrupted") continue;
      if (!byTask.has(row.taskId)) {
        throw new OrchestrationConflictError(
          `task "${row.taskId}" was interrupted; inspect it and record a retry or fail decision`,
        );
      }
      if (inFlight.has(row.taskId)) {
        throw new OrchestrationConflictError(`task "${row.taskId}" is still shutting down its previous attempt`);
      }
    }
    const now = this.nowIso();
    for (const decision of byTask.values()) {
      const retry = decision.decision === "retry";
      this.store.setTaskState({
        runId,
        taskId: decision.taskId,
        from: ["interrupted"],
        to: retry ? "ready" : "failed",
        error: `${retry ? "resumed" : "failed"} after inspection: ${decision.note.trim()}`,
        now,
      });
    }
    this.store.setPaused(runId, false, now);
    this.pump(runId);
    return this.toView(this.requireRunRow(userId, runId));
  }

  /** Operator retry of one failed task, within the one-extra-attempt budget. */
  retryTask(userId: string, runId: string, taskId: string): OrchestrationRunView {
    const run = this.requireRunRow(userId, runId);
    this.assertNotHalted(userId);
    if (run.paused) throw new OrchestrationConflictError("resume the run before retrying a task");
    if (run.status !== "running" && run.status !== "failed") {
      throw new OrchestrationConflictError(`run is ${run.status}; tasks can only be retried in a run without interruptions`);
    }
    const row = this.store.getTask(runId, taskId);
    if (!row) throw new OrchestrationNotFoundError("task not found");
    if (row.state !== "failed") throw new OrchestrationConflictError(`task is ${row.state}; only failed tasks can be retried`);
    const def = parseDefinition(run.definition).tasks.find((task) => task.id === taskId);
    if (!def || row.attemptCount >= def.maxAttempts + MANUAL_RETRY_BUDGET) {
      throw new OrchestrationConflictError(`task "${taskId}" has used its attempt budget`);
    }
    if (!this.store.setTaskState({ runId, taskId, from: ["failed"], to: "ready", now: this.nowIso() })) {
      throw new OrchestrationConflictError("task changed while retrying; reload and try again");
    }
    this.pump(runId);
    return this.toView(this.requireRunRow(userId, runId));
  }

  cancelRun(userId: string, runId: string, reason = "cancelled by operator"): OrchestrationRunView {
    this.requireRunRow(userId, runId);
    const result = this.store.cancelRun({ runId, reason, now: this.nowIso() });
    const run = this.requireRunRow(userId, runId);
    if (!result.cancelled && run.status !== "cancelled") {
      throw new OrchestrationConflictError(`run is ${run.status} and cannot be cancelled`);
    }
    for (const attemptId of result.activeAttemptIds) {
      this.active.get(attemptId)?.controller.abort(new Error("cancelled"));
    }
    return this.toView(run);
  }

  /** Owner halt: running attempts stop as interrupted and the owner's runs pause until resumed. */
  stopForUser(userId: string): { stopped: number; errors: string[] } {
    let stopped = 0;
    for (const attempt of this.active.values()) {
      if (attempt.userId !== userId) continue;
      if (this.abortAttempt(attempt, "halted")) stopped += 1;
    }
    this.store.pauseRunsForUser(userId, this.nowIso());
    return { stopped, errors: [] };
  }

  /**
   * Call once at process start, before any dispatch. Unknown outcomes become
   * interrupted and every unfinished run pauses until an operator resumes it.
   */
  recoverAfterRestart(): number {
    if (this.active.size > 0) throw new OrchestrationConflictError("recovery must run before any attempt is started");
    const now = this.nowIso();
    const recovered = this.store.recoverActiveAttempts({ reason: RESTART_REASON, now });
    this.store.pauseNonFinalRuns(now);
    return recovered.length;
  }

  /** Resolves once no attempt is in flight. Intended for tests and shutdown. */
  async settle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled(this.inflight);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  // ── Dispatch ───────────────────────────────────────────────────────

  private pump(runId: string): void {
    const run = this.store.getRun(runId);
    if (!run || run.status !== "running" || run.paused) return;
    const definition = parseDefinition(run.definition);
    const defs = new Map(definition.tasks.map((task) => [task.id, task] as const));
    const order = new Map(definition.order.map((id, index) => [id, index] as const));

    const rows = this.store.getTasks(runId);
    const changes = computeDependencyChanges(
      rows.map((row) => ({
        taskId: row.taskId,
        state: row.state as OrchestrationTaskState,
        dependsOn: defs.get(row.taskId)?.dependsOn ?? [],
      })),
      definition.order,
    );
    for (const change of changes) {
      this.store.setTaskState({ runId, taskId: change.taskId, from: [change.from], to: change.to, now: this.nowIso() });
    }

    const current = changes.length > 0 ? this.store.getTasks(runId) : rows;
    const inFlight = this.inFlightTaskIds(runId);
    const tasks: SchedulableTask[] = [];
    for (const row of current) {
      const def = defs.get(row.taskId);
      if (!def) continue;
      tasks.push({
        taskId: row.taskId,
        state: row.state as OrchestrationTaskState,
        order: order.get(row.taskId) ?? 0,
        priority: def.priority,
        claims: def.claims,
        inFlight: inFlight.has(row.taskId),
      });
    }
    const externalCapacity = Math.min(
      this.globalMaxWorkers - this.active.size,
      this.perUserMaxWorkers - this.activeCountForUser(run.userId),
    );
    const decision = selectDispatch({
      tasks,
      maxWorkers: run.maxWorkers,
      halted: this.isHalted(run.userId),
      externalCapacity,
    });
    for (const taskId of decision.start) {
      const def = defs.get(taskId);
      if (def) this.startAttempt(runId, run.userId, def);
    }
  }

  /** Freed capacity may unblock any run, so every dispatchable run is pumped. */
  private schedulePumpAll(): void {
    queueMicrotask(() => {
      for (const runId of this.store.listDispatchableRunIds()) {
        try {
          this.pump(runId);
        } catch (error) {
          this.store.setRunError(runId, boundText(errorMessage(error), MAX_ERROR), this.nowIso());
        }
      }
    });
  }

  private startAttempt(runId: string, userId: string, def: NormalizedPlanTask): void {
    const attemptId = uuidv7();
    if (!this.store.claimTask({ runId, taskId: def.id, attemptId, now: this.nowIso() })) return;
    const attempt: ActiveAttempt = {
      attemptId,
      runId,
      taskId: def.id,
      userId,
      controller: new AbortController(),
      timer: null,
    };
    this.active.set(attemptId, attempt);
    attempt.timer = setTimeout(() => this.abortAttempt(attempt, "timeout"), def.timeoutSeconds * 1000);
    const work: Promise<void> = this.runAttempt(attempt, def)
      .catch((error: unknown) => {
        this.finish(attempt, {
          to: "interrupted",
          outcome: "interrupted",
          error: boundText(`internal error: ${errorMessage(error)}; outcome unknown`, MAX_ERROR),
        });
      })
      .finally(() => {
        if (attempt.timer) clearTimeout(attempt.timer);
        this.active.delete(attemptId);
        this.inflight.delete(work);
        this.schedulePumpAll();
      })
      .catch(() => undefined);
    this.inflight.add(work);
  }

  // ── Attempt lifecycle ──────────────────────────────────────────────

  private async runAttempt(attempt: ActiveAttempt, def: NormalizedPlanTask): Promise<void> {
    let raw: unknown;
    try {
      raw = await this.options.executor.execute(this.buildInput(attempt, def));
    } catch (error) {
      if (!attempt.controller.signal.aborted) {
        this.finish(attempt, {
          to: "interrupted",
          outcome: "interrupted",
          error: boundText(`executor failed: ${errorMessage(error)}; outcome unknown`, MAX_ERROR),
        });
      }
      return;
    }
    if (attempt.controller.signal.aborted) return;
    await this.handleReport(attempt, def, raw);
  }

  private async handleReport(attempt: ActiveAttempt, def: NormalizedPlanTask, raw: unknown): Promise<void> {
    const parsed = parseAgentTaskReport(raw, { taskId: attempt.taskId, attemptId: attempt.attemptId });
    if (!parsed.ok) {
      this.failAttempt(attempt, def, `invalid agent report: ${parsed.reason}`, null, null);
      return;
    }
    const report = parsed.report;
    if (report.status === "failed") {
      this.failAttempt(attempt, def, report.error ?? "agent reported failure", report, null);
      return;
    }
    if (report.status === "blocked") {
      // A reported blocker needs a human; it is not retried automatically.
      this.finish(attempt, {
        to: "failed",
        outcome: "failed",
        error: boundText(`agent reported blocked: ${report.error ?? ""}`, MAX_ERROR),
        result: report,
      });
      return;
    }

    // A completed report only starts verification. It never passes the task by itself.
    if (!this.store.markVerifying({
      runId: attempt.runId,
      taskId: attempt.taskId,
      attemptId: attempt.attemptId,
      result: report,
      now: this.nowIso(),
    })) {
      return;
    }
    const outcomes: VerificationOutcome[] = [];
    for (const gate of def.verification) {
      const verdict = await this.runGate(attempt, gate);
      if (attempt.controller.signal.aborted) return;
      outcomes.push({
        gateId: gate.id,
        label: gate.label,
        required: gate.required !== false,
        passed: verdict.passed,
        detail: verdict.detail,
      });
    }
    const failedRequired = outcomes.filter((outcome) => outcome.required && !outcome.passed);
    if (failedRequired.length === 0) {
      this.finish(attempt, { to: "passed", outcome: "passed", error: null, result: report, verification: outcomes });
      return;
    }
    this.failAttempt(
      attempt,
      def,
      `verification failed: ${failedRequired.map((outcome) => outcome.label).join("; ")}`,
      report,
      outcomes,
    );
  }

  private async runGate(attempt: ActiveAttempt, gate: VerificationGate): Promise<{ passed: boolean; detail: string }> {
    try {
      const verdict = await this.verifier.run({
        check: gate.check,
        runId: attempt.runId,
        taskId: attempt.taskId,
        attemptId: attempt.attemptId,
        signal: attempt.controller.signal,
      });
      return { passed: verdict.passed === true, detail: boundText(redactSecrets(String(verdict.detail)), MAX_DETAIL) };
    } catch (error) {
      return { passed: false, detail: boundText(`verifier error: ${errorMessage(error)}`, MAX_DETAIL) };
    }
  }

  /** Failed attempt: retry while budget remains, otherwise the task is failed. */
  private failAttempt(
    attempt: ActiveAttempt,
    def: NormalizedPlanTask,
    message: string,
    report: AgentTaskReport | null,
    verification: VerificationOutcome[] | null,
  ): void {
    const row = this.store.getTask(attempt.runId, attempt.taskId);
    const exhausted = !row || row.attemptCount >= def.maxAttempts;
    this.finish(attempt, {
      to: exhausted ? "failed" : "ready",
      outcome: "failed",
      error: boundText(redactSecrets(message), MAX_ERROR),
      result: report,
      verification,
    });
  }

  /** Applies an outcome only while this attempt still holds the task. Stale callers get `false`. */
  private finish(
    attempt: ActiveAttempt,
    patch: {
      to: OrchestrationTaskState;
      outcome: AttemptOutcome;
      error?: string | null;
      result?: AgentTaskReport | null;
      verification?: VerificationOutcome[] | null;
    },
  ): boolean {
    const row = this.store.getTask(attempt.runId, attempt.taskId);
    if (!row || row.currentAttemptId !== attempt.attemptId) return false;
    const from = row.state;
    if (from !== "running" && from !== "verifying") return false;
    return this.store.finishAttempt({
      runId: attempt.runId,
      taskId: attempt.taskId,
      attemptId: attempt.attemptId,
      from,
      to: patch.to,
      outcome: patch.outcome,
      error: patch.error ?? null,
      result: patch.result,
      verification: patch.verification,
      now: this.nowIso(),
    });
  }

  /** Halt or timeout: the outcome is unknown, so the attempt is interrupted and never retried automatically. */
  private abortAttempt(attempt: ActiveAttempt, reason: "timeout" | "halted"): boolean {
    if (attempt.controller.signal.aborted) return false;
    attempt.controller.abort(new Error(reason));
    return this.finish(attempt, {
      to: "interrupted",
      outcome: "interrupted",
      error: reason === "timeout" ? TIMEOUT_REASON : HALT_REASON,
    });
  }

  private buildInput(attempt: ActiveAttempt, def: NormalizedPlanTask): TaskExecutionInput {
    const rows = new Map(this.store.getTasks(attempt.runId).map((row) => [row.taskId, row] as const));
    const dependencyResults = def.dependsOn.flatMap((depId) => {
      const row = rows.get(depId);
      const report = row?.state === "passed" ? parseStored<AgentTaskReport>(row.result) : null;
      return report
        ? [{ taskId: depId, summary: report.summary, changedFiles: report.changedFiles, artifacts: report.artifacts }]
        : [];
    });
    const self = rows.get(attempt.taskId);
    const previousAttempt = self?.lastError
      ? { error: self.lastError, verification: parseStored<VerificationOutcome[]>(self.verification) }
      : null;
    return {
      runId: attempt.runId,
      taskId: attempt.taskId,
      attemptId: attempt.attemptId,
      attemptNo: self?.attemptCount ?? 0,
      userId: attempt.userId,
      title: def.title,
      description: def.description,
      claims: def.claims,
      verification: def.verification,
      dependencyResults,
      previousAttempt,
      timeoutSeconds: def.timeoutSeconds,
      signal: attempt.controller.signal,
    };
  }

  // ── Views and helpers ──────────────────────────────────────────────

  private toView(run: RunRow): OrchestrationRunView {
    const definition = parseDefinition(run.definition);
    const defs = new Map(definition.tasks.map((task) => [task.id, task] as const));
    const rows = new Map(this.store.getTasks(run.id).map((row) => [row.taskId, row] as const));
    const tasks: OrchestrationTaskView[] = [];
    for (const id of definition.order) {
      const def = defs.get(id);
      const row = rows.get(id);
      if (def && row) tasks.push(this.toTaskView(def, row));
    }
    return {
      id: run.id,
      planId: run.planId,
      title: run.title,
      status: run.status as OrchestrationRunView["status"],
      paused: run.paused,
      maxWorkers: run.maxWorkers,
      error: run.error,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt,
      tasks,
    };
  }

  private toTaskView(def: NormalizedPlanTask, row: TaskRow): OrchestrationTaskView {
    return {
      taskId: def.id,
      title: def.title,
      state: row.state as OrchestrationTaskState,
      dependsOn: def.dependsOn,
      attemptCount: row.attemptCount,
      maxAttempts: def.maxAttempts,
      currentAttemptId: row.currentAttemptId,
      lastError: row.lastError,
      agentRef: row.agentRef,
      worktreeRef: row.worktreeRef,
      verification: parseStored<VerificationOutcome[]>(row.verification),
      result: parseStored<AgentTaskReport>(row.result),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    };
  }

  private resolveSource(
    userId: string,
    input: CreateRunInput,
  ): { planId: string | null; repoId: string | null; title: string; tasks: unknown } {
    if (input.planId !== undefined) {
      const plan = this.options.db.select().from(automationPlans).where(eq(automationPlans.id, input.planId)).get();
      if (!plan || plan.userId !== userId) throw new OrchestrationNotFoundError("plan not found");
      return {
        planId: plan.id,
        repoId: plan.repoId,
        title: input.title?.trim() || plan.title,
        tasks: parseJsonArray(plan.tasks),
      };
    }
    const title = input.title?.trim() ?? "";
    if (!title || title.length > 200) {
      throw new OrchestrationValidationError([
        { code: "invalid_title", taskId: null, message: "run title must be 1-200 characters" },
      ]);
    }
    return { planId: null, repoId: null, title, tasks: input.tasks };
  }

  private requireRunRow(userId: string, runId: string): RunRow {
    const run = this.store.getRun(runId);
    if (!run || run.userId !== userId) throw new OrchestrationNotFoundError("run not found");
    return run;
  }

  private assertNotHalted(userId: string): void {
    if (this.isHalted(userId)) throw new AgentHaltedError(undefined, "orchestration");
  }

  private inFlightTaskIds(runId: string): Set<string> {
    const ids = new Set<string>();
    for (const attempt of this.active.values()) {
      if (attempt.runId === runId) ids.add(attempt.taskId);
    }
    return ids;
  }

  private activeCountForUser(userId: string): number {
    let count = 0;
    for (const attempt of this.active.values()) {
      if (attempt.userId === userId) count += 1;
    }
    return count;
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }
}
