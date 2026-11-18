# Plan orchestration (dependency-ordered runs)

The TypeScript gateway runs approved plans as dependency-ordered workflow runs. Each task runs as a real agent worker. Writing tasks work in isolated git worktrees, and their verified changes are integrated into a run-specific branch for review. Nothing is pushed, and nothing is merged into the user's branch.

The engine is general-purpose. It has no built-in knowledge of Rust, TypeScript or any migration workflow. A workflow is an approved plan with tasks, dependencies, resource claims and gates.

## Components

| Module (`packages/gateway/src/services/orchestration/`) | Role |
| --- | --- |
| `dag.ts` | Plan validation: ids, duplicates, dependencies, cycles, resource claims, gates, approval. Deterministic, no LLM. |
| `state-machine.ts` | Task transitions and run status derivation. |
| `scheduler.ts`, `resources.ts` | Bounded dispatch, resource-claim conflicts and protected-path matching. |
| `orchestrator.ts` | `OrchestrationService`: create, dispatch, attempts, gates, integration, resume, retry, cancel, halt, restart recovery. |
| `executor.ts` | Prompt and report contract. `SubAgentTaskExecutor` runs one attempt through an injected runner. |
| `in-process-worker.ts` | Real worker: the owner's in-process Jait provider through `agent.spawn`, with tools limited by workspace mode. |
| `acp-worker.ts` | ACP coding-agent worker: one supervised turn of an ACP provider in the task's worktree, with each approval on the workflow's consent path. |
| `worker-router.ts` | Picks the runner from the task's `worker` kind. A kind whose runner is not bound fails closed. |
| `workflow-tool-guard.ts` | Deterministic check of each worker tool call against its workspace and claims, before consent. |
| `workspace.ts` | Git worktrees for the run: integration branch, task branches, scope check, commit, sync and integration merge. Reuses `GitService.createWorktree` and `gitExecArgs`. |
| `command-verifier.ts` | Gate runners. Command gates use the consent-aware executor. `createWorkflowVerifier` dispatches artifact and command gates. |
| `artifact-verifier.ts` | Artifact gates. Paths must resolve inside the workspace (or the repository root when there is none). |
| `agent-report.ts` | Report validation, redaction and bounds. |
| `store.ts` | Transactional, fenced persistence (compare-and-set on the attempt id). |
| `routes/plan-runs.ts` | HTTP surface. |
| `tools/plan-run-tools.ts` | Chat tools `plan.run.*` over the same service as the HTTP surface. |

## Inventory and decisions

What JAIT already had when this work started, and what was decided about it.

| Existing | Decision |
| --- | --- |
| `PlanTask.dependsOn`, `automation_plans` | Kept as the plan definition. Execution settings (`resources`, `verification`, limits) extend `PlanTask`, and plans are edited as before. No second plan model. |
| `agent.spawn` in-process sub-agents | Reused as the worker path. `agent.spawn` gained one optional executor hook that only workflow workers pass, so ordinary chats and sub-agents behave as before. The worker's sub-agent id is stored on the attempt. |
| ACP coding agents (Codex, Claude Code) | Bound as an optional worker for tasks that declare `worker: { kind: "acp", providerId }`. It reuses `runAcpSpecialistTurn`, the same prompt, report contract and gates. See [ACP workers](#acp-workers). |
| `GitService.createWorktree`, `gitExecArgs` | Reused for task and integration worktrees. No new git layer, and no push, merge into `main` or destructive command. |
| Consent executor, tool profiles, audit | Every worker tool call and every command gate goes through it. Workflow requests never run in full-access mode. |
| `AgentControlService` halt | Honored at dispatch and for running attempts. Un-halting restarts nothing. |
| SQLite migration 79 | Holds the run, task and attempt tables. No further migration, because the Rust gateway's reviewed contract corpus pins 79. |
| Code graph | Not used by the engine. Explicit tasks and dependencies work without it, and a plan author may use the graph to draft them. |
| Tool parallelism in `agent-loop.ts` | Untouched. Workflows have their own resource-aware scheduler, so ordinary chats cannot regress. |

Missing, and built here: dependency-ordered runs, bounded resource-aware dispatch, validated agent reports, deterministic gates before advancement, scoped worktrees with reviewable integration, restart recovery that never re-runs blind, and owner-scoped HTTP and chat controls.

Risks that shaped the design: a worktree isolates git state but is not a sandbox, so consent and path checks still apply; the Rust migration pins migration 79 and the reviewed tool profiles, so neither was changed here and nothing in this work claims that migration is done; and one gateway process per database is assumed.

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
- **Protected paths.** A writer cannot create, change or delete anything under its `protects`, even inside its writes. The tool guard refuses the call before consent, and the scope gate catches anything else, such as a file a gate command rewrote. See [Protecting tests](#protecting-tests).

## Verification gates

Gates run in this order before a task can advance:

1. **Scope gate** (writers only, `system:scope`). Every changed path, untracked files included, must fall under the task's declared writes and must not touch a protected path. Otherwise the attempt fails, and the detail lists the paths. Deleted files are listed in the detail either way, so a removal is always visible in the evidence.
2. **Plan gates.** Each gate runs in the attempt's workspace. Artifact gates check that a regular file exists inside it. Command gates run through the consent-aware executor (`terminal.run`, `requestedBy: "workflow"`, never full-access). The command comes only from the approved plan snapshot. An agent cannot propose or change it.
3. **Integration** (writers only, `system:integration`). Only after all required gates pass, see below.

A required gate that fails fails the attempt. Optional gates are recorded but do not block. Verification evidence is stored with each attempt.

**Command gates finish or stop, and never guess.** A gate's command runs in the foreground until it finishes or hits the gate's timeout. The result is its own exit code, from the shell's completion marker (OSC 633 `D`). A prompt-looking line is never treated as completion, and a command that yields to the background never passes. A shell without shell integration therefore runs its command to the deadline, and the gate fails.

**Stopping reaches the command.** Cancel, halt, timeout and an abort during the gate all send Ctrl+C. If the command is still running after 2 seconds, its terminal is stopped, which ends the shell and its children. The attempt keeps its worker and claims until the terminal reports its exit, so a late write from a stopped command cannot overlap the next attempt. If the terminal never reports an exit, the worker stays held until a restart, as with any executor that ignores its stop.

**Approvals of a stopped attempt are denied.** A workflow approval still pending when its attempt stops is denied at once and its prompt disappears. Ordinary chat approvals are unchanged.

Command gates can write files too. The scope check runs again at integration, so an unignored file outside the declared writes, or a change a command makes to a protected path, blocks integration and holds the task. Build outputs that git ignores do not count.

## Protecting tests

The engine does not know what a test is, so the plan says which paths a writer must leave alone. List them under `resources.protects`:

```json
{
  "id": "fix-parser",
  "resources": { "writes": ["src"], "protects": ["src/**/*.test.ts", "tests"] },
  "verification": [{ "id": "unit", "label": "Unit tests", "check": { "kind": "command", "command": "npm test" } }]
}
```

- An entry is a project-relative path or a glob. `*` and `?` stay inside one path segment, and a `**` segment spans any number of segments. A directory entry protects everything below it. Globs apply to `protects` only; `reads` and `writes` stay literal paths.
- Protected means untouchable: nothing there may be created, changed or deleted. To let a task add new tests, protect the existing files or a narrower pattern instead of the whole directory.
- A plan is refused when `protects` is not a list of at most 50 safe paths or globs, when the task has no write path, or when a plain path covers a whole `writes` entry, because the task could then never write it.
- Three checks enforce it. The prompt names the protected paths. The tool guard refuses a worker's write there before consent is asked. The scope gate fails the attempt when git shows a protected path changed, and integration checks again.
- A violation leaves the writer's worktree as it is. The next attempt stops at those leftover changes (`workspace has changes in protected paths`), so the task ends `failed` until an operator cleans the worktree and retries. The weakened test is never committed or integrated.

## Scheduling

- `selectDispatch` starts ready tasks by priority, then definition order. It respects `maxWorkers` per run, a process-wide cap and a per-owner cap. A per-owner, per-provider cap (`perProviderMaxWorkers`, default 2) applies to each task's provider: the owner's in-process Jait provider for in-process tasks, and each ACP provider for ACP tasks. A ready task whose provider is at its cap waits and does not hold a slot. Only workflow attempts count, so ordinary chats are not throttled.
- Resource claims: `writes` conflicts with any overlapping `reads` or `writes`. `reads` never conflict with each other. Paths overlap by segment (`src` covers `src/lib.rs`, not `srcx`). `name:<id>` resources match exactly.
- A task without a `resources` field claims the whole project for writing and therefore runs alone. `resources: {}` declares no claims.
- `protects` is a restriction, not a claim. It never conflicts with other tasks, so two tasks can protect the same tests.
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
- The prompt states the task, its access and its checks, the completed dependencies as data, and the previous failure if this is a repair attempt. It names any protected paths and says that existing tests and checks must not be removed, skipped or weakened to make a check pass. It also states the exact report contract.
- Each tool call is checked deterministically first (`workflow-tool-guard.ts`). The path must resolve inside the workspace, must not escape through a symlink, and must fall under the declared reads or writes. A write must not touch a protected path. Only then does the call go to the consent-aware executor, which applies the usual approvals. A refused call returns a tool error to the agent.
- A worker that cannot start, or is aborted, leaves its outcome unknown, so the attempt becomes `interrupted`.
- Ordinary chat and sub-agents keep their previous behaviour. `agent.spawn` only takes an optional executor, which workflow workers alone pass.

## ACP workers

A task with `"worker": { "kind": "acp", "providerId": "claude-code" }` runs its attempt as one turn of an ACP coding agent, in the task's own worktree. Tasks without `worker` keep the in-process worker.

- The task must declare writes. Its changes then always land in an isolated worktree and pass the scope gate. A task without writes is refused at creation (`invalid_worker`).
- The provider must offer supervised mode. A provider that only offers full access is never started.
- Jait's own MCP tools are not offered to the agent, so the agent's tools are only its own. Each of them that needs approval asks first.
- Each approval is a consent request on the run's workflow session (`workflow:<runId>`), where the owner answers it. A refusal reaches the agent. A stopped attempt denies its pending requests at once.
- Only a finished turn is an answer. A timeout, a stop, a failed start or a transport error leaves the outcome unknown, so the attempt is `interrupted`.
- The attempt records its worker as `acp:<providerId>:<attemptId>`.
- Each ACP provider has its own per-owner concurrency cap, so a coding agent never takes an in-process worker's slot.
- After a restart, an ACP attempt is interrupted like any other. The workflow does not reattach to the agent's session.

## Persistence and recovery

- Migration 79 (`plan_orchestration_runs`) holds `orchestration_runs`, `orchestration_task_runs` and `orchestration_attempts`. No new migration was added, because the Rust gateway's reviewed contract corpus pins migration 79. Workspace identity is deterministic (run id and task id), so the existing `worktree_ref` columns hold the path and git holds the branches.
- After a restart, `recoverAfterRestart` interrupts unfinished attempts and pauses unfinished runs. Nothing re-runs on its own. Operators inspect the task, then retry or fail it.
- A worker that was still running at the restart cannot overwrite the recovered state, because its attempt id is no longer current.
- Owners only see their own runs. Cross-owner access returns not found.

## HTTP controls

- `POST /api/plans/:id/runs` starts the approved plan snapshot. Send `{}` for defaults, or `maxWorkers`.
- `GET /api/plan-runs` lists the owner's runs.
- `GET /api/plan-runs/:runId` returns task states, dependencies, the resources each task owns (`reads`, `writes`, `protects`), worker IDs, workspace references and results.
- `GET /api/plan-runs/:runId/tasks/:taskId/attempts` returns the attempt history, with worker IDs, workspace paths, reports and gate outcomes.
- `POST /api/plan-runs/:runId/cancel` cancels the run. Running attempts are signalled, and their late reports are ignored.
- `POST /api/plan-runs/:runId/resume` takes `decisions` for interrupted tasks: `taskId`, `decision` (`retry` or `fail`) and an inspection `note`.
- The run view also carries `workerSessionId` (`workflow:<runId>`, where the workers' consent prompts appear) and `pendingApprovals` (the prompts the workers wait on now).

## Chat tools

The same service backs these tools. They are offered only when the HTTP controls are.

| Tool | Purpose |
| --- | --- |
| `plan.run.start` | Start an approved plan. Workers still ask for each tool call. |
| `plan.run.resume` | Resume an interrupted run with one decision per interrupted task. |
| `plan.run.list`, `plan.run.status`, `plan.run.attempts` | Read runs, tasks, workers, errors and pending approvals. |
| `plan.run.cancel` | Stop a run. Stopping is the safe direction. |

Consent: the tools are not in the reviewed permission profiles (`tool-profiles.ts`), so the security profile treats every call as dangerous and asks each time. That includes the read tools.

Review of the read tools (`plan.run.list`, `plan.run.status`, `plan.run.attempts`): each one only reads runs the caller owns, so each is a candidate for consent `none` in all three profiles. The profiles are pinned by exact membership and order (`tests/contract/source-reviews.json`, cases `profile-minimal`, `profile-coding`, `profile-full`). Adding the reads therefore needs a reviewed contract update, together with the Rust side. `plan.run.start`, `plan.run.cancel` and `plan.run.resume` change state and should stay out of any read-only grant. Until that review lands, every call asks, which is the safe default.

Every tool is scoped to the calling owner. A refusal from the service comes back as a failed result, not an exception.

## Limits

| Setting | Range | Default |
| --- | --- | --- |
| Tasks per plan | max 100 | — |
| `maxWorkers` per run | 1–8 | 2 |
| `maxAttempts` per task | 1–5 | 2 (plus one operator retry) |
| `timeoutSeconds` per attempt | 1–86400 | 1800 |
| `priority` | −10…10 | 0 |
| Concurrent attempts per owner and provider (each ACP provider counts separately) | service option (`perProviderMaxWorkers`) | 2 |
| Verification gates per task | 1–20 (at least one required) | — |
| Protected entries per task | max 50 | — |
| Changed paths per attempt | max 5000 | — |

## Security boundaries

- Owner isolation: runs, repositories and worktrees are owner-scoped. A worker never runs in another owner's context.
- Consent: every in-process tool call and every command gate passes through the consent-aware executor. Each approval an ACP agent asks for is a consent request on the same workflow session, through the same consent manager. Irreversible commands always re-ask. Workflow requests never run in full-access mode, and the `scheduler` bypass does not apply to them.
- Halt: a global halt blocks new runs and new starts. Running attempts are interrupted, and nothing is integrated after a halt.
- Paths: workers cannot read or write outside their workspace, and the scope gate catches changes that escape their declared writes.
- A worktree is not a sandbox. It isolates git state, not processes. Command gates and worker tools still run with the gateway's permissions, subject to consent.

## Not built yet

- **UI panel for plan runs.** The chat tools and HTTP routes are the surfaces. No panel exists in the web app.
- **Workflow templates** (migration, feature, research). The engine is generic and needs none of them.
- **Automatic worktree cleanup.** Worktrees are retained for review.
- **Post-integration verification.** Gates run in the writer's workspace before integration. The integration head is verified only when a later task runs its gates on it.
- **Consent visibility.** Consent prompts for workers still appear under the session `workflow:<runId>`, not under the chat that started the run. The run view and `plan.run.status` name that session and list the pending prompts, but the starting chat does not show them.
- **Process-level limits.** A zombie executor that ignores abort keeps its slot until it settles or the gateway restarts. Command gates stop their terminal, but worker tools that spawn processes outside a gate are not covered. The in-process worker has no such tool.
- **Provider limits beyond concurrency.** The cap counts attempts. Quota windows reported by provider accounts are not read, and the in-process Jait backend reports none.
- **Tests that agents weaken, beyond what the plan protects.** Command gates come from the approved plan, so an agent cannot swap them, and `resources.protects` makes named tests untouchable. The engine still cannot tell a weakened test from a fixed one by itself, so a test inside a writer's `writes` that the plan did not protect can be edited or removed. Deletions are listed in the scope evidence. Files that change which tests run, such as a test runner's config, are protected only when the plan lists them. Review changed tests in the integration branch.
- **Interface manifest.** `tests/contract/interfaces.json` was last captured at v0.1.973 and has drifted since, in files this work did not touch. Migration 79 itself is unchanged: its `db_migration` fingerprint matches the pin. Recapturing is a reviewed baseline change. It must wait until unrelated working-tree edits are committed, or the baseline would include them.
- **Single writer assumption.** One gateway process per database. Recovery is not safe against a second live process.
- **Pre-existing:** ordinary sub-agents still call the tool registry directly and do not pass through the consent executor. This change does not alter that path.

## Extension points

- `WorkspaceProvider` (`workspace.ts`) can be swapped for another isolation strategy.
- `VerificationRunner` (`orchestrator.ts`) can take new check kinds without touching the state machine.
- `routeWorkers` (`worker-router.ts`) picks the `SubAgentRunner` per worker kind. A new kind needs a runner that keeps the same report contract, as the ACP runner does.
