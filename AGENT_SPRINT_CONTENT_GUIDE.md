# Agent Sprint Content Guide

Use this guide when implementing any sprint so work is not duplicated and existing material is reused first.

## Mandatory lookup order (always do this first)

1. Read `IMPLEMENTATION_PLAN.md` for sprint goals, tasks, and exit criteria.
2. Read `SPRINT_BASELINES.md` for prepared scaffolding and sprint mapping.
3. If implementing Sprint 10 or Sprint 12, review `E:\deskreen` before coding as the required working screen-sharing reference baseline.
4. Scan the sprint-specific package paths listed below for already-existing code, types, tests, and docs.
5. Reuse existing contracts/schemas/interfaces before adding new ones.
6. Add only the minimum new files needed for the sprint deliverable.

## Global content locations to check every sprint

- `packages/shared/src/`
  - Shared types, schemas, constants.
- `packages/gateway/src/`
  - Gateway runtime, routes, WS, and feature modules.
- `packages/api-client/src/`
  - Typed HTTP/WS client contracts.
- `apps/web/src/`
  - Frontend pages/components/hooks used by feature UIs.
- `e2e/tests/`
  - End-to-end coverage patterns and fixtures.
- `TESTING.md`
  - Testing guidance and command references.

## Sprint-specific lookup map

### Sprint 2 — Session Router & Audit Foundation

Check first:

- `packages/gateway/src/sessions/`
- `packages/gateway/src/security/`
- `packages/gateway/src/tools/`
- `packages/shared/src/types/`
- `packages/shared/src/schemas/`
- `apps/web/src/components/` and `apps/web/src/hooks/`

Look for reusable items:

- Session contracts and route patterns
- Action/audit type shapes
- Existing sidebar/list UI components

### Sprint 3 — Terminal Surface & File System

Check first:

- `packages/gateway/src/surfaces/`
- `packages/gateway/src/tools/`
- `packages/gateway/src/security/`
- `apps/web/src/components/` (terminal-related UI areas)

Look for reusable items:

- Surface lifecycle interfaces/registry
- Existing tool definition patterns
- Prior security/path boundary utilities

### Sprint 4 — Consent Manager & Tool Permissions

Check first:

- `packages/gateway/src/security/`
- `packages/gateway/src/tools/`
- `apps/web/src/components/`

Look for reusable items:

- Consent/trust/audit contracts
- Action card or queue-style UI primitives
- Tool execution envelope and status patterns

### Sprint 5 — Browser Surface & Web Tools

Check first:

- `packages/gateway/src/surfaces/`
- `packages/gateway/src/tools/`
- `packages/gateway/src/security/`
- `apps/web/src/components/`

Look for reusable items:

- Surface manager abstractions
- Tool I/O contracts
- Existing SSRF/security validation patterns

### Sprint 6 — Memory Engine

Check first:

- `packages/gateway/src/memory/`
- `packages/gateway/src/tools/`
- `packages/gateway/src/agent/` (if present)
- `packages/shared/src/types/` and `packages/shared/src/schemas/`

Look for reusable items:

- Memory service contracts
- Existing persistence conventions
- Existing source attribution fields

### Sprint 7 — Scheduling, Hooks & Webhooks

Check first:

- `packages/gateway/src/scheduler/`
- `packages/gateway/src/tools/`
- `packages/gateway/src/routes/` and `packages/gateway/src/server.ts`
- `apps/web/src/components/jobs/`

Look for reusable items:

- Scheduler service contracts
- Event/notification flow patterns
- Existing jobs UI components and API usage

### Sprint 10 — Screen Sharing (WebRTC)

Check first:

- `packages/screen-share/` (or planned target module locations)
- `packages/gateway/src/routes/` and `packages/gateway/src/tools/`
- `packages/shared/src/types/` and `packages/shared/src/schemas/`
- `E:\deskreen\src\features\DesktopCapturerSourcesService\index.ts`
- `E:\deskreen\src\features\SharingSessionService\index.ts`
- `E:\deskreen\src\server\index.ts`
- `E:\deskreen\src\server\darkwireSocket.ts`
- `E:\deskreen\src\renderer\src\features\PeerConnection\*`
- `E:\deskreen\src\client-viewer\src\features\PeerConnection\*`

Look for reusable ideas:

- Capture source lifecycle and refresh strategy
- Signaling channel event flow and connection ownership rules
- Peer connection setup/teardown and quality adaptation patterns
- Session and connected-device state handling

### Sprint 12 — React Native Mobile App

Check first:

- `apps/mobile/` and shared mobile-facing API contracts
- `packages/gateway/src/routes/`, `packages/gateway/src/tools/`, and `packages/shared/src/types/`
- `E:\deskreen\src\client-viewer\src\features\PeerConnection\*`
- `E:\deskreen\src\renderer\src\features\PeerConnection\*`

Look for reusable ideas:

- Viewer/control flow between host and remote device
- Mobile-friendly quality adaptation and reconnect behavior
- Input forwarding patterns that preserve control safety

### Sprint 8+ — CLI/Extensibility/Desktop/Mobile

Check first:

- `packages/` (for new package patterns)
- `apps/` (for app scaffolding patterns)
- `docker/` and compose files for runtime conventions
- root config files (`package.json`, `tsconfig.json`, `vitest.config.ts`)

Look for reusable items:

- Workspace package conventions
- Build/test script patterns
- Existing runtime/deployment assumptions

## Rules for agent execution

- Never start coding before completing the lookup order above.
- Prefer extending existing modules over creating parallel alternatives.
- If a needed contract exists, import it; do not redefine it.
- If you create a new module, include at least one focused test where practical.
- Keep changes sprint-scoped; avoid unrelated refactors.
- Deskreen is a reference implementation only; do not copy code verbatim.

## Suggested pre-flight checklist to copy into PRs

- [ ] I reviewed `IMPLEMENTATION_PLAN.md` for the target sprint.
- [ ] I reviewed `SPRINT_BASELINES.md` and reused applicable scaffolding.
- [ ] I checked sprint-specific paths for existing code before adding new files.
- [ ] For Sprint 10/12, I reviewed required `E:\deskreen` reference paths and documented Deskreen-to-Jait mapping decisions.
- [ ] I avoided duplicate contracts/types.
- [ ] I ran relevant tests/checks for changed areas.
