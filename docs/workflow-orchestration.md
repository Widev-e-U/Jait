# Plan orchestration (dependency-ordered runs)

The TypeScript gateway runs approved plans as dependency-ordered workflow runs. Each task runs as a real agent worker. Writing tasks work in isolated git worktrees, and their verified changes are integrated into a run-specific branch for review. Nothing is pushed, and nothing is merged into the user's branch.

The engine is general-purpose. It has no built-in knowledge of Rust, TypeScript or any migration workflow. A workflow is an approved plan with tasks, dependencies, resource claims and gates.

## Components

| Module (`packages/gateway/src/services/orchestration/`) | Role |
| --- | --- |
| `dag.ts` | Plan validation: ids, duplicates, dependencies, cycles, resource claims, gates, approval. Deterministic, no LLM. |
| `state-machine.ts` | Task transitions and run status derivation. |
| `scheduler.ts`, `resources.ts` | Bounded dispatch and resource-claim conflicts. |
| `orchestrator.ts` | `OrchestrationService`: create, dispatch, attempts, gates, integration, resume, retry, cancel, halt, restart recovery. |
| `executor.ts` | Prompt and report contract. `SubAgentTaskExecutor` runs one attempt through an injected runner. |
| `in-process-worker.ts` | Real worker: the owner's in-process Jait provider through `agent.spawn`, with tools limited by workspace mode. |
| `workflow-tool-guard.ts` | Deterministic check of each worker tool call against its workspace and claims, before consent. |
| `workspace.ts` | Git worktrees for the run: integration branch, task branches, scope check, commit, sync and integration merge. Reuses `GitService.createWorktree` and `gitExecArgs`. |
| `command-verifier.ts` | Gate runners. Command gates use the consent-aware executor. `createWorkflowVerifier` dispatches artifact and command gates. |
| `artifact-verifier.ts` | Artifact gates. Paths must resolve inside the workspace (or the repository root when there is none). |
| `agent-report.ts` | Report validation, redaction and bounds. |
| `store.ts` | Transactional, fenced persistence (compare-and-set on the attempt id). |
| `routes/plan-runs.ts` | HTTP surface. |

## Model

- A **plan** (`automation_plans`) is the definition. Plans are edited as before.
- A **run** (`orchestration_runs`) is one execution. It stores a validated snapshot, so later plan edits never change a run and history is never overwritten.
- Each task has a **task run** row (`orchestration_task_runs`). Each attempt has an **attempt** row (`orchestration_attempts`), kept as history. Attempts record the worker ID, the workspace path, the report, gate outcomes, errors and timestamps.
- `PlanTask.status` (`proposed | approved | running | completed | skipped`) is the human approval state. Execution state is separate.

## Task states

| State | Meaning | Final |
| --- | --- | --- |
| `pending` | Waiting for a dependency to pass | no |
| `ready` | All dependencies passed; waiting for a worker and free resources | no |
| `running` | An attempt holds a worker, its claims and its workspace | no |
| `verifying` | The agent reported `completed`; deterministic gates are running | no |
| `passed` | Every required gate passed and, for writers, the work is integrated | yes |
| `failed` | Attempt budget spent, the agent reported a blocker, or a gate failed | no (operator retry) |
| `blocked` | A dependency failed, is blocked or was cancelled | no |
| `cancelled` | Stopped by the operator | yes |
| `interrupted` | Outcome unknown after restart, halt or timeout, or an integration conflict; held for inspection | no (operator decision) |

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

- **Only approved tasks run.** A run is refused before anything is persisted if any task is not `approved` (`task_not_approved`).
- **Tasks with resources need an owned gateway-local repository.** A plan with writes or reads, from a repository the owner does not own or that is not gateway-local, is refused at creation (`workspace_required`).
- **Completion is not success.** A valid `completed` report only moves the task to `verifying`.
- **Gates come from the plan.** Agent reports cannot add, change or skip gates, and reports that claim `verified`, `passed`, `state` or `verification` are rejected.
- **Reports are validated.** The report must match the task and attempt id. Unknown fields, bad statuses, unsafe paths and oversized content are rejected. Rejected reports count as failed attempts, never as success.
- **Fenced writes.** Every outcome is a compare-and-set on the current attempt id. A late report from a superseded, halted or cancelled attempt changes nothing.
- **No blind re-runs.** A restart, halt or timeout leaves unknown outcomes `interrupted`. Only an operator decision (`retry` or `fail`, with an inspection note) moves them on. Resume refuses while the stopped executor is still running.
- **Failing gates retry** while the attempt budget lasts. The next attempt receives the previous error and gate outcomes as data.
- **Halts pause.** Halting an owner stops their attempts as `interrupted` and pauses their runs. Un-halting does not restart anything.
- **Fail closed.** Without a verification runner, no gate can pass. Without a consent-aware executor, command gates cannot pass.

## Verification gates

Gates run in this order before a task can advance:

1. **Scope gate** (writers only, `system:scope`). Every changed path, untracked files included, must fall under the task's declared writes. Otherwise the attempt fails, and the detail lists the paths.
2. **Plan gates.** Each gate runs in the attempt's workspace. Artifact gates check that a regular file exists inside it. Command gates run through the consent-aware executor (`terminal.run`, `requestedBy: "workflow"`, never full-access). The command comes only from the approved plan snapshot. An agent cannot propose or change it.
3. **Integration** (writers only, `system:integration`). Only after all required gates pass, see below.

A required gate that fails fails the attempt. Optional gates are recorded but do not block. Verification evidence is stored with each attempt.

Command gates can write files too. The scope check runs again at integration, so an unignored file outside the declared writes that a command leaves behind blocks integration and holds the task. Build outputs that git ignores do not count.

## Scheduling

- `selectDispatch` starts ready tasks by priority, then definition order. It respects `maxWorkers` per run, a process-wide cap and a per-owner cap.
- Resource claims: `writes` conflicts with any overlapping `reads` or `writes`. `reads` never conflict with each other. Paths overlap by segment (`src` covers `src/lib.rs`, not `srcx`). `name:<id>` resources match exactly.
- A task without a `resources` field claims the whole project for writing and therefore runs alone. `resources: {}` declares no claims.
- Tasks holding a worker keep their claims until their executor actually settles, even if the stored state says `interrupted`.

## Workspaces and integration

Writing tasks never touch the user's checkout or branch.

- **Run branches.** The integration branch is `jait/wf/<runId>/integration`. It is created from the repository's `HEAD` commit at its first use. Each writing task has its own branch, `jait/wf/<runId>/t-<slug>-<hash>`. The hash keeps task ids that differ only by punctuation apart.
- **Worktrees.** They live under `<state>/worktrees/workflows/<runId>/`, which is inside Jait's managed worktree root. Worktrees are kept after the run so they can be reviewed. Nothing deletes them automatically.
- **Start.** A writing task's worktree starts from the current integration head. A dependent therefore sees its predecessors' integrated changes. An existing worktree (a retry) first checkpoints its in-scope leftovers as a `wip:` commit. Leftovers outside the declared writes fail the attempt. The integration head is then merged into the task branch.
- **Integration.** After the gates pass, the in-scope changes are committed on the task branch. The branch is merged into the integration branch with `--no-ff`. Integrations are serialized per run.
- **Conflicts.** A conflicting merge is aborted, so the integration branch is unchanged. The task becomes `interrupted` with the conflicting files listed, and an operator decides. Conflicts are never resolved with destructive git commands.
- **Reading.** A task with reads but no writes runs against the integration worktree and cannot change it.
- **Not done automatically:** pushing, merging into `main` or the user's branch, deleting worktrees.
- A merge left in progress by a crash is aborted before the next operation on that worktree.

## Agent execution

- The worker uses the owner's selected in-process Jait model through the same sub-agent path as `agent.spawn`. Its tool set depends on the task:
  - no resources: no tools;
  - reads only: `file.read`, `file.list`;
  - writes: `file.read`, `file.list`, `file.write`, `file.patch`.
- The prompt states the task, its access and its checks, the completed dependencies as data, and the previous failure if this is a repair attempt. It also states the exact report contract.
- Each tool call is checked deterministically first (`workflow-tool-guard.ts`). The path must resolve inside the workspace, must not escape through a symlink, and must fall under the declared reads or writes. Only then does the call go to the consent-aware executor, which applies the usual approvals. A refused call returns a tool error to the agent.
- A worker that cannot start, or is aborted, leaves its outcome unknown, so the attempt becomes `interrupted`.
- Ordinary chat and sub-agents keep their previous behaviour. `agent.spawn` only takes an optional executor, which workflow workers alone pass.

## Persistence and recovery

- Migration 79 (`plan_orchestration_runs`) holds `orchestration_runs`, `orchestration_task_runs` and `orchestration_attempts`. No new migration was added, because the Rust gateway's reviewed contract corpus pins migration 79. Workspace identity is deterministic (run id and task id), so the existing `worktree_ref` columns hold the path and git holds the branches.
- After a restart, `recoverAfterRestart` interrupts unfinished attempts and pauses unfinished runs. Nothing re-runs on its own. Operators inspect the task, then retry or fail it.
- A worker that was still running at the restart cannot overwrite the recovered state, because its attempt id is no longer current.
- Owners only see their own runs. Cross-owner access returns not found.

## HTTP controls

- `POST /api/plans/:id/runs` starts the approved plan snapshot. Send `{}` for defaults, or `maxWorkers`.
- `GET /api/plan-runs` lists the owner's runs.
- `GET /api/plan-runs/:runId` returns task states, dependencies, worker IDs, workspace references and results.
- `GET /api/plan-runs/:runId/tasks/:taskId/attempts` returns the attempt history, with worker IDs, workspace paths, reports and gate outcomes.
- `POST /api/plan-runs/:runId/cancel` cancels the run. Running attempts are signalled, and their late reports are ignored.
- `POST /api/plan-runs/:runId/resume` takes `decisions` for interrupted tasks: `taskId`, `decision` (`retry` or `fail`) and an inspection `note`.

## Limits

| Setting | Range | Default |
| --- | --- | --- |
| Tasks per plan | max 100 | — |
| `maxWorkers` per run | 1–8 | 2 |
| `maxAttempts` per task | 1–5 | 2 (plus one operator retry) |
| `timeoutSeconds` per attempt | 1–86400 | 1800 |
| `priority` | −10…10 | 0 |
| Verification gates per task | 1–20 (at least one required) | — |
| Changed paths per attempt | max 5000 | — |

## Security boundaries

- Owner isolation: runs, repositories and worktrees are owner-scoped. A worker never runs in another owner's context.
- Consent: every tool call and every command gate passes through the consent-aware executor. Irreversible commands always re-ask. Workflow requests never run in full-access mode, and the `scheduler` bypass does not apply to them.
- Halt: a global halt blocks new runs and new starts. Running attempts are interrupted, and nothing is integrated after a halt.
- Paths: workers cannot read or write outside their workspace, and the scope gate catches changes that escape their declared writes.
- A worktree is not a sandbox. It isolates git state, not processes. Command gates and worker tools still run with the gateway's permissions, subject to consent.

## Not built yet

- **Agent tools and UI for plan-run controls.** The HTTP routes above are the current surface. Chat tools and a UI panel are not built.
- **Workspace-aware ACP workers.** The in-process adapter is the only worker. ACP is not yet bound to worktrees.
- **Workflow templates** (migration, feature, research). The engine is generic and needs none of them.
- **Automatic worktree cleanup.** Worktrees are retained for review.
- **Post-integration verification.** Gates run in the writer's workspace before integration. The integration head is verified only when a later task runs its gates on it.
- **Consent visibility.** Consent prompts for workers appear under the session `workflow:<runId>`, not under the chat that started the run.
- **Process-level limits.** Zombie executors that ignore abort keep their slot until they settle. Child-process termination is not confirmed.
- **Single writer assumption.** One gateway process per database. Recovery is not safe against a second live process.
- **Pre-existing:** ordinary sub-agents still call the tool registry directly and do not pass through the consent executor. This change does not alter that path.

## Extension points

- `WorkspaceProvider` (`workspace.ts`) can be swapped for another isolation strategy.
- `VerificationRunner` (`orchestrator.ts`) can take new check kinds without touching the state machine.
- `SubAgentRunner` (`executor.ts`) can route tasks to another worker kind, such as ACP, and keep the same report contract.
