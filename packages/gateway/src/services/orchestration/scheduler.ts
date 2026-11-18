/**
 * Bounded dispatch: picks ready tasks that fit the worker limits and do not
 * conflict with resources held by occupied tasks. Also recomputes pending and
 * blocked states from dependencies. Pure; the orchestrator applies the result.
 */
import type { OrchestrationTaskState } from "@jait/shared/types";
import { claimsConflict, type ResourceClaims } from "./resources.js";

export interface SchedulableTask {
  taskId: string;
  state: OrchestrationTaskState;
  /** Position in the validated topological order; the deterministic tie-break. */
  order: number;
  priority: number;
  claims: ResourceClaims;
  /** An executor for this task is still alive in this process, whatever its stored state says. */
  inFlight?: boolean;
}

export type DeferReason = "halted" | "worker_limit" | "resource_conflict";

export interface DispatchInput {
  tasks: readonly SchedulableTask[];
  /** Per-run worker limit; running, verifying and in-flight tasks occupy workers. */
  maxWorkers: number;
  halted: boolean;
  /** Extra free slots left by process-wide and per-owner limits. */
  externalCapacity?: number;
}

export interface DispatchDecision {
  start: string[];
  deferred: Array<{ taskId: string; reason: DeferReason }>;
}

function occupies(task: SchedulableTask): boolean {
  return task.state === "running" || task.state === "verifying" || task.inFlight === true;
}

/** Higher priority first, then definition order. Conflicting or over-limit tasks are deferred, not dropped. */
export function selectDispatch(input: DispatchInput): DispatchDecision {
  const occupied = input.tasks.filter(occupies);
  const held: ResourceClaims[] = occupied.map((task) => task.claims);
  let slots = Math.min(input.maxWorkers - occupied.length, input.externalCapacity ?? Number.POSITIVE_INFINITY);
  const candidates = input.tasks
    .filter((task) => task.state === "ready" && !occupies(task))
    .sort((a, b) => b.priority - a.priority || a.order - b.order);

  const start: string[] = [];
  const deferred: DispatchDecision["deferred"] = [];
  for (const task of candidates) {
    if (input.halted) {
      deferred.push({ taskId: task.taskId, reason: "halted" });
    } else if (slots <= 0) {
      deferred.push({ taskId: task.taskId, reason: "worker_limit" });
    } else if (held.some((claims) => claimsConflict(claims, task.claims))) {
      deferred.push({ taskId: task.taskId, reason: "resource_conflict" });
    } else {
      start.push(task.taskId);
      held.push(task.claims);
      slots -= 1;
    }
  }
  return { start, deferred };
}

export interface DependencyNode {
  taskId: string;
  state: OrchestrationTaskState;
  dependsOn: readonly string[];
}

export interface StateChange {
  taskId: string;
  from: OrchestrationTaskState;
  to: OrchestrationTaskState;
}

function isBlockingState(state: OrchestrationTaskState): boolean {
  return state === "failed" || state === "blocked" || state === "cancelled";
}

/**
 * Pending and blocked tasks follow their dependencies: any failed, blocked or
 * cancelled dependency blocks; all passed makes ready; otherwise pending.
 * `order` must be topological so a single pass settles chains.
 */
export function computeDependencyChanges(nodes: readonly DependencyNode[], order: readonly string[]): StateChange[] {
  const byId = new Map(nodes.map((node) => [node.taskId, node] as const));
  const states = new Map(nodes.map((node) => [node.taskId, node.state] as const));
  const changes: StateChange[] = [];
  for (const taskId of order) {
    const node = byId.get(taskId);
    const current = states.get(taskId);
    if (!node || (current !== "pending" && current !== "blocked")) continue;
    const dependencyStates = node.dependsOn.map((dep) => states.get(dep) ?? "pending");
    let desired: OrchestrationTaskState = "pending";
    if (dependencyStates.some(isBlockingState)) desired = "blocked";
    else if (dependencyStates.every((state) => state === "passed")) desired = "ready";
    if (desired === current) continue;
    changes.push({ taskId, from: current, to: desired });
    states.set(taskId, desired);
  }
  return changes;
}
