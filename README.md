<p align="center">
  <img src="docs/site/icon.svg" width="96" alt="Jait logo" />
</p>

# Jait

**Local-first AI coding agent workspace** with terminal, filesystem, browser control, screen sharing, and task automation — no cloud backend required.

This is from now on a passion project of mine. I really like to build and make building easier. Feel free to critisize my approaches (issues are very welcome and help me a lot) in any way possible I really want to make this usable because it really makes me have fun at building stuff again 😁

Jait runs as a lightweight gateway on your machine (or a server) and serves a web UI to any browser. Think of it as your own self-hosted AI dev environment: connect your API key, open the UI, and start building.

<p align="center">
  <a href="https://github.com/JakobWl/Jait/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/JakobWl/Jait/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/JakobWl/Jait/releases"><img src="https://img.shields.io/github/v/release/JakobWl/Jait?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="https://discord.gg/XaHA8fnB"><img src="https://img.shields.io/discord/1485203573183742074?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

---

## Install

### Option A — npm (recommended)

```bash
npm install -g @jait/gateway
```

That's it. Now run it:

```bash
jait
```

The gateway starts on **http://localhost:8000** — open it in your browser.

On first launch you'll create a local account (stored in SQLite, never leaves your machine) and paste an API key.

### Option B — Desktop app

Download the latest installer from [**GitHub Releases**](https://github.com/JakobWl/Jait/releases/latest):

| Platform | File |
|----------|------|
| Windows  | `Jait-*-x64-setup.exe` or portable `.exe` |
| macOS    | `Jait-*-arm64.dmg` / `Jait-*-x64.dmg` |
| Linux    | `Jait-*-x64.AppImage` or `.deb` |

The desktop app bundles the gateway + web UI in one window. No separate install needed.

### Option C — From source

```bash
git clone https://github.com/JakobWl/Jait
cd Jait
bun install --frozen-lockfile
cp .env.example .env        # edit with your API key
bun run dev
```

---

## Configuration

Jait uses environment variables for configuration. You can set them in:

1. `~/.jait/.env` (created automatically, persists across updates)
2. A `.env` file next to the binary
3. Shell environment variables

### Minimal setup

The only thing you *need* is an LLM provider. Set one of these:

```bash
# OpenAI (or any OpenAI-compatible API)
OPENAI_API_KEY=sk-...

# Or use Ollama for fully local inference (no API key needed)
# LLM_PROVIDER=ollama
# OLLAMA_MODEL=llama3
```

### Common options

```bash
PORT=8000                  # HTTP port (default: 8000)
HOST=0.0.0.0               # Bind address (default: 0.0.0.0)
JWT_SECRET=change-me        # Auth secret (auto-generated if not set)
```

### All provider options

See [`.env.example`](.env.example) for the full list, including:
- **OpenAI** / **Ollama** — primary LLM
- **Brave**, **Perplexity**, **xAI Grok**, **Gemini**, **Moonshot** — web search
- **Faster Whisper** — local speech-to-text

---

## Run on a server (headless)

Install globally, then set up as a systemd service:

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
npm install -g @jait/gateway@latest
jait daemon restart
```

Or trigger the update from the web UI: **Settings → Check for updates → Apply**.

---

## CLI reference

```
jait                       Start the gateway (default port 8000)
jait --port 9000           Custom port
jait --host 127.0.0.1      Bind to localhost only
jait --env /path/to/.env   Explicit env file
jait --version             Show version
jait --help                Show help

jait daemon install        Install systemd user service
jait daemon start|stop|restart|status|logs|uninstall
```

---

## What can Jait do?

| Capability | Description |
|------------|-------------|
| **Chat** | Conversational AI with streaming, message queuing, and session history |
| **Terminal** | Full PTY terminal access — the agent can run commands with your approval |
| **Filesystem** | Read, write, and diff files in your workspace with backup & restore |
| **Browser** | Playwright-controlled browser for web research and testing |
| **Preview** | Live-preview web apps inside the workspace (proxied localhost ports) |
| **Screen share** | Share your screen with the AI for visual context |
| **Automation** | Manager mode: delegate tasks to background agent threads |
| **Jobs** | Schedule recurring tasks (cron-style) |
| **Multi-device** | Open the same session on multiple browsers — state syncs in real-time |
| **Consent controls** | Approve/reject sensitive actions before they run |

---

## Project structure

```
packages/
  gateway/    Fastify server, tools, surfaces, scheduler, memory, SQLite DB
  shared/     Shared schemas, constants, and domain types
  api-client/ Typed API client for apps
  screen-share/ Screen-share service primitives
apps/
  web/        Vite + React frontend (bundled into gateway on publish)
  desktop/    Electron wrapper
  mobile/     Capacitor mobile client
```

---

## Development

```bash
bun install --frozen-lockfile
bun run dev          # start all packages in dev mode
bun run build        # production build
bun run typecheck    # strict TypeScript checks
bun run test         # run Vitest tests
bun run lint         # oxlint
```

### Running tests

```bash
bun run test                        # unit & integration
cd e2e && npm test                  # Playwright E2E (requires running gateway)
```

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
