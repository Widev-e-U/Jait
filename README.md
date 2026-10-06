<p align="center">
  <img src="docs/icon.svg" width="96" alt="Jait logo" />
</p>

# Jait

**AI-assisted network and cybersecurity, under your control.**

Jait — Just Another Intelligent Tool — is a local-first security workbench for networks you own or are authorized to assess. The direction is clear: discover assets, understand exposure, investigate weaknesses, prioritize fixes, and verify improvements with evidence.

Today, Jait supplies the foundation: network discovery, SSH, live terminals, filesystem and browser tools, local state, scheduling, consent controls, and sessions across web, desktop, and mobile. Dedicated scanner adapters, enforceable assessment scope, unified findings, and remediation verification are planned. The existing network scan is discovery, not a comprehensive vulnerability assessment.

The first proving ground is the maintainer's own home network and homelab. See the [vision](docs/vision.md) and [security roadmap](docs/security-roadmap.md) for proposed tools and a staged pilot.

> This is an early open-source project. Help us build repeatable assessments with clear evidence and honest coverage limits.

<p align="center">
  <a href="https://github.com/Widev-e-U/Jait/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/Widev-e-U/Jait/ci.yml?branch=main&label=typecheck&style=for-the-badge" alt="Typecheck"></a>
  <a href="https://github.com/Widev-e-U/Jait/releases/latest"><img src="https://img.shields.io/github/v/release/Widev-e-U/Jait?style=for-the-badge" alt="Latest release"></a>
  <a href="https://discord.gg/aqVPr2Jb"><img src="https://img.shields.io/discord/1485222899873747104?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://jait.dev"><img src="https://img.shields.io/badge/Website-jait.dev-00c4b4?style=for-the-badge" alt="Website"></a>
</p>

---

## Why Jait

Jait brings security investigation and practical action into one visible workflow:

- **Work in your environment** — discover local hosts, inspect services over SSH, and run tools through your own gateway and trusted nodes.
- **Use the model you choose** — CLI engines or API/local providers help plan and explain investigations. Cloud providers receive the context sent to them; use a local provider when that context must stay local.
- **Keep operator control** — live tool output, consent controls, durable sessions, and scheduled work support review and follow-through across devices.
- **Build toward verified improvement** — the roadmap adds bounded Nmap scans, protocol and configuration checks, evidence-backed findings, curated Nuclei/Trivy integrations, and before/after verification. Coding tools remain available to prepare and validate fixes.

---

## Install

### Option A — npm (recommended)

```bash
npm install -g @jait/gateway
jait start
```

The gateway starts on **http://localhost:8000** — open it in any browser. On first launch you create a local account (stored in SQLite on your machine) and connect a provider or CLI engine.

### Option B — Desktop app

Download the latest installer from [**GitHub Releases**](https://github.com/Widev-e-U/Jait/releases/latest):

| Platform | File |
|----------|------|
| Windows  | `Jait_*_x64-setup.exe` |

The desktop app ships for Windows and bundles the gateway + web UI in one window. A Capacitor-based Android client lives under `apps/mobile` for building from source.

### Option C — From source

```bash
git clone https://github.com/Widev-e-U/Jait
cd Jait
bun install --frozen-lockfile
cp .env.example .env        # edit with your API key
bun run dev
```

---

## Configuration

Jait reads configuration from (first found wins):

1. `--env /path/to/.env` flag
2. `./.env` (current directory)
3. `~/.jait/.env` (created automatically, persists across updates)
4. Shell environment variables

### Minimal setup

The only thing you *need* is an LLM provider — or a CLI engine on your PATH:

```bash
# OpenAI (or any OpenAI-compatible API)
OPENAI_API_KEY=sk-...

# Or fully local inference
# LLM_PROVIDER=ollama
# OLLAMA_MODEL=llama3
```

### Common options

```bash
PORT=8000                  # HTTP port (default: 8000)
HOST=0.0.0.0               # Bind address (default: 0.0.0.0)
JWT_SECRET=change-me       # Auth secret (auto-generated if not set)
```

### Global agent instructions

Jait reads `~/.jait/SOUL.md` when building provider system prompts — durable user-level instructions that apply across projects and providers. Set `JAIT_SOUL_PATH` or `JAIT_GLOBAL_INSTRUCTIONS_PATH` to use a different file. Token-bounded; ignored when missing or empty.

### All provider options

See [`.env.example`](.env.example) for the full list, including:
- **OpenAI** / **Ollama** / **OpenRouter** — primary LLM
- **Brave**, **Perplexity**, **xAI Grok**, **Gemini**, **Moonshot** — web search
- **Faster Whisper** — local speech-to-text

---

## Run in the background

### Any platform (Windows, macOS, Linux)

```bash
npm install -g @jait/gateway

jait start                  # install/start the supervised service (Linux systemd)
jait status                 # check health
jait stop                   # stop
```

View service logs with `jait daemon logs`. For development, containers, Windows,
or macOS, use `jait start --foreground` and keep the process running.

### Linux server (systemd)

On Linux, `jait start` uses systemd and installs the user service on first start.
It enables auto-start on boot and automatic restart after exit. You can also
configure the service explicitly:

```bash
npm install -g @jait/gateway

# Optional: pre-configure your API key
mkdir -p ~/.jait
echo 'OPENAI_API_KEY=sk-...' > ~/.jait/.env

# Install as a systemd user service (auto-starts on boot)
jait daemon install
jait daemon start
```

Now open `http://your-server:8000` from any browser on your network.

Other daemon commands:

```bash
jait daemon status      # health check
jait daemon logs        # tail logs
jait daemon restart     # restart after config change
jait daemon stop        # stop
jait daemon uninstall   # remove service
```

### Update on the server

```bash
jait update
```

This installs the latest gateway and automatically restarts gateways managed by `jait start` or `jait daemon`. To install a specific release, run `jait update 0.1.877`. You can also trigger the update from the web UI: **Settings → Check for updates → Apply**.

---

## CLI reference

```
jait                       Start the gateway (default port 8000)
jait start                 Install/start the supervised service (Linux systemd)
jait start --foreground    Run directly for development or containers
jait stop                  Stop the background gateway
jait status                Check if the gateway is running
jait doctor                Run local diagnostics
jait update [version]      Update the gateway (default: latest)
jait reset                 Wipe all data (~/.jait) — double confirmation
jait --port 9000           Custom port
jait --host 127.0.0.1      Bind to localhost only
jait --env /path/to/.env   Explicit env file
jait --version             Show version
jait --help                Show help

jait daemon install        Install systemd user service (Linux only)
jait daemon start|stop|restart|status|logs|uninstall
```

The `stop`, `status`, `doctor`, and `start --foreground` commands work on **all platforms**
(Windows, macOS, Linux). Plain `start` and the `daemon` commands require Linux systemd.
If the systemd user manager is unavailable, `start` reports an error and directs you
to `start --foreground`; it never silently starts an unsupervised background process.
An existing service keeps its configuration. To change its port, host, or env file,
run `jait daemon install` with the desired flags, then `jait daemon restart`.

---

## Current capabilities

**120+ built-in tools**, grouped by what they give the agent:

| Group | Tools |
|-------|-------|
| **Development** | Terminal (PTY), filesystem read/write/diff with backup & restore, code graph, architecture tools, project editor, repo proposals, live app preview |
| **Web & research** | Playwright browser control, web search (Brave/Perplexity/Grok/Gemini/Moonshot), session & chat-trace search, web fetch |
| **Machine control** | OS control, computer use (screen/mouse/keyboard), screenshots, SSH & network tools, Windows VM sandbox |
| **Life & comms** | Email, calendar, Home Assistant, channel messaging (Telegram/WhatsApp), voice, mobile push |
| **Agent brain** | Semantic memory, reminders, cron jobs, swarm sub-agents & mailboxes, MCP bridge, skills, decision model, user questions |

### Agents, not just chat

- **Manager mode** — delegate a goal; a manager thread spawns specialist sub-agents that work in parallel with their own transcripts and tool calls.
- **Engine swapping** — any sub-agent can run on an ACP engine (Claude Code, Codex, …) or on Jait's HTTP backends; transcripts render identically either way.
- **Device hopping** — sessions, memory, and scheduled jobs live on the gateway. Start on desktop, continue from phone or watch.
- **Consent controls** — sensitive actions require your approve/reject before they run, on whichever device you're on.

---

## Project structure

```
packages/
  gateway/    Fastify server, 120+ tools, surfaces, scheduler, memory, SQLite DB
  shared/     Shared schemas, constants, and domain types
  api-client/ Typed API client for apps
  cli/        Service-oriented CLI (setup, start/stop, doctor, resources)
  screen-share/ Screen-share service primitives
  tui-shared/ Shared terminal-UI primitives
apps/
  web/        Vite + React frontend (bundled into gateway on publish)
  desktop/    Rust + Tauri desktop shell
  mobile/     Capacitor mobile client
```

The codebase is ~200k lines of strict TypeScript across **350+ test files**, shipped in 870+ releases so far.

---

## Development

```bash
bun install --frozen-lockfile
bun run dev          # start all packages in dev mode
bun run build        # production build
bun run typecheck    # strict TypeScript checks
bun run test         # run Vitest tests
bun run lint         # oxlint
bun run healthcheck  # release guard, typecheck, build, test, lint
```

### Running tests

```bash
bun run test                        # unit & integration
bun run test:e2e                    # Playwright E2E (requires running gateway)
```

---

## Windows VM sandbox

Jait can spin up a full Windows VM (Windows 11) inside a container using
[`dockurr/windows`](https://github.com/dockur/windows) for browser testing on
Windows. The VM is accelerated with KVM and exposes both an RDP endpoint
(port 3389) and a web viewer (port 8006).

Requirements: a Linux host with KVM (`/dev/kvm`), at least 8 GB free RAM and
~32 GB free disk.

### Build the image

```bash
docker build -t jait/windows-sandbox:latest -f docker/Dockerfile.windows-sandbox docker
```

### Standalone testing (docker compose)

```bash
docker compose -f docker/docker-compose.windows-sandbox.yml up -d
```

- Web viewer: http://localhost:8006
- RDP: `localhost:3389` (user `Docker`, password `admin`)
- The Windows disk image persists in `docker/windows-sandbox-storage/`; delete
  that folder to reset the VM.

### From the gateway

`SandboxManager.startWindowsSandbox()` starts a sandboxed VM and returns the
RDP/web-viewer ports plus a `browserId`. The VM disk is stored under
`$JAIT_WINDOWS_SANDBOX_STORAGE` (default: the OS temp dir) and is removed with
`stopWindowsSandbox(name, { removeStorage: true })`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. In short:

- Use Conventional Commits (`feat:`, `fix:`, `chore:`)
- Run `bun run typecheck && bun run test` before opening a PR
- Keep PRs focused and small

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE)
