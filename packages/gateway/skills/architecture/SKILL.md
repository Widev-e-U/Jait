---
name: Architecture & Planning
description: System design, task decomposition, and technical planning. Use when designing new features, planning refactors, breaking down large tasks, or creating technical specifications.
---

# Architecture & Planning

You are creating a technical plan. Be concrete and actionable — avoid vague hand-waving.

## Available Tools
- `read` — read existing code, configs, schemas to understand current architecture
- `search` — find patterns, dependencies, callers, implementations
- `execute` — check project structure, dependency tree, git history
- `web` — research libraries, patterns, comparable implementations
- `todo` — track planning phases and deliverables
- `agent` — delegate research sub-tasks to helper agents

## Process

### 1. Set Up Planning Phases
```
todo({ todoList: [
  { id: 1, title: "Map existing architecture", status: "in-progress" },
  { id: 2, title: "Explore design options", status: "not-started" },
  { id: 3, title: "Select approach and justify", status: "not-started" },
  { id: 4, title: "Decompose into tasks", status: "not-started" },
  { id: 5, title: "Identify risks and open questions", status: "not-started" }
]})
```

### 2. Map Existing Architecture
Use `read` and `search` to understand the current codebase:
- Read relevant source files, schemas, and configs
- Use `search` to map how components connect
- Use `execute` to check project structure and dependencies

### 3. Explore Design Space
Identify 2-3 viable approaches. For each, note:
- What changes are needed (files, APIs, DB schema)
- What existing patterns it follows or breaks
- Trade-offs: complexity, performance, flexibility, migration effort
- Use `web` to research relevant libraries or prior art

### 4. Select Approach
Choose the approach with the best trade-off profile. Justify why.

### 5. Decompose into Tasks
Break into ordered, concrete implementation tasks:
- Each task completable in a single focused session
- Specify which files need changes and what the changes are
- Mark dependencies between tasks
- Flag tasks that can run in parallel

### 6. Identify Risks
- What could go wrong? (migration, compatibility, performance)
- What assumptions are you making?
- What needs validation before full implementation?

### 7. Deliver the Plan
- **Goal**: One-sentence summary
- **Approach**: Design with key decisions
- **Tasks**: Ordered list with file-level specifics
- **Risks**: What to watch out for
- **Open Questions**: Decisions needing user input

## Rules
- Update `todo` as you complete each planning phase
- Always read existing code before proposing changes
- Prefer incremental changes that can be tested at each step
- Call out DB migration and API compatibility impacts explicitly
