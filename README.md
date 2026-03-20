# Jait

Local-first AI developer agent with terminal, filesystem, browser control, and automation.

Jait runs as a personal gateway and client stack for coding workflows. It can stream activity, execute tools with consent controls, work with local or remote providers, and keep sessions tied to your workspace instead of a hosted SaaS backend.

## Highlights

- Local-first gateway with SQLite-backed state
- Terminal, filesystem, browser, preview, and automation tools
- Human-in-the-loop approvals for sensitive actions
- Web, desktop, and mobile clients
- Support for local and hosted model providers

## Quick Start

### Install from npm

```bash
npm install -g @jait/gateway
jait
```

### Run from source

```bash
git clone https://github.com/JakobWl/Jait
cd Jait
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

## Core Commands

```bash
bun run build
bun run typecheck
bun run test
bun run lint
```

## Packages

- `packages/gateway`: Fastify gateway, tools, surfaces, scheduler, memory, DB
- `packages/shared`: shared schemas, constants, and domain types
- `packages/api-client`: typed client for apps
- `packages/screen-share`: screen-share service primitives
- `apps/web`: Vite + React frontend
- `apps/desktop`: Electron desktop client
- `apps/mobile`: mobile client

## Project Docs

- Vision: [docs/vision.md](docs/vision.md)
- Site assets: [docs/site/index.html](docs/site/index.html)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security: [SECURITY.md](SECURITY.md)

## License

MIT
