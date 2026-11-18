# Plan orchestration (dependency-ordered runs)

Status: core implemented in `packages/gateway/src/services/orchestration/`, covered by unit and service tests. Not yet wired to HTTP routes, agent tools, the UI, startup recovery, or a real executor. See "Not yet built".

## Model

- A **plan** (`automation_plans`) is the definition: tasks with `dependsOn`, resource claims, verification gates, attempt budget, timeout and priority. Plans are edited as before.
- A **run** (`orchestration_runs`) is one execution of a plan. It stores a validated snapshot of the definition, so later plan edits never change a run and historical results are never overwritten.
- Per run, each task has a **task run** row (`orchestration_task_runs`) and every attempt has an **attempt** row (`orchestration_attempts`), kept as history.
- `PlanTask.status` (`proposed | approved | running | completed | skipped`) remains the human approval state. Execution state is separate.

## Task states

| State | Meaning | Final |
| --- | --- | --- |
| `pending` | Waiting for a dependency to pass | no |
| `ready` | All dependencies passed; waiting for a worker and free resources | no |
| `running` | An attempt holds a worker and its resource claims | no |
| `verifying` | The agent reported `completed`; gates are running | no |
| `passed` | Every required gate passed | yes |
| `failed` | Attempt budget spent, or the agent reported a blocker | no (operator retry) |
| `blocked` | A dependency failed, is blocked or was cancelled | no |
| `cancelled` | Stopped by the operator | yes |
| `interrupted` | Outcome unknown after restart, halt or timeout | no (operator decision) |

Allowed transitions (anything else throws `InvalidTaskTransitionError`):

- `pending` → `ready`, `blocked`, `cancelled`
- `ready` → `running`, `cancelled`
- `running` → `verifying`, `ready`, `failed`, `interrupted`, `cancelled`
- `verifying` → `passed`, `ready`, `failed`, `interrupted`, `cancelled`
- `failed` → `ready` (operator retry, one attempt beyond `maxAttempts`)
- `blocked` → `ready`, `pending`, `cancelled`
- `interrupted` → `ready` (retry after inspection), `failed`, `cancelled`

Run status is derived from task states: any active task → `running`; any `interrupted` → `interrupted`; any `ready`/`pending` → `running`; all `passed` → `passed`; any `failed`/`blocked` → `failed`; otherwise `cancelled`. An operator cancel is sticky.

## Rules that are enforced

- **Completion is not success.** A valid `completed` report only moves the task to `verifying`. The task passes only when every required gate passes.
- **Gates come from the plan.** Agent reports cannot add, change or skip gates. Reports that try to set `verified`, `passed`, `state`, `verification` and similar fields are rejected.
- **Reports are validated.** The report must match the task and the attempt id. Unknown fields, bad statuses, unsafe paths and oversized content are rejected. Rejected reports count as failed attempts, never as success. Secrets are redacted (best effort).
- **Fenced writes.** Every attempt outcome is a compare-and-set on the current attempt id. A late report from a superseded or halted attempt changes nothing.
- **No blind re-runs.** A restart, halt or timeout leaves unknown outcomes as `interrupted`. Only an operator decision (`retry` or `fail`, with an inspection note) moves them on. Resume refuses while the stopped executor is still running.
- **Failing gates and failed reports** retry while the attempt budget lasts. The next attempt receives the previous error and gate outcomes as context.
- **Halts pause.** Halting an owner stops their attempts as `interrupted` and pauses their unfinished runs. Un-halting does not restart anything; an operator must resume.
- **Fail closed.** Without a configured verification runner, no gate can pass.
- **Cancel** marks unfinished tasks `cancelled`, signals the executor's abort signal and ignores later reports.

## Scheduling

- `selectDispatch` starts ready tasks in order of priority, then definition order. It respects `maxWorkers` per run, a process-wide cap and a per-owner cap.
- Resource claims: `writes` conflicts with any overlapping `reads` or `writes`; `reads` never conflict with each other. Paths overlap by segment (`src` covers `src/lib.rs`, not `srcx`). `name:<id>` resources match exactly.
- A task without a `resources` field claims the whole project for writing and therefore runs alone. `resources: {}` declares no claims.
- Tasks occupying a worker keep their claims until their executor actually settles, even if the stored state says `interrupted`.

## Limits

| Setting | Range | Default |
| --- | --- | --- |
| Tasks per plan | max 100 | — |
| `maxWorkers` per run | 1–8 | 2 |
| `maxAttempts` per task | 1–5 | 2 (plus one operator retry) |
| `timeoutSeconds` per attempt | 1–86400 | 1800 |
| `priority` | −10…10 | 0 |
| Verification gates per task | 1–20 (at least one required) | — |

## Persistence

Migration 79 (`plan_orchestration_runs`) adds three tables: `orchestration_runs`, `orchestration_task_runs` and `orchestration_attempts`. The migration is additive and idempotent. The Rust gateway's reviewed `migrations.json` is not regenerated, so this schema is TypeScript-only for now.

## Code map

- `packages/shared/src/types/orchestration.ts`: shared contracts (states, limits, claims, gates, reports, views).
- `services/orchestration/dag.ts`: plan validation, cycle detection with path, deterministic order.
- `services/orchestration/resources.ts`: claim keys, overlap and conflicts.
- `services/orchestration/state-machine.ts`: transitions and run status derivation.
- `services/orchestration/scheduler.ts`: dispatch selection and dependency propagation.
- `services/orchestration/agent-report.ts`: report validation, redaction, bounds.
- `services/orchestration/store.ts`: transactional, fenced persistence.
- `services/orchestration/orchestrator.ts`: `OrchestrationService` (create, dispatch, attempts, verification, resume, retry, cancel, halt, recovery).

## Not yet built

- **Executor adapter.** `TaskExecutor` is the seam. Nothing yet calls `agent.spawn` or the ACP runner through it.
- **Verification runner.** The default fails closed. Command gates must go through the existing consent and terminal path. Agent-proposed commands must never run.
- **Startup wiring.** `recoverAfterRestart()` must run at gateway boot, before any dispatch. It is not wired yet.
- **Halt wiring.** `stopForUser` must be registered as an `AgentControlService` stop hook.
- **Routes, agent tools and UI** (start, status, cancel, resume, inspect).
- **Worktree isolation** for parallel writers, and integration of finished changes.
- **Workflow templates** (migration, feature, research). The engine is generic and needs none of them.
- **Process-level limits** beyond the in-process caps. Zombie executors that ignore abort keep their slot until they settle; child-process termination is not confirmed.
- **Single writer assumption.** One gateway process per database. Recovery is not safe against a second live process.
