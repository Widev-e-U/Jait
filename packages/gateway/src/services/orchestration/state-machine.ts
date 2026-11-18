/**
 * Task and run state rules for plan orchestration. Pure functions only: the
 * store checks these before every guarded write.
 */
import type { OrchestrationRunState, OrchestrationTaskState } from "@jait/shared/types";

/** Every legal task transition. Anything not listed is rejected. */
export const TASK_TRANSITIONS: Readonly<Record<OrchestrationTaskState, readonly OrchestrationTaskState[]>> = {
  pending: ["ready", "blocked", "cancelled"],
  ready: ["running", "cancelled"],
  running: ["verifying", "ready", "failed", "interrupted", "cancelled"],
  verifying: ["passed", "ready", "failed", "interrupted", "cancelled"],
  passed: [],
  failed: ["ready"],
  blocked: ["ready", "pending", "cancelled"],
  interrupted: ["ready", "failed", "cancelled"],
  cancelled: [],
};

export class InvalidTaskTransitionError extends Error {
  constructor(
    readonly from: OrchestrationTaskState,
    readonly to: OrchestrationTaskState,
  ) {
    super(`invalid task transition ${from} -> ${to}`);
    this.name = "InvalidTaskTransitionError";
  }
}

export function canTransitionTask(from: OrchestrationTaskState, to: OrchestrationTaskState): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertTaskTransition(from: OrchestrationTaskState, to: OrchestrationTaskState): void {
  if (!canTransitionTask(from, to)) throw new InvalidTaskTransitionError(from, to);
}

/** A task holding a worker: an attempt is executing or verifying. */
export function isActiveTaskState(state: OrchestrationTaskState): boolean {
  return state === "running" || state === "verifying";
}

/**
 * Run state derived from its tasks. Active work wins, then unresolved
 * interruptions, then pending work. A run only finishes when nothing can progress.
 */
export function deriveRunStatus(states: readonly OrchestrationTaskState[]): OrchestrationRunState {
  if (states.some(isActiveTaskState)) return "running";
  if (states.includes("interrupted")) return "interrupted";
  if (states.includes("ready") || states.includes("pending")) return "running";
  if (states.length > 0 && states.every((state) => state === "passed")) return "passed";
  if (states.includes("failed") || states.includes("blocked")) return "failed";
  return "cancelled";
}
