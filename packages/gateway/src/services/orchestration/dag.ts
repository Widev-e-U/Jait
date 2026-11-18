/**
 * Plan graph validation: ids, dependencies, cycles, resource claims, gates and
 * limits. Deterministic and free of I/O. Invalid plans never reach the scheduler.
 */
import { ORCHESTRATION_LIMITS } from "@jait/shared";
import type { VerificationCheck, VerificationGate } from "@jait/shared/types";
import { isNamedResourceKey, normalizeResourceKey, PROJECT_ROOT_KEY, type ResourceClaims } from "./resources.js";

export type PlanGraphIssueCode =
  | "invalid_shape"
  | "empty_plan"
  | "too_many_tasks"
  | "invalid_task_id"
  | "duplicate_task_id"
  | "invalid_title"
  | "invalid_description"
  | "missing_dependency"
  | "self_dependency"
  | "duplicate_dependency"
  | "cycle"
  | "invalid_resource"
  | "contradictory_resource"
  | "invalid_attempts"
  | "invalid_timeout"
  | "invalid_priority"
  | "missing_verification"
  | "invalid_verification"
  | "invalid_workers"
  | "task_not_approved";

export interface PlanGraphIssue {
  code: PlanGraphIssueCode;
  taskId: string | null;
  message: string;
}

export interface NormalizedPlanTask {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  claims: ResourceClaims;
  maxAttempts: number;
  timeoutSeconds: number;
  priority: number;
  verification: VerificationGate[];
}

export type PlanGraphResult =
  | { ok: true; tasks: NormalizedPlanTask[]; order: string[] }
  | { ok: false; issues: PlanGraphIssue[] };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 4000;
const MAX_RESOURCE_ENTRIES = 100;
const MAX_GATES = 20;
const MAX_COMMAND = 2000;
const MAX_GATE_TIMEOUT_SECONDS = 3600;

type Issues = PlanGraphIssue[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: Issues, code: PlanGraphIssueCode, taskId: string | null, message: string): void {
  issues.push({ code, taskId, message });
}

function describeEntry(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value.slice(0, 80)) : typeof value;
}

function readInteger(
  issues: Issues,
  taskId: string,
  raw: unknown,
  fallback: number,
  range: { min: number; max: number },
  code: PlanGraphIssueCode,
  label: string,
): number {
  if (raw === undefined) return fallback;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= range.min && raw <= range.max) return raw;
  addIssue(issues, code, taskId, `${label} must be an integer from ${range.min} to ${range.max}`);
  return fallback;
}

function readDependencies(issues: Issues, taskId: string, raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
    addIssue(issues, "invalid_shape", taskId, "dependsOn must be an array of task ids");
    return [];
  }
  const deps = raw as string[];
  if (new Set(deps).size !== deps.length) {
    addIssue(issues, "duplicate_dependency", taskId, `task "${taskId}" lists a dependency more than once`);
  }
  return [...new Set(deps)];
}

function readKeys(issues: Issues, taskId: string, raw: unknown, field: "reads" | "writes"): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_RESOURCE_ENTRIES) {
    addIssue(issues, "invalid_resource", taskId, `resources.${field} must be an array of at most ${MAX_RESOURCE_ENTRIES} entries`);
    return [];
  }
  const keys: string[] = [];
  for (const entry of raw) {
    const key = normalizeResourceKey(entry);
    if (key === null) {
      addIssue(issues, "invalid_resource", taskId, `resources.${field} entry ${describeEntry(entry)} is not a safe project path or name:<id>`);
    } else {
      keys.push(key);
    }
  }
  return [...new Set(keys)];
}

/** Absent resources claim the whole project for writing; `{}` declares no claims. */
function readClaims(issues: Issues, taskId: string, raw: unknown): ResourceClaims {
  if (raw === undefined) return { reads: [], writes: [PROJECT_ROOT_KEY] };
  if (!isRecord(raw)) {
    addIssue(issues, "invalid_resource", taskId, "resources must be an object with reads and writes arrays");
    return { reads: [], writes: [] };
  }
  const reads = readKeys(issues, taskId, raw.reads, "reads");
  const writes = readKeys(issues, taskId, raw.writes, "writes");
  for (const key of reads) {
    if (writes.includes(key)) {
      addIssue(issues, "contradictory_resource", taskId, `${key} is listed as both read and write; declare it under writes only`);
    }
  }
  return { reads, writes };
}

function readCheck(issues: Issues, taskId: string, gateId: string, raw: unknown): VerificationCheck | null {
  const invalid = (reason: string): null => {
    addIssue(issues, "invalid_verification", taskId, `gate "${gateId}": ${reason}`);
    return null;
  };
  if (!isRecord(raw)) return invalid("check must be an object");
  if (raw.kind === "command") {
    const command = typeof raw.command === "string" ? raw.command.trim() : "";
    if (!command || command.length > MAX_COMMAND) return invalid(`command must be 1-${MAX_COMMAND} characters`);
    if (raw.timeoutSeconds === undefined) return { kind: "command", command };
    const timeoutSeconds = readInteger(
      issues, taskId, raw.timeoutSeconds, 1,
      { min: 1, max: MAX_GATE_TIMEOUT_SECONDS }, "invalid_verification", `gate "${gateId}" timeoutSeconds`,
    );
    return { kind: "command", command, timeoutSeconds };
  }
  if (raw.kind === "artifact") {
    const path = normalizeResourceKey(raw.path);
    if (path === null || path === PROJECT_ROOT_KEY || isNamedResourceKey(path)) {
      return invalid("artifact path must be a project-relative file");
    }
    return { kind: "artifact", path };
  }
  return invalid('kind must be "command" or "artifact"');
}

function readGates(issues: Issues, taskId: string, raw: unknown): VerificationGate[] {
  if (raw === undefined || (Array.isArray(raw) && raw.length === 0)) {
    addIssue(issues, "missing_verification", taskId, "every task needs at least one verification gate");
    return [];
  }
  if (!Array.isArray(raw) || raw.length > MAX_GATES) {
    addIssue(issues, "invalid_verification", taskId, `verification must be an array of at most ${MAX_GATES} gates`);
    return [];
  }
  const gates: VerificationGate[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) {
      addIssue(issues, "invalid_verification", taskId, "each gate must be an object");
      continue;
    }
    const id = typeof item.id === "string" ? item.id : "";
    if (!ID_PATTERN.test(id) || seen.has(id)) {
      addIssue(issues, "invalid_verification", taskId, `gate id ${describeEntry(item.id)} is invalid or duplicated`);
      continue;
    }
    seen.add(id);
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label || label.length > 200) {
      addIssue(issues, "invalid_verification", taskId, `gate "${id}" needs a label of 1-200 characters`);
      continue;
    }
    if (item.required !== undefined && typeof item.required !== "boolean") {
      addIssue(issues, "invalid_verification", taskId, `gate "${id}" required must be a boolean`);
      continue;
    }
    const check = readCheck(issues, taskId, id, item.check);
    if (check) gates.push({ id, label, required: item.required !== false, check });
  }
  return gates;
}

function findCycle(tasks: readonly NormalizedPlanTask[], done: ReadonlySet<string>): string[] {
  const dependsOn = new Map(tasks.map((task) => [task.id, task.dependsOn] as const));
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): string[] | null => {
    if (onStack.has(id)) return [...stack.slice(stack.indexOf(id)), id];
    if (done.has(id) || visited.has(id)) return null;
    visited.add(id);
    onStack.add(id);
    stack.push(id);
    for (const dep of dependsOn.get(id) ?? []) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    onStack.delete(id);
    return null;
  };
  for (const task of tasks) {
    const found = visit(task.id);
    if (found) return found;
  }
  return [];
}

/** Deterministic topological order: the earliest-defined ready task goes first. */
function topologicalOrder(tasks: readonly NormalizedPlanTask[], issues: Issues): string[] {
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < tasks.length) {
    const next = tasks.find((task) => !done.has(task.id) && task.dependsOn.every((dep) => done.has(dep)));
    if (!next) break;
    done.add(next.id);
    order.push(next.id);
  }
  if (order.length < tasks.length) {
    const cycle = findCycle(tasks, done);
    addIssue(issues, "cycle", cycle[0] ?? null, `dependency cycle: ${cycle.join(" -> ")}`);
  }
  return order;
}

export function validatePlanGraph(input: unknown): PlanGraphResult {
  const issues: Issues = [];
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ code: "invalid_shape", taskId: null, message: "tasks must be an array" }] };
  }
  if (input.length === 0) {
    return { ok: false, issues: [{ code: "empty_plan", taskId: null, message: "a plan needs at least one task" }] };
  }
  if (input.length > ORCHESTRATION_LIMITS.maxTasks) {
    return {
      ok: false,
      issues: [{ code: "too_many_tasks", taskId: null, message: `a plan may contain at most ${ORCHESTRATION_LIMITS.maxTasks} tasks` }],
    };
  }

  const tasks: NormalizedPlanTask[] = [];
  const seen = new Set<string>();
  input.forEach((raw: unknown, index: number) => {
    const label = `task #${index + 1}`;
    if (!isRecord(raw)) {
      addIssue(issues, "invalid_shape", null, `${label} must be an object`);
      return;
    }
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!ID_PATTERN.test(id)) {
      addIssue(issues, "invalid_task_id", null, `${label} needs an id of letters, digits, ".", "_" or "-" (max 64)`);
      return;
    }
    if (seen.has(id)) {
      addIssue(issues, "duplicate_task_id", id, `task id "${id}" is used more than once`);
      return;
    }
    seen.add(id);
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title || title.length > MAX_TITLE) addIssue(issues, "invalid_title", id, `title must be 1-${MAX_TITLE} characters`);
    if (raw.description !== undefined && typeof raw.description !== "string") {
      addIssue(issues, "invalid_shape", id, "description must be a string");
    }
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    if (description.length > MAX_DESCRIPTION) {
      addIssue(issues, "invalid_description", id, `description must be at most ${MAX_DESCRIPTION} characters`);
    }
    tasks.push({
      id,
      title,
      description,
      dependsOn: readDependencies(issues, id, raw.dependsOn),
      claims: readClaims(issues, id, raw.resources),
      maxAttempts: readInteger(
        issues, id, raw.maxAttempts, ORCHESTRATION_LIMITS.defaultAttempts,
        { min: ORCHESTRATION_LIMITS.minAttempts, max: ORCHESTRATION_LIMITS.maxAttempts }, "invalid_attempts", "maxAttempts",
      ),
      timeoutSeconds: readInteger(
        issues, id, raw.timeoutSeconds, ORCHESTRATION_LIMITS.defaultTimeoutSeconds,
        { min: ORCHESTRATION_LIMITS.minTimeoutSeconds, max: ORCHESTRATION_LIMITS.maxTimeoutSeconds },
        "invalid_timeout", "timeoutSeconds",
      ),
      priority: readInteger(
        issues, id, raw.priority, 0,
        { min: -ORCHESTRATION_LIMITS.maxPriority, max: ORCHESTRATION_LIMITS.maxPriority }, "invalid_priority", "priority",
      ),
      verification: readGates(issues, id, raw.verification),
    });
  });

  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (dep === task.id) addIssue(issues, "self_dependency", task.id, `task "${task.id}" cannot depend on itself`);
      else if (!ids.has(dep)) addIssue(issues, "missing_dependency", task.id, `task "${task.id}" depends on unknown task "${dep}"`);
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const order = topologicalOrder(tasks, issues);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, tasks, order };
}
