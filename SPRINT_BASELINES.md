# Sprint Baselines (3+)

This file sets up low-complexity scaffolding so upcoming sprints can plug in concrete implementations faster.

## What was prepared

### Gateway contract scaffolding

- `packages/gateway/src/surfaces/contracts.ts`
  - Base `Surface` interface and lifecycle models.
- `packages/gateway/src/surfaces/registry.ts`
  - Simple in-memory `SurfaceRegistry` for registration and lookup.
- `packages/gateway/src/security/contracts.ts`
  - Consent, trust, and audit contract shapes.
- `packages/gateway/src/tools/contracts.ts`
  - Tool execution contract (`ToolDefinition`, `ToolContext`, `ToolResult`).
- `packages/gateway/src/memory/contracts.ts`
  - Memory service contracts (`save/search/forget`).
- `packages/gateway/src/scheduler/contracts.ts`
  - Scheduler service contracts (`create/list/remove/trigger`).
- `packages/gateway/src/plugins/contracts.ts`
  - Plugin lifecycle contract (`setup/dispose`).
- `packages/gateway/src/sessions/contracts.ts`
  - Session router contract for create/list/activate.
- `packages/gateway/src/foundation.ts`
  - Barrel file exporting all baseline contracts.

## Sprint mapping

- **Sprint 3 (Surfaces, terminal, file system):** start from `surfaces/`, `tools/`, `sessions/`.
- **Sprint 4 (Consent & permissions):** start from `security/` contracts.
- **Sprint 5 (Browser tools):** plug browser surface/tool implementations into `surfaces/` and `tools/`.
- **Sprint 6 (Memory):** implement `MemoryService` behind SQLite-vec.
- **Sprint 7 (Scheduler/hooks/webhooks):** implement `SchedulerService` and wire to Fastify routes/events.
- **Sprint 8+ (Extensibility):** add plugin runtime based on `PluginModule`.

## Notes

- These are intentionally contracts + minimal registry only.
- No behavior changes were introduced to running routes/server.
- Safe to implement incrementally sprint-by-sprint.
