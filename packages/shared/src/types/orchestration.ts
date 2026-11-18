/**
 * Plan orchestration contracts: dependency-ordered runs of plan tasks with
 * bounded parallelism, resource claims, verification gates and recovery.
 * Shapes only; scheduling and persistence live in packages/gateway.
 */

export const ORCHESTRATION_TASK_STATES = [
  "pending", // waiting for at least one dependency to pass
  "ready", // dependencies passed; waiting for a worker slot and free resources
  "running", // an attempt holds a worker and its resource claims
  "verifying", // the agent reported completion; verification gates are running
  "passed", // every required gate passed (final)
  "failed", // attempts exhausted, or the agent reported a blocker
  "blocked", // a dependency failed, was blocked or was cancelled
  "cancelled", // stopped by the operator (final)
  "interrupted", // outcome unknown after restart, halt or timeout; needs inspection
] as const;
export type OrchestrationTaskState = (typeof ORCHESTRATION_TASK_STATES)[number];

export const ORCHESTRATION_RUN_STATES = ["running", "interrupted", "passed", "failed", "cancelled"] as const;
export type OrchestrationRunState = (typeof ORCHESTRATION_RUN_STATES)[number];

export const ORCHESTRATION_LIMITS = {
  maxTasks: 100,
  minWorkers: 1,
  defaultWorkers: 2,
  maxWorkers: 8,
  minAttempts: 1,
  defaultAttempts: 2,
  maxAttempts: 5,
  minTimeoutSeconds: 1,
  defaultTimeoutSeconds: 1800,
  maxTimeoutSeconds: 86_400,
  maxPriority: 10,
} as const;

/**
 * Declared resource use relative to the project root. "." is the whole project;
 * "name:<id>" is an opaque shared resource. Absent `resources` means "may write
 * the whole project", so such tasks run serially until they declare claims.
 */
export interface TaskResources {
  reads?: string[];
  writes?: string[];
  /**
   * Restriction inside `writes`, not a claim: nothing under these paths may be
   * created, changed or deleted, so a task cannot make a check pass by editing
   * or removing the tests. Entries are project-relative paths, or globs where `*`
   * and `?` stay inside one path segment and a `**` segment spans any number of
   * segments. An entry that names a directory protects everything below it.
   * Globs apply here only; `reads` and `writes` are literal paths.
   */
  protects?: string[];
}

export type VerificationCheck =
  | { kind: "command"; command: string; timeoutSeconds?: number }
  | { kind: "artifact"; path: string };

/** Gates are authored in the plan. Agent reports can never add or change them. */
export interface VerificationGate {
  id: string;
  label: string;
  /** Defaults to true; a failing required gate fails the attempt. */
  required?: boolean;
  check: VerificationCheck;
}

/** Execution settings a plan task adds to its definition. */
export interface OrchestrationTaskSpec {
  resources?: TaskResources;
  /** Attempts including repair attempts. Default 2, max 5. */
  maxAttempts?: number;
  timeoutSeconds?: number;
  /** Range -10..10; higher starts first among ready tasks. Default 0. */
  priority?: number;
  /** At least one gate is required; a task cannot pass without verification. */
  verification?: VerificationGate[];
}

export type AgentReportStatus = "completed" | "failed" | "blocked";

/**
 * Structured agent output, validated before use. `completed` starts
 * verification; it never marks a task passed by itself.
 */
export interface AgentTaskReport {
  taskId: string;
  attemptId: string;
  status: AgentReportStatus;
  summary: string;
  changedFiles: string[];
  artifacts: Array<{ path: string; kind?: string }>;
  error?: string;
  followUps: string[];
}

export interface VerificationOutcome {
  gateId: string;
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
}

export interface OrchestrationTaskView {
  taskId: string;
  title: string;
  state: OrchestrationTaskState;
  dependsOn: string[];
  /**
   * What the task owns while it runs: paths it may read and write, and paths inside its
   * writes it must leave untouched. A task that declared no resources shows writes ["."],
   * which is why it runs alone.
   */
  resources: { reads: string[]; writes: string[]; protects: string[] };
  attemptCount: number;
  maxAttempts: number;
  currentAttemptId: string | null;
  lastError: string | null;
  agentRef: string | null;
  worktreeRef: string | null;
  verification: VerificationOutcome[] | null;
  result: AgentTaskReport | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface OrchestrationAttemptView {
  id: string;
  attemptNo: number;
  state: Extract<OrchestrationTaskState, "running" | "verifying" | "passed" | "failed" | "interrupted" | "cancelled">;
  agentRef: string | null;
  worktreeRef: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  result: AgentTaskReport | null;
  verification: VerificationOutcome[] | null;
}

/** A consent prompt raised by a worker. It blocks that worker until the owner answers, or it is cancelled. */
export interface OrchestrationPendingApproval {
  id: string;
  toolName: string;
  summary: string;
  createdAt: string;
}

export interface OrchestrationRunView {
  id: string;
  planId: string | null;
  title: string;
  status: OrchestrationRunState;
  /** True while the run waits for an explicit operator resume (after restart or halt). */
  paused: boolean;
  maxWorkers: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  /** Session that holds the workers' consent prompts (`workflow:<runId>`), not the chat that started the run. */
  workerSessionId: string;
  /** Approvals the workers wait on now. Answer them in the worker session or they time out. */
  pendingApprovals: OrchestrationPendingApproval[];
  tasks: OrchestrationTaskView[];
}
