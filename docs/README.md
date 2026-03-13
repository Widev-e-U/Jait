# Jait

> Just Another Intelligent Tool — for Developers.

Jait is a local-first AI developer agent that can execute tools (terminal/files/browser/network), stream activity, and run with human-in-the-loop controls.

**[Download & Install](https://jait.dev)** · [Releases](https://github.com/JakobWl/Jait/releases)

---

## Install

### Option 1: npm (recommended)

```bash
npm install -g @jait/gateway
jait
```

Use `jait --port 9000` or `jait --help` for options.

### Option 2: Docker

```bash
docker run -d -p 8000:8000 -v jait-data:/data ghcr.io/jakobwl/jait-gateway
```

Or with docker compose:

```bash
curl -O https://raw.githubusercontent.com/JakobWl/Jait/main/docker-compose.yml
docker compose up -d
```

### Option 3: From source (for development)

```bash
git clone https://github.com/JakobWl/Jait
cd jait
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

## Downloads

| Platform | Download |
|----------|----------|
| Windows  | [Jait-Setup-x64.exe](https://github.com/JakobWl/Jait/releases/latest/download/Jait-Setup-x64.exe) |
| macOS    | [Jait-universal.dmg](https://github.com/JakobWl/Jait/releases/latest/download/Jait-universal.dmg) |
| Linux    | [Jait-x86_64.AppImage](https://github.com/JakobWl/Jait/releases/latest/download/Jait-x86_64.AppImage) |
| Android  | [jait-arm64-v8a.apk](https://github.com/JakobWl/Jait/releases/latest/download/jait-arm64-v8a.apk) |
| Web      | [app.jait.dev](https://app.jait.dev) |

## Connecting a client to your gateway

Every client (web, desktop, mobile) can configure its gateway URL:

1. Open the app
2. Go to **Settings → Gateway connection**
3. Enter your gateway's IP or domain (e.g. `http://192.168.1.100:8000`)
4. Click **Test & save**

The setting is stored locally per device. Leave it empty to use the default (`http://localhost:8000`).

---

## Repository Layout

- `packages/gateway` — Fastify gateway, tools, surfaces, scheduler, security, memory, DB
- `packages/shared` — shared schemas, constants, domain types
- `packages/api-client` — typed client for apps
- `apps/web` — Vite + React frontend
- `apps/desktop` / `apps/mobile` — device clients
- `e2e` — Playwright tests
- `docker` + `docker-compose.yml` — container stack

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
