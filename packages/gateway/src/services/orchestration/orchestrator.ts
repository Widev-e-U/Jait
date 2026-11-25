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
  OrchestrationAttemptView,
  OrchestrationRunView,
  OrchestrationTaskState,
  OrchestrationTaskView,
  VerificationCheck,
  VerificationGate,
  OrchestrationPendingApproval,
  TaskWorker,
  VerificationOutcome,
} from "@jait/shared/types";
import { eq } from "drizzle-orm";
import type { JaitDB } from "../../db/connection.js";
import { automationPlans } from "../../db/schema.js";
import { uuidv7 } from "../../db/uuidv7.js";
import { AgentHaltedError } from "../agent-control.js";
import { boundText, parseAgentTaskReport, redactSecrets } from "./agent-report.js";
import { type NormalizedPlanTask, type PlanGraphIssue, validatePlanGraph } from "./dag.js";
import type { OrchestrationLease } from "./process-lease.js";
import type { ResourceClaims } from "./resources.js";
import { computeDependencyChanges, type SchedulableTask, selectDispatch } from "./scheduler.js";
import { type AttemptOutcome, type NewTask, OrchestrationStore, type RunRow, type TaskRow } from "./store.js";
import {
  type ScopeResult,
  WorkflowWorkspaces,
  type WorkspaceProvider,
  WorkspaceConflictError,
  WorkspaceStaleError,
  WorkspaceError,
  type WorkspaceRef,
} from "./workspace.js";

/**
 * Where an attempt may work. `write` means an isolated worktree on the task
 * branch, which is merged into the integration branch after it passes. `read`
 * means the integration worktree, which is never written to.
 */
export interface TaskWorkspace {
  path: string;
  mode: "read" | "write";
}

export interface TaskExecutionInput {
  runId: string;
  taskId: string;
  attemptId: string;
  attemptNo: number;
  userId: string;
  title: string;
  description: string;
  claims: ResourceClaims;
  /** Which worker carries the attempt. */
  worker: TaskWorker;
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
  /** Null when the task declares no resources. */
  workspace: TaskWorkspace | null;
  timeoutSeconds: number;
  recordAgentRef?: (agentRef: string) => void;
  signal: AbortSignal;
}

export interface TaskExecutor {
  /** Runs one attempt. Resolve with the agent's raw report; it is validated before use. */
  execute(input: TaskExecutionInput): Promise<unknown>;
}

export interface VerificationRunInput {
  userId: string;
  repoId: string | null;
  check: VerificationCheck;
  runId: string;
  taskId: string;
  attemptId: string;
  /** Workspace the gate runs in (worktree path), or null for the repository root. */
  workspacePath: string | null;
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
  /** Consent prompts waiting in a session; normally ConsentManager.listPending. Shown on the run view. */
  listPendingApprovals?: (sessionId: string) => OrchestrationPendingApproval[];
  /**
   * Workspaces for tasks that declare resources. Defaults to WorkflowWorkspaces
   * without repositories, which refuses such tasks (fail closed).
   */
  workspaces?: WorkspaceProvider;
  /** Process-wide cap on concurrent attempts across all runs. */
  globalMaxWorkers?: number;
  /** Cap on concurrent attempts per owner. */
  perUserMaxWorkers?: number;
  /**
   * Cap on concurrent attempts per owner and provider, so workflow fan-out stays
   * within a provider's concurrency budget. Only workflow attempts are counted.
   */
  perProviderMaxWorkers?: number;
  /** Provider key of the owner's workers, e.g. the in-process Jait backend. Defaults to one shared key. */
  providerKeyFor?: (userId: string) => string;
  now?: () => Date;
  /**
   * Single-owner lease for this database. Without one this process owns the plan
   * state. With one, a process that does not hold it changes nothing and retries.
   */
  lease?: OrchestrationLease;
  /** How often a standby process retries the lease. Zero disables the retry, which tests drive directly. */
  leaseRetryMs?: number;
  /** Reports ownership changes, for logs. */
  onOwnership?: (event: OwnershipEvent) => void;
}

export interface OwnershipEvent {
  owner: boolean;
  reason: string;
  /** Attempts a takeover interrupted, when this process just became owner. */
  interrupted?: number;
}

const DEFAULT_LEASE_RETRY_MS = 5_000;

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
  providerKey: string;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
}

const MANUAL_RETRY_BUDGET = 1; // one operator retry beyond maxAttempts
const MAX_NOTE = 500;
const MAX_ERROR = 2000;
const MAX_DETAIL = 2000;
/** How many times a writer is re-synced and re-verified after another writer lands first, before it is held. */
const MAX_RESYNC_ROUNDS = 2;
const DEFAULT_GLOBAL_WORKERS = 4;
const DEFAULT_USER_WORKERS = 4;
const DEFAULT_PROVIDER_WORKERS = 2;
const TIMEOUT_REASON = "attempt timed out; outcome unknown, not retried automatically";
const HALT_REASON = "stopped by agent halt; outcome unknown, not retried automatically";
const SHUTDOWN_REASON = "gateway shutting down; outcome unknown, not retried automatically";
const RESTART_REASON = "gateway restarted before the attempt finished; outcome unknown, not retried automatically";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MAX_LISTED_PATHS = 20;

function listPaths(paths: readonly string[]): string {
  const shown = paths.slice(0, MAX_LISTED_PATHS).join(", ");
  return paths.length > MAX_LISTED_PATHS ? `${shown} (+${paths.length - MAX_LISTED_PATHS} more)` : shown;
}

/** Deleted files for the scope evidence, or an empty string when nothing was deleted. */
function listDeleted(deleted: readonly string[] | undefined): string {
  return deleted && deleted.length > 0 ? `; deleted: ${listPaths(deleted)}` : "";
}

/** Why a scope check failed: paths outside the writes and changes to protected paths. */
function describeScopeFailure(scope: ScopeResult): string {
  const parts: string[] = [];
  if (scope.outside.length > 0) parts.push(`outside scope: ${listPaths(scope.outside)}`);
  const protectedPaths = scope.protectedPaths ?? [];
  if (protectedPaths.length > 0) parts.push(`protected paths changed: ${listPaths(protectedPaths)}`);
  return parts.join("; ");
}

const WORKFLOW_SESSION_PREFIX = "workflow:";

/**
 * The session that carries a run's worker tool calls and command gates, and so
 * its consent prompts. It is not the chat that started the run.
 */
export function workflowSessionId(runId: string): string {
  return `${WORKFLOW_SESSION_PREFIX}${runId}`;
}

/** The run behind a worker session, or null for any other session. */
export function workflowRunIdOf(sessionId: string): string | null {
  if (!sessionId.startsWith(WORKFLOW_SESSION_PREFIX)) return null;
  const runId = sessionId.slice(WORKFLOW_SESSION_PREFIX.length);
  return runId.length > 0 ? runId : null;
}

function parseDefinition(raw: string): RunDefinition {
  const parsed = JSON.parse(raw) as Omit<RunDefinition, "tasks"> & {
    tasks: Array<Omit<NormalizedPlanTask, "worker"> & { worker?: TaskWorker }>;
  };
  // Runs stored before ACP workers existed have no worker field and ran in-process.
  return {
    ...parsed,
    tasks: parsed.tasks.map((task) => ({ ...task, worker: task.worker ?? { kind: "jait" } })),
  };
}

/** In-process tasks share the owner's provider key. Each ACP provider has its own, so its cap is separate. */
function workerProviderKey(worker: TaskWorker, ownerKey: string): string {
  return worker.kind === "acp" ? `acp:${worker.providerId}` : ownerKey;
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

/**
 * Plan runs execute only tasks a person approved. Agent-proposed, skipped or
 * otherwise unapproved tasks stop the run before anything is persisted.
 * Malformed entries are left to graph validation.
 */
function unapprovedTaskIssues(tasks: unknown[]): PlanGraphIssue[] {
  const issues: PlanGraphIssue[] = [];
  for (const task of tasks) {
    if (typeof task !== "object" || task === null) continue;
    const record = task as Record<string, unknown>;
    if (record.status === "approved") continue;
    const id = typeof record.id === "string" ? record.id : null;
    const status = typeof record.status === "string" ? record.status : "not approved";
    issues.push({
      code: "task_not_approved",
      taskId: id,
      message: `task ${id ? `"${id}"` : "(unnamed)"} is ${status}; approve it before running the plan`,
    });
  }
  return issues;
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
  private closing = false;
  private readonly inflight = new Set<Promise<void>>();
  private readonly verifier: VerificationRunner;
  private readonly isHalted: (userId: string) => boolean;
  private readonly globalMaxWorkers: number;
  private readonly perUserMaxWorkers: number;
  private readonly perProviderMaxWorkers: number;
  private readonly providerKeyFor: (userId: string) => string;
  private readonly clock: () => Date;
  private readonly workspaces: WorkspaceProvider;
  /** Tail of the workspace and integration work queue for each run. Git merges in one run never interleave. */
  private readonly serialChains = new Map<string, Promise<void>>();
  /** Lease for this database, when one is configured. */
  private readonly lease: OrchestrationLease | undefined;
  /** Whether this process owns the database's plan state. A standby process only reads it. */
  private owns: boolean;
  private standbyTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: OrchestrationServiceOptions) {
    this.lease = options.lease;
    this.owns = options.lease === undefined;
    this.store = new OrchestrationStore(options.db);
    this.workspaces = options.workspaces ?? new WorkflowWorkspaces();
    this.verifier = options.verifier ?? refusingVerificationRunner;
    this.isHalted = options.isHalted ?? (() => false);
    this.globalMaxWorkers = options.globalMaxWorkers ?? DEFAULT_GLOBAL_WORKERS;
    this.perUserMaxWorkers = options.perUserMaxWorkers ?? DEFAULT_USER_WORKERS;
    this.perProviderMaxWorkers = options.perProviderMaxWorkers ?? DEFAULT_PROVIDER_WORKERS;
    this.providerKeyFor = options.providerKeyFor ?? (() => "default");
    this.clock = options.now ?? (() => new Date());
  }

  // ── Public operations ──────────────────────────────────────────────

  createRun(userId: string, input: CreateRunInput): OrchestrationRunView {
    this.assertOwnership();
    this.assertNotHalted(userId);
    const source = this.resolveSource(userId, input);
    const graph = validatePlanGraph(source.tasks);
    if (!graph.ok) throw new OrchestrationValidationError(graph.issues);
    // Tasks with resources work in git worktrees, so they need a repository. Refuse before anything is persisted.
    if (graph.tasks.some((task) => task.claims.writes.length > 0 || task.claims.reads.length > 0)) {
      try {
        this.workspaces.assertRunHost(userId, source.repoId);
      } catch (error) {
        throw new OrchestrationValidationError([
          { code: "workspace_required", taskId: null, message: errorMessage(error) },
        ]);
      }
    }
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

  /**
   * The owner of the run behind a worker session, or null. Consent routes admit
   * only this owner, so a worker's prompt reaches the person who started its run.
   */
  ownerOfWorkflowSession(sessionId: string): string | null {
    const runId = workflowRunIdOf(sessionId);
    return runId === null ? null : (this.store.getRun(runId)?.userId ?? null);
  }

  getTaskAttempts(userId: string, runId: string, taskId: string): OrchestrationAttemptView[] {
    this.requireRunRow(userId, runId);
    if (!this.store.getTasks(runId).some((task) => task.taskId === taskId)) {
      throw new OrchestrationNotFoundError("task not found");
    }
    return this.store.getTaskAttempts(runId, taskId).map(({ outcome, state, runId: _runId, taskId: _taskId, ...attempt }) => {
      const stored = parseStored<{ report?: AgentTaskReport; verification?: VerificationOutcome[] }>(outcome);
      return {
        ...attempt,
        state: state as OrchestrationAttemptView["state"],
        result: stored?.report ?? null,
        verification: stored?.verification ?? null,
      };
    });
  }

  listRuns(userId: string): OrchestrationRunView[] {
    return this.store.listRunsForUser(userId).map((run) => this.toView(run));
  }

  /**
   * Operator resume. Every interrupted task needs a retry or fail decision made
   * after inspecting the workspace; nothing restarts without one.
   */
  resumeRun(userId: string, runId: string, decisions: readonly InspectionDecision[] = []): OrchestrationRunView {
    this.assertOwnership();
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
    this.assertOwnership();
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
   * Only the owner recovers, because a standby process would interrupt live work.
   */
  recoverAfterRestart(): number {
    this.assertOwnership();
    if (this.active.size > 0) throw new OrchestrationConflictError("recovery must run before any attempt is started");
    const now = this.nowIso();
    const recovered = this.store.recoverActiveAttempts({ reason: RESTART_REASON, now });
    this.store.pauseNonFinalRuns(now);
    return recovered.length;
  }

  /** Whether this process owns the database's plan state. A standby process can read runs but cannot change them. */
  isOwner(): boolean {
    return this.owns;
  }

  /**
   * Takes the database's lease when it is free. When another live gateway process
   * holds it, this process stands by and retries in the background.
   */
  acquireOwnership(): boolean {
    if (this.owns) return true;
    if (this.closing) return false;
    if (this.lease?.acquire()) {
      this.becomeOwner();
      return true;
    }
    this.options.onOwnership?.({ owner: false, reason: "another live gateway process owns this database" });
    this.startStandby();
    return false;
  }

  /**
   * Standby retry: takes the lease once its holder is gone, then recovers what
   * the previous owner left unfinished. Returns whether this process now owns it.
   */
  takeOverIfFree(): boolean {
    if (this.owns || this.closing || !this.lease) return this.owns;
    if (!this.lease.acquire()) return false;
    this.becomeOwner();
    const interrupted = this.recoverAfterRestart();
    this.options.onOwnership?.({ owner: true, reason: "lease acquired", interrupted });
    return true;
  }

  /**
   * Stop dispatch and drain workers before their backing database is closed.
   * The owner pauses its runs and releases the lease once its workers settle.
   * A standby process changes nothing.
   */
  async close(): Promise<void> {
    if (!this.closing) {
      this.closing = true;
      this.stopStandby();
      if (this.owns) {
        this.store.pauseNonFinalRuns(this.nowIso());
        for (const attempt of this.active.values()) this.abortAttempt(attempt, "shutdown");
      }
    }
    await this.settle();
    if (this.owns) {
      this.owns = false;
      this.lease?.release();
    }
  }

  private becomeOwner(): void {
    this.owns = true;
    this.stopStandby();
  }

  private startStandby(): void {
    if (this.standbyTimer || !this.lease || this.closing) return;
    const retryMs = this.options.leaseRetryMs ?? DEFAULT_LEASE_RETRY_MS;
    if (retryMs <= 0) return;
    this.standbyTimer = setInterval(() => {
      try {
        this.takeOverIfFree();
      } catch (error) {
        this.options.onOwnership?.({ owner: false, reason: `takeover failed: ${errorMessage(error)}` });
      }
    }, retryMs);
    this.standbyTimer.unref?.();
  }

  private stopStandby(): void {
    if (!this.standbyTimer) return;
    clearInterval(this.standbyTimer);
    this.standbyTimer = undefined;
  }

  private assertOwnership(): void {
    if (!this.owns) {
      throw new OrchestrationConflictError(
        "plan runs on this database belong to another live gateway process; this process can only read them",
      );
    }
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
    if (this.closing || !this.owns) return;
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
    const ownerProviderKey = this.providerKeyFor(run.userId);
    for (const row of current) {
      const def = defs.get(row.taskId);
      if (!def) continue;
      const inFlightTask = inFlight.has(row.taskId);
      // A ready task whose provider is at its cap is left out, so it cannot hold a slot another task could use.
      if (!inFlightTask && this.providerIsFull(run.userId, workerProviderKey(def.worker, ownerProviderKey))) continue;
      tasks.push({
        taskId: row.taskId,
        state: row.state as OrchestrationTaskState,
        order: order.get(row.taskId) ?? 0,
        priority: def.priority,
        claims: def.claims,
        inFlight: inFlight.has(row.taskId),
      });
    }
    // Provider caps are applied per task, so an ACP provider never uses the in-process provider's slots.
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
      if (!def) continue;
      const providerKey = workerProviderKey(def.worker, ownerProviderKey);
      // Starts earlier in this pump count too, so a provider's cap holds within one pass.
      if (this.providerIsFull(run.userId, providerKey)) continue;
      this.startAttempt(runId, run.userId, providerKey, def);
    }
  }

  /** Freed capacity may unblock any run, so every dispatchable run is pumped. */
  private schedulePumpAll(): void {
    queueMicrotask(() => {
      if (this.closing) return;
      for (const runId of this.store.listDispatchableRunIds()) {
        try {
          this.pump(runId);
        } catch (error) {
          this.store.setRunError(runId, boundText(redactSecrets(errorMessage(error)), MAX_ERROR), this.nowIso());
        }
      }
    });
  }

  private startAttempt(runId: string, userId: string, providerKey: string, def: NormalizedPlanTask): void {
    const attemptId = uuidv7();
    if (!this.store.claimTask({ runId, taskId: def.id, attemptId, now: this.nowIso() })) return;
    const attempt: ActiveAttempt = {
      attemptId,
      runId,
      taskId: def.id,
      userId,
      providerKey,
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
          error: boundText(redactSecrets(`internal error: ${errorMessage(error)}; outcome unknown`), MAX_ERROR),
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
    let workspace: TaskWorkspace | null;
    try {
      workspace = await this.prepareWorkspace(attempt, def);
    } catch (error) {
      if (attempt.controller.signal.aborted) return;
      if (error instanceof WorkspaceConflictError) {
        // The sync with integration conflicted. Retrying unchanged work would conflict again, so hold the task.
        this.finish(attempt, {
          to: "interrupted",
          outcome: "interrupted",
          error: boundText(
            `sync with integration conflicts in ${error.files.length} file(s); held for inspection`,
            MAX_ERROR,
          ),
        });
        return;
      }
      this.failAttempt(attempt, def, boundText(redactSecrets(errorMessage(error)), MAX_ERROR), null, null);
      return;
    }
    if (attempt.controller.signal.aborted) return;
    let raw: unknown;
    try {
      raw = await this.options.executor.execute(this.buildInput(attempt, def, workspace));
    } catch (error) {
      if (!attempt.controller.signal.aborted) {
        this.finish(attempt, {
          to: "interrupted",
          outcome: "interrupted",
          error: boundText(redactSecrets(`executor failed: ${errorMessage(error)}; outcome unknown`), MAX_ERROR),
        });
      }
      return;
    }
    if (attempt.controller.signal.aborted) return;
    await this.handleReport(attempt, def, raw, workspace);
  }

  private async handleReport(
    attempt: ActiveAttempt,
    def: NormalizedPlanTask,
    raw: unknown,
    workspace: TaskWorkspace | null,
  ): Promise<void> {
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
    // A writer is re-synced and re-verified when another writer lands first, so gates always cover the combined state.
    for (let round = 0; ; round += 1) {
      const outcomes: VerificationOutcome[] = [];
      const next = await this.verifyRound(attempt, def, report, workspace, outcomes, round);
      if (next !== "stale") return;
      if (attempt.controller.signal.aborted) return;
      try {
        await this.serialize(attempt.runId, () =>
          this.workspaces.prepareWrite(this.workspaceRef(attempt), def.claims.writes, def.claims.protects),
        );
      } catch (error) {
        if (attempt.controller.signal.aborted) return;
        this.finish(attempt, {
          to: "interrupted",
          outcome: "interrupted",
          error: boundText(redactSecrets(`re-sync with integration failed: ${errorMessage(error)}; held for inspection`), MAX_ERROR),
          result: report,
        });
        return;
      }
    }
  }

  /** One verification pass. Returns "stale" when integration moved on and the writer needs another pass. */
  private async verifyRound(
    attempt: ActiveAttempt,
    def: NormalizedPlanTask,
    report: AgentTaskReport,
    workspace: TaskWorkspace | null,
    outcomes: VerificationOutcome[],
    round: number,
  ): Promise<"done" | "stale"> {
    if (workspace?.mode === "write") {
      // Deterministic scope gate: a writer may only change what its claims declare, and nothing it must leave untouched.
      const scope = await this.checkScopeGate(this.workspaceRef(attempt), workspace.path, def.claims);
      if (attempt.controller.signal.aborted) return "done";
      outcomes.push(scope);
      if (!scope.passed) {
        this.failAttempt(attempt, def, `verification failed: ${scope.label}`, report, outcomes);
        return "done";
      }
    }
    for (const gate of def.verification) {
      const verdict = await this.runGate(attempt, gate, workspace?.path ?? null);
      if (attempt.controller.signal.aborted) return "done";
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
      if (workspace?.mode === "write") {
        return this.integrateAndFinish(attempt, def, report, outcomes, round < MAX_RESYNC_ROUNDS);
      }
      this.finish(attempt, { to: "passed", outcome: "passed", error: null, result: report, verification: outcomes });
      return "done";
    }
    this.failAttempt(
      attempt,
      def,
      `verification failed: ${failedRequired.map((outcome) => outcome.label).join("; ")}`,
      report,
      outcomes,
    );
    return "done";
  }

  private async runGate(
    attempt: ActiveAttempt,
    gate: VerificationGate,
    workspacePath: string | null,
  ): Promise<{ passed: boolean; detail: string }> {
    try {
      const run = this.requireRunRow(attempt.userId, attempt.runId);
      // Not raced against the abort: a stopped gate can still have a command running. The
      // attempt keeps its worker and claims until the verifier settles, and verifiers settle
      // only after their processes have exited (see command-verifier and terminal-tools).
      const verdict = await this.verifier.run({
        userId: run.userId,
        repoId: run.repoId,
        check: gate.check,
        runId: attempt.runId,
        taskId: attempt.taskId,
        attemptId: attempt.attemptId,
        workspacePath,
        signal: attempt.controller.signal,
      });
      return { passed: verdict.passed === true, detail: boundText(redactSecrets(String(verdict.detail)), MAX_DETAIL) };
    } catch (error) {
      return { passed: false, detail: boundText(redactSecrets(`verifier error: ${errorMessage(error)}`), MAX_DETAIL) };
    }
  }

  /** Workspace for this attempt, or null when the task declares no resources. Runs before the agent starts. */
  private async prepareWorkspace(attempt: ActiveAttempt, def: NormalizedPlanTask): Promise<TaskWorkspace | null> {
    const { writes, reads } = def.claims;
    if (writes.length === 0 && reads.length === 0) return null;
    const ref = this.workspaceRef(attempt);
    return this.serialize<TaskWorkspace>(attempt.runId, async () => {
      if (attempt.controller.signal.aborted) throw new WorkspaceError("attempt was stopped before its workspace was ready");
      if (writes.length === 0) {
        const location = await this.workspaces.prepareRead(ref);
        return { path: location.path, mode: "read" };
      }
      const location = await this.workspaces.prepareWrite(ref, writes, def.claims.protects);
      if (!this.store.recordWorkspace(attempt, location.path)) {
        throw new WorkspaceError("workflow attempt no longer owns its task");
      }
      return { path: location.path, mode: "write" };
    });
  }

  /**
   * The scope gate's outcome. A changed path outside the declared writes fails it,
   * and so does any change to a protected path. Deleted files are always listed, so
   * a removed file is visible in the evidence even when the gate passes.
   */
  private async checkScopeGate(ref: WorkspaceRef, path: string, claims: ResourceClaims): Promise<VerificationOutcome> {
    const protects = claims.protects ?? [];
    const label =
      protects.length > 0
        ? "changes stay inside the declared writes and leave protected paths untouched"
        : "changes stay inside the declared writes";
    try {
      const scope = await this.workspaces.checkScope(ref, path, claims.writes, protects);
      const detail = scope.ok
        ? `${scope.changed.length} changed file(s) inside scope${scope.changed.length > 0 ? `; changed: ${listPaths(scope.changed)}` : ""}${listDeleted(scope.deleted)}`
        : describeScopeFailure(scope);
      return { gateId: "system:scope", label, required: true, passed: scope.ok, detail: boundText(redactSecrets(detail), MAX_DETAIL) };
    } catch (error) {
      return {
        gateId: "system:scope",
        label,
        required: true,
        passed: false,
        detail: boundText(redactSecrets(`scope check error: ${errorMessage(error)}`), MAX_DETAIL),
      };
    }
  }

  /**
   * Commits and merges a verified writer into the integration branch, then records
   * the outcome. A conflict or unknown failure holds the task as interrupted instead
   * of retrying it. Dependents only see the work after it lands in integration.
   */
  private async integrateAndFinish(
    attempt: ActiveAttempt,
    def: NormalizedPlanTask,
    report: AgentTaskReport,
    outcomes: VerificationOutcome[],
    mayResync: boolean,
  ): Promise<"done" | "stale"> {
    if (attempt.controller.signal.aborted) return "done";
    const ref = this.workspaceRef(attempt);
    const label = "merged into the run's integration branch";
    try {
      const result = await this.serialize(attempt.runId, () => {
        if (attempt.controller.signal.aborted) throw new WorkspaceError("stopped before integration");
        return this.workspaces.integrate(ref, def.claims.writes, `workflow ${attempt.runId}: ${def.id}`, def.claims.protects);
      });
      outcomes.push({
        gateId: "system:integration",
        label,
        required: true,
        passed: true,
        detail: result.integrated
          ? `integrated at ${result.head}`
          : `nothing new to integrate; integration head ${result.head}`,
      });
      this.finish(attempt, { to: "passed", outcome: "passed", error: null, result: report, verification: outcomes });
      return "done";
    } catch (error) {
      if (attempt.controller.signal.aborted) return "done";
      if (error instanceof WorkspaceStaleError && mayResync) return "stale";
      const conflict = error instanceof WorkspaceConflictError;
      outcomes.push({
        gateId: "system:integration",
        label,
        required: true,
        passed: false,
        detail: boundText(
          redactSecrets(conflict ? `conflicting files: ${error.files.slice(0, 50).join(", ")}` : errorMessage(error)),
          MAX_DETAIL,
        ),
      });
      this.finish(attempt, {
        to: "interrupted",
        outcome: "interrupted",
        error: boundText(
          redactSecrets(
            conflict
              ? `integration conflict in ${error.files.length} file(s); held for inspection`
              : `integration failed: ${errorMessage(error)}; held for inspection`,
          ),
          MAX_ERROR,
        ),
        result: report,
        verification: outcomes,
      });
      return "done";
    }
  }

  /** Identifies the attempt's workspace. The owner and repository come from the run, never from the agent. */
  private workspaceRef(attempt: ActiveAttempt): WorkspaceRef {
    const run = this.requireRunRow(attempt.userId, attempt.runId);
    return { userId: attempt.userId, repoId: run.repoId, runId: attempt.runId, taskId: attempt.taskId };
  }

  /** Runs workspace and integration steps for one run one at a time. Merges in one worktree must not interleave. */
  private serialize<T>(runId: string, work: () => Promise<T>): Promise<T> {
    const next = (this.serialChains.get(runId) ?? Promise.resolve()).then(work);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    this.serialChains.set(runId, tail);
    void tail.then(() => {
      if (this.serialChains.get(runId) === tail) this.serialChains.delete(runId);
    });
    return next;
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
  private abortAttempt(attempt: ActiveAttempt, reason: "timeout" | "halted" | "shutdown"): boolean {
    if (attempt.controller.signal.aborted) return false;
    attempt.controller.abort(new Error(reason));
    return this.finish(attempt, {
      to: "interrupted",
      outcome: "interrupted",
      error: reason === "timeout" ? TIMEOUT_REASON : reason === "shutdown" ? SHUTDOWN_REASON : HALT_REASON,
    });
  }

  private buildInput(attempt: ActiveAttempt, def: NormalizedPlanTask, workspace: TaskWorkspace | null): TaskExecutionInput {
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
      worker: def.worker,
      verification: def.verification,
      dependencyResults,
      previousAttempt,
      workspace,
      timeoutSeconds: def.timeoutSeconds,
      signal: attempt.controller.signal,
      recordAgentRef: (agentRef) => {
        if (!this.store.recordAgentRef(attempt, agentRef)) throw new Error("workflow attempt no longer owns its task");
      },
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
      workerSessionId: workflowSessionId(run.id),
      pendingApprovals: this.options.listPendingApprovals?.(workflowSessionId(run.id)) ?? [],
      tasks,
    };
  }

  private toTaskView(def: NormalizedPlanTask, row: TaskRow): OrchestrationTaskView {
    return {
      taskId: def.id,
      title: def.title,
      state: row.state as OrchestrationTaskState,
      dependsOn: def.dependsOn,
      resources: { reads: def.claims.reads, writes: def.claims.writes, protects: def.claims.protects ?? [] },
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
      const tasks = parseJsonArray(plan.tasks);
      const unapproved = unapprovedTaskIssues(tasks);
      if (unapproved.length > 0) throw new OrchestrationValidationError(unapproved);
      return {
        planId: plan.id,
        repoId: plan.repoId,
        title: input.title?.trim() || plan.title,
        tasks,
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
    if (this.closing) throw new OrchestrationConflictError("orchestration is shutting down");
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

  private activeCountForProvider(userId: string, providerKey: string): number {
    let count = 0;
    for (const attempt of this.active.values()) {
      if (attempt.userId === userId && attempt.providerKey === providerKey) count += 1;
    }
    return count;
  }

  /** Whether the owner already runs as many attempts on this provider as it may. */
  private providerIsFull(userId: string, providerKey: string): boolean {
    return this.activeCountForProvider(userId, providerKey) >= this.perProviderMaxWorkers;
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }
}
