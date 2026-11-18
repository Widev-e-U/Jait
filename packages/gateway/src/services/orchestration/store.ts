/**
 * Persistence for orchestration runs. Each state change is one synchronous
 * SQLite transaction guarded by compare-and-set: on the expected state and,
 * for attempt outcomes, on the current attempt id. A stale worker therefore
 * cannot finish a task that was interrupted or re-assigned.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AgentTaskReport, OrchestrationTaskState, VerificationOutcome } from "@jait/shared/types";
import type { JaitDB } from "../../db/connection.js";
import { orchestrationAttempts, orchestrationRuns, orchestrationTaskRuns } from "../../db/schema.js";
import { assertTaskTransition, deriveRunStatus } from "./state-machine.js";

export type RunRow = typeof orchestrationRuns.$inferSelect;
export type TaskRow = typeof orchestrationTaskRuns.$inferSelect;
export type AttemptRow = typeof orchestrationAttempts.$inferSelect;
type Transaction = Parameters<Parameters<JaitDB["transaction"]>[0]>[0];
export type AttemptOutcome = "passed" | "failed" | "interrupted" | "cancelled";

const ACTIVE_STATES: OrchestrationTaskState[] = ["running", "verifying"];
const UNFINISHED_RUN_STATES = ["running", "interrupted"];

export interface NewRun {
  id: string;
  planId: string | null;
  userId: string;
  repoId: string | null;
  title: string;
  maxWorkers: number;
  definition: string;
  createdAt: string;
}

export interface NewTask {
  taskId: string;
  state: OrchestrationTaskState;
}

export interface RecoveredAttempt {
  runId: string;
  taskId: string;
  attemptId: string | null;
}

interface StoredOutcome {
  report: AgentTaskReport | null;
  verification: VerificationOutcome[] | null;
}

function taskKey(runId: string, taskId: string) {
  return and(eq(orchestrationTaskRuns.runId, runId), eq(orchestrationTaskRuns.taskId, taskId));
}

function parseOutcome(raw: string | null | undefined): StoredOutcome {
  if (!raw) return { report: null, verification: null };
  try {
    return JSON.parse(raw) as StoredOutcome;
  } catch {
    return { report: null, verification: null };
  }
}

/** Recomputes the run status from its tasks inside the same transaction. A cancelled run keeps its status. */
function refreshRun(tx: Transaction, runId: string, now: string): void {
  const run = tx.select().from(orchestrationRuns).where(eq(orchestrationRuns.id, runId)).get();
  if (!run || run.status === "cancelled") return;
  const states = tx
    .select({ state: orchestrationTaskRuns.state })
    .from(orchestrationTaskRuns)
    .where(eq(orchestrationTaskRuns.runId, runId))
    .all()
    .map((row) => row.state as OrchestrationTaskState);
  const status = deriveRunStatus(states);
  const finished = status === "passed" || status === "failed";
  const finishedAt = finished ? (run.finishedAt && run.status === status ? run.finishedAt : now) : null;
  if (status === run.status && finishedAt === run.finishedAt) return;
  tx.update(orchestrationRuns).set({ status, finishedAt, updatedAt: now }).where(eq(orchestrationRuns.id, runId)).run();
}

export class OrchestrationStore {
  constructor(private readonly db: JaitDB) {}

  insertRun(run: NewRun, tasks: readonly NewTask[]): void {
    this.db.transaction((tx) => {
      tx.insert(orchestrationRuns).values({
        id: run.id,
        planId: run.planId,
        userId: run.userId,
        repoId: run.repoId,
        title: run.title,
        status: deriveRunStatus(tasks.map((task) => task.state)),
        paused: false,
        maxWorkers: run.maxWorkers,
        definition: run.definition,
        error: null,
        createdAt: run.createdAt,
        updatedAt: run.createdAt,
        finishedAt: null,
      }).run();
      for (const task of tasks) {
        tx.insert(orchestrationTaskRuns).values({
          runId: run.id,
          taskId: task.taskId,
          state: task.state,
          attemptCount: 0,
          currentAttemptId: null,
          lastError: null,
          result: null,
          verification: null,
          agentRef: null,
          worktreeRef: null,
          startedAt: null,
          finishedAt: null,
          updatedAt: run.createdAt,
        }).run();
      }
    });
  }

  getRun(runId: string): RunRow | undefined {
    return this.db.select().from(orchestrationRuns).where(eq(orchestrationRuns.id, runId)).get();
  }

  listRunsForUser(userId: string): RunRow[] {
    return this.db
      .select()
      .from(orchestrationRuns)
      .where(eq(orchestrationRuns.userId, userId))
      .orderBy(desc(orchestrationRuns.createdAt))
      .all();
  }

  listDispatchableRunIds(): string[] {
    return this.db
      .select({ id: orchestrationRuns.id })
      .from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.status, "running"), eq(orchestrationRuns.paused, false)))
      .all()
      .map((row) => row.id);
  }

  getTasks(runId: string): TaskRow[] {
    return this.db.select().from(orchestrationTaskRuns).where(eq(orchestrationTaskRuns.runId, runId)).all();
  }

  getTask(runId: string, taskId: string): TaskRow | undefined {
    return this.db.select().from(orchestrationTaskRuns).where(taskKey(runId, taskId)).get();
  }

  getAttempts(runId: string): AttemptRow[] {
    return this.db
      .select()
      .from(orchestrationAttempts)
      .where(eq(orchestrationAttempts.runId, runId))
      .orderBy(orchestrationAttempts.startedAt)
      .all();
  }

  getTaskAttempts(runId: string, taskId: string): AttemptRow[] {
    return this.db.select().from(orchestrationAttempts)
      .where(and(eq(orchestrationAttempts.runId, runId), eq(orchestrationAttempts.taskId, taskId)))
      .orderBy(orchestrationAttempts.attemptNo)
      .all();
  }

  /** ready -> running, creating the attempt row. Returns null if another writer got there first. */
  claimTask(input: { runId: string; taskId: string; attemptId: string; now: string }): { attemptNo: number } | null {
    return this.db.transaction((tx) => {
      const task = tx.select().from(orchestrationTaskRuns).where(taskKey(input.runId, input.taskId)).get();
      if (!task || task.state !== "ready") return null;
      const attemptNo = task.attemptCount + 1;
      const claimed = tx
        .update(orchestrationTaskRuns)
        .set({
          state: "running",
          attemptCount: attemptNo,
          currentAttemptId: input.attemptId,
          agentRef: null,
          startedAt: input.now,
          finishedAt: null,
          updatedAt: input.now,
        })
        .where(and(taskKey(input.runId, input.taskId), eq(orchestrationTaskRuns.state, "ready")))
        .run();
      if (claimed.changes !== 1) return null;
      tx.insert(orchestrationAttempts).values({
        id: input.attemptId,
        runId: input.runId,
        taskId: input.taskId,
        attemptNo,
        state: "running",
        agentRef: null,
        worktreeRef: null,
        outcome: null,
        error: null,
        startedAt: input.now,
        finishedAt: null,
      }).run();
      refreshRun(tx, input.runId, input.now);
      return { attemptNo };
    });
  }

  recordAgentRef(input: { runId: string; taskId: string; attemptId: string }, agentRef: string): boolean {
    return this.db.transaction((tx) => {
      const updated = tx.update(orchestrationTaskRuns)
        .set({ agentRef })
        .where(and(
          taskKey(input.runId, input.taskId),
          eq(orchestrationTaskRuns.currentAttemptId, input.attemptId),
          eq(orchestrationTaskRuns.state, "running"),
        ))
        .run();
      if (updated.changes !== 1) return false;
      tx.update(orchestrationAttempts).set({ agentRef })
        .where(eq(orchestrationAttempts.id, input.attemptId)).run();
      return true;
    });
  }

  /** Records the isolated workspace an attempt works in. Fenced like recordAgentRef. */
  recordWorkspace(input: { runId: string; taskId: string; attemptId: string }, worktreeRef: string): boolean {
    return this.db.transaction((tx) => {
      const updated = tx.update(orchestrationTaskRuns)
        .set({ worktreeRef })
        .where(and(
          taskKey(input.runId, input.taskId),
          eq(orchestrationTaskRuns.currentAttemptId, input.attemptId),
          eq(orchestrationTaskRuns.state, "running"),
        ))
        .run();
      if (updated.changes !== 1) return false;
      tx.update(orchestrationAttempts).set({ worktreeRef })
        .where(eq(orchestrationAttempts.id, input.attemptId)).run();
      return true;
    });
  }

  /** running -> verifying for the current attempt only. A valid report never passes a task by itself. */
  markVerifying(input: { runId: string; taskId: string; attemptId: string; result: AgentTaskReport; now: string }): boolean {
    return this.db.transaction((tx) => {
      const moved = tx
        .update(orchestrationTaskRuns)
        .set({ state: "verifying", result: JSON.stringify(input.result), updatedAt: input.now })
        .where(and(
          taskKey(input.runId, input.taskId),
          eq(orchestrationTaskRuns.currentAttemptId, input.attemptId),
          eq(orchestrationTaskRuns.state, "running"),
        ))
        .run();
      if (moved.changes !== 1) return false;
      tx.update(orchestrationAttempts)
        .set({ state: "verifying", outcome: JSON.stringify({ report: input.result, verification: null }) })
        .where(eq(orchestrationAttempts.id, input.attemptId))
        .run();
      refreshRun(tx, input.runId, input.now);
      return true;
    });
  }

  /** Ends the current attempt. Fenced: only the attempt holding the task can finish it. */
  finishAttempt(input: {
    runId: string;
    taskId: string;
    attemptId: string;
    from: "running" | "verifying";
    to: OrchestrationTaskState;
    outcome: AttemptOutcome;
    error: string | null;
    result?: AgentTaskReport | null;
    verification?: VerificationOutcome[] | null;
    now: string;
  }): boolean {
    assertTaskTransition(input.from, input.to);
    return this.db.transaction((tx) => {
      const attempt = tx.select().from(orchestrationAttempts).where(eq(orchestrationAttempts.id, input.attemptId)).get();
      const previous = parseOutcome(attempt?.outcome);
      const patch: Partial<typeof orchestrationTaskRuns.$inferInsert> = {
        state: input.to,
        currentAttemptId: null,
        lastError: input.error,
        finishedAt: input.now,
        updatedAt: input.now,
      };
      if (input.result !== undefined) patch.result = input.result === null ? null : JSON.stringify(input.result);
      if (input.verification !== undefined) {
        patch.verification = input.verification === null ? null : JSON.stringify(input.verification);
      }
      const moved = tx
        .update(orchestrationTaskRuns)
        .set(patch)
        .where(and(
          taskKey(input.runId, input.taskId),
          eq(orchestrationTaskRuns.currentAttemptId, input.attemptId),
          eq(orchestrationTaskRuns.state, input.from),
        ))
        .run();
      if (moved.changes !== 1) return false;
      const outcome: StoredOutcome = {
        report: input.result !== undefined ? input.result : previous.report,
        verification: input.verification !== undefined ? input.verification : previous.verification,
      };
      tx.update(orchestrationAttempts)
        .set({ state: input.outcome, error: input.error, finishedAt: input.now, outcome: JSON.stringify(outcome) })
        .where(eq(orchestrationAttempts.id, input.attemptId))
        .run();
      refreshRun(tx, input.runId, input.now);
      return true;
    });
  }

  /** Non-attempt transitions (dependency propagation, operator decisions). Guarded by the expected states. */
  setTaskState(input: {
    runId: string;
    taskId: string;
    from: readonly OrchestrationTaskState[];
    to: OrchestrationTaskState;
    error?: string;
    now: string;
  }): boolean {
    for (const from of input.from) assertTaskTransition(from, input.to);
    return this.db.transaction((tx) => {
      const patch: Partial<typeof orchestrationTaskRuns.$inferInsert> = { state: input.to, updatedAt: input.now };
      if (input.error !== undefined) patch.lastError = input.error;
      const moved = tx
        .update(orchestrationTaskRuns)
        .set(patch)
        .where(and(taskKey(input.runId, input.taskId), inArray(orchestrationTaskRuns.state, [...input.from])))
        .run();
      if (moved.changes !== 1) return false;
      refreshRun(tx, input.runId, input.now);
      return true;
    });
  }

  /** Cancels every unfinished task. Passed and failed tasks keep their results. */
  cancelRun(input: { runId: string; reason: string; now: string }): { cancelled: boolean; activeAttemptIds: string[] } {
    return this.db.transaction((tx) => {
      const run = tx.select().from(orchestrationRuns).where(eq(orchestrationRuns.id, input.runId)).get();
      if (!run || !UNFINISHED_RUN_STATES.includes(run.status)) return { cancelled: false, activeAttemptIds: [] };
      const tasks = tx.select().from(orchestrationTaskRuns).where(eq(orchestrationTaskRuns.runId, input.runId)).all();
      const activeAttemptIds: string[] = [];
      for (const task of tasks) {
        if (task.currentAttemptId && ACTIVE_STATES.includes(task.state as OrchestrationTaskState)) {
          activeAttemptIds.push(task.currentAttemptId);
        }
        if (task.state === "passed" || task.state === "failed" || task.state === "cancelled") continue;
        tx.update(orchestrationTaskRuns)
          .set({ state: "cancelled", currentAttemptId: null, finishedAt: input.now, updatedAt: input.now })
          .where(and(taskKey(input.runId, task.taskId), eq(orchestrationTaskRuns.state, task.state)))
          .run();
      }
      for (const attemptId of activeAttemptIds) {
        tx.update(orchestrationAttempts)
          .set({ state: "cancelled", error: input.reason, finishedAt: input.now })
          .where(and(eq(orchestrationAttempts.id, attemptId), inArray(orchestrationAttempts.state, ["running", "verifying"])))
          .run();
      }
      tx.update(orchestrationRuns)
        .set({ status: "cancelled", error: input.reason, finishedAt: input.now, updatedAt: input.now })
        .where(eq(orchestrationRuns.id, input.runId))
        .run();
      return { cancelled: true, activeAttemptIds };
    });
  }

  setPaused(runId: string, paused: boolean, now: string): void {
    this.db.update(orchestrationRuns).set({ paused, updatedAt: now }).where(eq(orchestrationRuns.id, runId)).run();
  }

  /** Halts pause the owner's unfinished runs, so nothing restarts until an operator resumes them. */
  pauseRunsForUser(userId: string, now: string): number {
    return this.db
      .update(orchestrationRuns)
      .set({ paused: true, updatedAt: now })
      .where(and(eq(orchestrationRuns.userId, userId), inArray(orchestrationRuns.status, UNFINISHED_RUN_STATES)))
      .run().changes;
  }

  pauseNonFinalRuns(now: string): number {
    return this.db
      .update(orchestrationRuns)
      .set({ paused: true, updatedAt: now })
      .where(inArray(orchestrationRuns.status, UNFINISHED_RUN_STATES))
      .run().changes;
  }

  /** Startup recovery: attempts left running have unknown outcomes and become interrupted, never retried here. */
  recoverActiveAttempts(input: { reason: string; now: string }): RecoveredAttempt[] {
    return this.db.transaction((tx) => {
      const active = tx.select().from(orchestrationTaskRuns).where(inArray(orchestrationTaskRuns.state, ACTIVE_STATES)).all();
      const recovered: RecoveredAttempt[] = [];
      for (const task of active) {
        const moved = tx
          .update(orchestrationTaskRuns)
          .set({ state: "interrupted", currentAttemptId: null, lastError: input.reason, finishedAt: input.now, updatedAt: input.now })
          .where(and(taskKey(task.runId, task.taskId), eq(orchestrationTaskRuns.state, task.state)))
          .run();
        if (moved.changes !== 1) continue;
        if (task.currentAttemptId) {
          tx.update(orchestrationAttempts)
            .set({ state: "interrupted", error: input.reason, finishedAt: input.now })
            .where(and(eq(orchestrationAttempts.id, task.currentAttemptId), inArray(orchestrationAttempts.state, ["running", "verifying"])))
            .run();
        }
        refreshRun(tx, task.runId, input.now);
        recovered.push({ runId: task.runId, taskId: task.taskId, attemptId: task.currentAttemptId });
      }
      return recovered;
    });
  }

  setRunError(runId: string, error: string, now: string): void {
    this.db.update(orchestrationRuns).set({ error, updatedAt: now }).where(eq(orchestrationRuns.id, runId)).run();
  }
}
