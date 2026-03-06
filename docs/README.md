# Jait

> Just Another Intelligent Tool — for Developers.

Jait is a Bun/TypeScript monorepo for a local-first developer agent that can execute tools (terminal/files/browser/network), stream activity, and run with human-in-the-loop controls.

## Current Repository Layout

- `packages/gateway` — Fastify gateway, tools, surfaces, scheduler, security, memory, DB
- `packages/shared` — shared schemas, constants, domain types
- `packages/api-client` — typed client for apps
- `apps/web` — Vite + React frontend
- `apps/desktop` / `apps/mobile` — device clients
- `e2e` — Playwright tests
- `docker` + `docker-compose.yml` — container stack

## Quick Start

### 1) Install dependencies

```bash
bun install --frozen-lockfile
```

### 2) Configure environment

```bash
cp .env.example .env
```

Notes:
- Jait defaults to local-first behavior.
- Cloud providers (OpenAI/Google OAuth/etc.) are optional integrations.

### 3) Run development

```bash
bun run dev
```

## Core Commands

```bash
bun run build
bun run typecheck
bun run test
bun run lint
```

E2E:

```bash
cd e2e && npm test
```

## Documentation Map

- Vision: `docs/vision.md`
- Implementation plan: `docs/implementation-plan.md`
- Sprint baselines: `docs/sprint-baselines.md`
- Testing guide: `docs/testing.md`
- Sprint execution guide: `docs/agent-sprint-content-guide.md`
- Rules and principles: `docs/my-rules.md`
- Vision alignment review: `docs/vision-alignment-review.md`
- Local-first defaults policy: `docs/local-first-defaults.md`
- Screen share implementation status: `docs/screen-share-status.md`

## Scope and Philosophy

- Single-operator, local-first
- Deterministic execution over magic behavior
- Consent-first for high-impact actions
- Observability: what the agent does should be visible and auditable

For full product direction and roadmap details, use `docs/vision.md` and `docs/implementation-plan.md`.
