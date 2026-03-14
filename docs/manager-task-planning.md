# Manager Mode — Task Planning & Parallel Agent Orchestration

## Vision

Manager mode today lets a human type a task, which immediately creates and
starts an agent thread. This is "one task at a time, human-driven" — the
human decides *what* to do, types it, and waits.

**Task Planning** flips this: the AI proposes a *plan* of tasks (threads)
first, and the human reviews, adjusts, and selectively starts them. This
enables:

- **Parallelization** — start 3-5 threads simultaneously across a repo.
- **Human-in-the-loop** — the AI plans, the human approves.
- **Visibility** — see all planned work before any code is touched.
- **Iterative refinement** — edit tasks, reorder, add/remove before starting.

## Concepts

### Plan

A **Plan** is a list of proposed tasks scoped to a repository. Each plan is
persisted in the database so it survives page reloads. A repo can have one
active plan at a time (but completed plans are archived).

```
Plan
├── id (UUIDv7)
├── repoId (FK → automation_repositories)
├── userId
├── title ("Feature sprint", "Bug triage", …)
├── status: draft | active | completed | archived
├── tasks[] (JSON array stored as TEXT)
└── createdAt / updatedAt
```

### Task (within a Plan)

Each task inside a plan is a lightweight object:

```typescript
interface PlanTask {
  id: string              // short UUID
  title: string           // human-readable ("Add dark mode toggle")
  description: string     // detailed instruction for the agent
  status: 'proposed' | 'approved' | 'running' | 'completed' | 'skipped'
  threadId?: string       // set once a thread is created for this task
  dependsOn?: string[]    // optional task IDs this task waits for
}
```

- **proposed** — AI suggested it, human hasn't acted yet.
- **approved** — human clicked ✓, ready to start.
- **running** — a thread was created and is actively executing.
- **completed** — thread finished successfully.
- **skipped** — human decided not to run this task.

### Lifecycle

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  Human asks   │────▶│  AI generates │────▶│  Plan saved   │
│  "plan work"  │     │  task list    │     │  (draft)      │
└──────────────┘     └───────────────┘     └──────┬───────┘
                                                   │
                              ┌─────────────────────┘
                              ▼
                  ┌──────────────────────────┐
                  │  Human reviews tasks     │
                  │  ✓ approve  ✗ skip       │
                  │  ✏ edit  ▶ start         │
                  └───────────┬──────────────┘
                              │
                  ┌───────────▼──────────────┐
                  │  ▶ Start approved tasks  │
                  │  (creates threads in     │
                  │   parallel, uses repo    │
                  │   strategy as context)   │
                  └───────────┬──────────────┘
                              │
                  ┌───────────▼──────────────┐
                  │  Threads run, report     │
                  │  back via WS events      │
                  │  Plan status auto-syncs  │
                  └──────────────────────────┘
```

## Data Model

### New table: `automation_plans`

| Column     | Type | Notes                                 |
|------------|------|---------------------------------------|
| id         | TEXT | PK, UUIDv7                            |
| repo_id    | TEXT | FK → automation_repositories.id       |
| user_id    | TEXT | Owner                                 |
| title      | TEXT | Plan display name                     |
| status     | TEXT | draft / active / completed / archived |
| tasks      | TEXT | JSON array of PlanTask objects         |
| created_at | TEXT | ISO timestamp                         |
| updated_at | TEXT | ISO timestamp                         |

Tasks are stored as a JSON column (TEXT) rather than a separate table,
keeping the schema simple and atomic. A plan with 20 tasks is ~4KB of JSON.

## API Endpoints

```
GET    /api/repos/:repoId/plans          — list plans for a repo
POST   /api/repos/:repoId/plans          — create a plan
GET    /api/plans/:id                     — get a plan
PATCH  /api/plans/:id                     — update plan (title, status, tasks)
DELETE /api/plans/:id                     — delete a plan
POST   /api/plans/:id/generate           — AI generates tasks for the plan
POST   /api/plans/:id/tasks/:taskId/start — start a single task (creates thread)
POST   /api/plans/:id/start              — start all approved tasks
```

## WS Events

```
plan.created   { plan }
plan.updated   { plan }
plan.deleted   { planId }
```

Thread events already broadcast status changes. The frontend maps
`thread.status` back to the owning plan task via `task.threadId`.

## Frontend UX

### Plan Button
A "Plan" icon button (📋 `ListChecks`) appears next to each repo in the
`ManagerRepositoryPanel`, alongside the existing Strategy button.

### Plan Modal
Opens a full modal with:
- **Title** — editable plan name
- **Task list** — each task shows:
  - Status badge (proposed/approved/running/completed/skipped)
  - Title (editable inline)
  - Description (expandable, editable)
  - Action buttons: ✓ Approve | ✗ Skip | ▶ Start | ✏ Edit
- **Footer actions**:
  - "Generate tasks" (AI) — calls `/generate` with optional prompt
  - "Start approved" — bulk-starts all approved tasks
  - "Save" — persists edits

### Thread List Integration
When tasks become threads, they appear in the normal thread list with a
plan badge. Clicking a running plan-task thread shows its activity feed
as usual.

## Strategy Integration

When a plan task starts a thread, the repo's **strategy** markdown is
automatically prepended to the agent's first message (already implemented
in the thread start route). This means agents always know:
- How to build/test
- Coding conventions
- Project structure

## Implementation Order

1. DB migration + schema for `automation_plans`
2. Backend service (`PlanService`) + REST routes
3. Frontend API client methods
4. `PlanModal` component with task list UI
5. Wire plan button into `ManagerRepositoryPanel`
6. AI plan generation endpoint
7. "Start task" flow — creates thread from plan task
8. WS event wiring for real-time plan updates
