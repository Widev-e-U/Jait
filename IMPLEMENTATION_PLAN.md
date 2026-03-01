# Jait Implementation Plan

> Concrete sprints, tasks, and deliverables for building Jait from the current foundation to full vision.

**Start Date:** March 2026
**Cadence:** 2-week sprints
**One developer** — all estimates assume solo work.
**Canonical planning file:** `IMPLEMENTATION_PLAN.md` (also referenced as `ImplementationPlan.md` in conversation).

---

## Current State (Sprint 0 — Done)

What exists today:

- [x] Multi-provider LLM support (OpenAI, Anthropic, Ollama, Local)
- [x] In-process cron scheduler (croner + JSON persistence)
- [x] Basic tool execution
- [x] Chat interface with SSE streaming
- [x] Google OAuth authentication

What does **not** exist yet: monorepo, Fastify gateway, surfaces, Electron, React Native, screen sharing, voice, memory, audit, consent, Docker sandboxing, plugin SDK, CLI.

---

## Sprint 1 — Monorepo & Gateway Bootstrap

**Goal:** Runnable TypeScript monorepo with a Fastify gateway that serves a basic chat UI over WebSocket.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 1.1 | Init bun workspace, `tsconfig.json` base, `vitest.config.ts` | root | 2h |
| 1.2 | Create `@jait/shared` — initial Zod schemas (`ActionResponse`, `SurfaceType`, `SessionInfo`, error codes) | `packages/shared` | 4h |
| 1.3 | Create `@jait/gateway` — Fastify HTTP server, health endpoint, env config loader | `packages/gateway` | 4h |
| 1.4 | WebSocket control plane in gateway — connect, authenticate (JWT), subscribe to events | `packages/gateway/server` | 6h |
| 1.5 | SSE streaming endpoint for LLM responses (port existing chat logic) | `packages/gateway/agent` | 4h |
| 1.6 | Create `@jait/api-client` — typed HTTP + WS client, token management | `packages/api-client` | 4h |
| 1.7 | Create `apps/web` — Vite + React 19 + shadcn/ui, basic chat page consuming api-client | `apps/web` | 6h |
| 1.8 | Docker Compose: gateway + web (no postgres/redis), `Dockerfile` for gateway | `docker/` | 3h |
| 1.9 | CI: lint (oxlint), typecheck, vitest, build — GitHub Actions | root | 2h |

**Deliverable:** `bun dev` starts gateway + web app. User can chat with LLM via browser. WebSocket events stream in real-time.

**Exit criteria:**
- [x] `bun install` from root installs everything
- [x] `bun run build` succeeds with zero errors
- [x] `bun run test` passes (unit tests for shared schemas, gateway health, api-client)
- [x] Chat works end-to-end in browser (SSE streaming via Ollama)
- [x] WebSocket control plane with JWT authentication

---

## Sprint 2 — Session Router & Audit Foundation

**Goal:** Sessions are isolated per-project. Every action gets an `action_id` and is logged. All data stored in SQLite (`~/.jait/data/jait.db`).

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 2.1 | bun:sqlite + Drizzle ORM setup — SQLite connection, migration runner, `~/.jait/data/` directory | `packages/gateway` | 3h |
| 2.2 | Database schema: `sessions`, `audit_log`, `trust_levels`, `consent_log` (no `users` table — single operator) | `packages/gateway` | 4h |
| 2.3 | Session router — create, list, switch, isolate sessions per workspace | `packages/gateway/sessions` | 6h |
| 2.4 | Action ID generation (UUIDv7) + idempotency guard | `packages/gateway/security` | 2h |
| 2.5 | Audit log writer — log every tool call with inputs/outputs/status to SQLite | `packages/gateway/security` | 4h |
| 2.6 | Session selector in web UI — sidebar with session list, create new | `apps/web` | 4h |
| 2.7 | Schemas: `Session`, `AuditEntry` in `@jait/shared` | `packages/shared` | 2h |
| 2.8 | Self-control tools: `sessions.list`, `sessions.status` | `packages/gateway/tools` | 3h |

**Deliverable:** Multiple sessions, each isolated. All actions audited in SQLite.

**Exit criteria:**
- [x] Creating a new session gives it a unique ID
- [x] Tool calls in session A don't appear in session B
- [x] `audit_log` table has entries for every tool call
- [x] `sessions.list` tool returns active sessions when called by the agent
- [x] `~/.jait/data/jait.db` is the sole persistence layer — no external services

---

## Sprint 3 — Terminal Surface & File System

**Goal:** The agent can run PowerShell commands and edit files. User sees terminal output in real-time.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 3.1 | Surface manager abstraction — `Surface` interface, registry, lifecycle | `packages/gateway/surfaces` | 4h |
| 3.2 | Terminal surface — spawn pwsh via `node-pty`, stream stdout/stderr over WS | `packages/gateway/surfaces` | 8h |
| 3.3 | Terminal multiplexer — named sessions, concurrent terminals, kill/resize | `packages/gateway/surfaces` | 4h |
| 3.4 | File system surface — `file.read`, `file.write`, `file.patch` with path boundary enforcement | `packages/gateway/surfaces` | 6h |
| 3.5 | Tools: `terminal.run`, `terminal.stream`, `file.read`, `file.write`, `file.patch` | `packages/gateway/tools` | 4h |
| 3.6 | Tools: `os.query` (system info, processes, disk), `os.install` (winget/apt/brew wrapper) | `packages/gateway/tools` | 4h |
| 3.7 | Terminal view component — xterm.js in web UI, tabs for multiple terminals | `apps/web` | 6h |
| 3.8 | Self-control tools: `surfaces.list`, `surfaces.start`, `surfaces.stop` | `packages/gateway/tools` | 3h |
| 3.9 | Path traversal guards, symlink rebind prevention, denied-path enforcement | `packages/gateway/security` | 3h |

**Deliverable:** Agent runs shell commands, edits files. Terminal output streams to browser in real-time.

**Exit criteria:**
- [x] Agent can run `git status` and user sees output live
- [x] Agent can create/edit files within workspace boundary
- [x] Path traversal outside workspace is blocked
- [x] Multiple terminal sessions can run concurrently
- [x] `surfaces.list` returns active terminal + file system surfaces

---

## Sprint 4 — Consent Manager & Tool Permissions

**Goal:** Dangerous actions require explicit user approval. Trust levels control what auto-executes.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 4.1 | Consent manager — pending queue, approve/reject API, timeout handling | `packages/gateway/security` | 6h |
| 4.2 | Tool permission model — per-tool config (allowed/denied commands, paths, consent level) | `packages/gateway/security` | 4h |
| 4.3 | Tool profiles: `minimal`, `coding`, `full` presets | `packages/gateway/security` | 2h |
| 4.4 | Trust level engine — track per-user, per-action-type progression (Level 0→3) | `packages/gateway/security` | 4h |
| 4.5 | Action Card component — preview command, side effects, Approve/Reject buttons | `apps/web` | 4h |
| 4.6 | Status queue UI — "Running", "Awaiting Approval", "Needs Input" | `apps/web` | 3h |
| 4.7 | Dry-run mode — agent shows plan before execution, user reviews | `packages/gateway/agent` | 4h |
| 4.8 | Consent WS events — real-time push to all connected clients when consent needed | `packages/gateway/server` | 2h |

**Deliverable:** `terminal.run` prompts for approval. Safe actions auto-execute at Trust Level 2+.

**Exit criteria:**
- [x] Shell commands show Action Card with Approve/Reject
- [x] Approved actions execute; rejected actions abort
- [x] `file.read` executes without consent; `terminal.run` always requires it
- [x] Trust level increments after successful approved actions
- [x] Consent requests timeout after configurable period

---

## Sprint 5 — Browser Surface & Web Tools

**Goal:** Agent controls a dedicated Chrome instance via Playwright CDP. Browser state rendered as structured text.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 5.1 | Browser surface — launch Chromium, connect via CDP, manage lifecycle | `packages/gateway/surfaces` | 6h |
| 5.2 | Tools: `browser.navigate`, `browser.snapshot` (DOM → textual description) | `packages/gateway/tools` | 6h |
| 5.3 | Browser interaction: click, type, scroll, select, wait, screenshot | `packages/gateway/tools` | 4h |
| 5.4 | Tools: `web.search` (Brave/Perplexity API), `web.fetch` (SSRF-guarded) | `packages/gateway/tools` | 4h |
| 5.5 | Textual browser display component — show DOM snapshot, interactive elements | `apps/web` | 4h |
| 5.6 | Browser screenshot viewer component — rendered image with click coordinates | `apps/web` | 3h |
| 5.7 | SSRF guard — block private IPs, restrict protocols, URL allowlist | `packages/gateway/security` | 2h |

**Deliverable:** Agent navigates websites, fills forms, reads pages. User sees browser state as structured text.

**Exit criteria:**
- [ ] Agent can navigate to a URL and describe the page content
- [ ] Agent can click elements and fill forms
- [ ] `web.search` returns search results
- [ ] Private IP access blocked by SSRF guard
- [ ] Browser snapshot shows structured textual view in UI

---

## Sprint 6 — Memory Engine

**Goal:** Agent remembers context across sessions. Semantic search over memories. Attributed sources.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 6.1 | Memory engine core — save, search, forget, TTL expiration | `packages/gateway/memory` | 6h |
| 6.2 | SQLite-vec integration for vector embeddings storage | `packages/gateway/memory` | 4h |
| 6.3 | Embedding pipeline — generate embeddings on save (OpenAI, Ollama, or local) | `packages/gateway/memory` | 4h |
| 6.4 | Memory scoping — workspace, project, contact scopes | `packages/gateway/memory` | 3h |
| 6.5 | Memory attribution — every entry tracks source type, ID, surface | `packages/gateway/memory` | 2h |
| 6.6 | Daily memory log — append-only `memory/YYYY-MM-DD.md` + curated `MEMORY.md` | `packages/gateway/memory` | 3h |
| 6.7 | Pre-compaction flush — silent agentic turn to persist memories before context trim | `packages/gateway/agent` | 4h |
| 6.8 | Tools: `memory.search`, `memory.save`, `memory.forget` | `packages/gateway/tools` | 3h |
| 6.9 | Memory plugin slot — interface for swapping backend (SQLite-vec → LanceDB → pgvector) | `packages/gateway/memory` | 3h |

**Deliverable:** Agent has persistent memory. "What do I know about X?" works via semantic search.

**Exit criteria:**
- [x] Agent can save a fact and retrieve it in a later session
- [x] Semantic search returns relevant memories, not just keyword match
- [x] Memory entries have source attribution
- [x] TTL-expired entries are automatically cleaned up
- [x] Pre-compaction flush persists important context before trim

---

## Sprint 7 — Scheduling, Hooks & Webhooks

**Goal:** Agent can schedule its own tasks, respond to system events, and receive external triggers.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 7.1 | Cron scheduler service — croner integration, setTimeout loop, job persistence | `packages/gateway/scheduler` | 6h |
| 7.2 | Tools: `cron.add`, `cron.list`, `cron.remove`, `cron.update` | `packages/gateway/tools` | 4h |
| 7.3 | Cron job execution — spawn session (main or isolated), run action, notify | `packages/gateway/scheduler` | 4h |
| 7.4 | Hooks system — event bus, hook registration, lifecycle events | `packages/gateway/scheduler` | 4h |
| 7.5 | Built-in hooks: `session.start`, `session.end`, `session.compact`, `agent.error`, `surface.*` | `packages/gateway/scheduler` | 3h |
| 7.6 | Webhook endpoints — `POST /hooks/wake`, `/hooks/agent` with token auth | `packages/gateway/server` | 3h |
| 7.7 | Heartbeat — configurable periodic agent wakeup | `packages/gateway/scheduler` | 2h |
| 7.8 | Cron job management UI — list, enable/disable, manual trigger | `apps/web` | 3h |
| 7.9 | Tools: `gateway.status` (health, connected devices, active services) | `packages/gateway/tools` | 2h |

**Deliverable:** Agent schedules its own CI checks, cleanup tasks. Hooks fire on session lifecycle.

**Exit criteria:**
- [ ] Agent can create a cron job that runs daily
- [ ] Cron jobs persist across gateway restart
- [ ] `session.start` hook fires and loads bootstrap files
- [ ] Webhook POST triggers an agent turn
- [ ] `gateway.status` returns comprehensive health info

---

## Sprint 8 — CLI & Docker Setup

**Goal:** `npm i -g @jait/cli && jait setup` gets a working Jait instance running.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 8.1 | CLI scaffold — Commander.js, command routing, help text | `packages/cli` | 3h |
| 8.2 | `jait setup` — interactive wizard (LLM provider, ports, TURN, data dir) | `packages/cli/commands` | 6h |
| 8.3 | `jait start` / `jait stop` / `jait status` — process management (direct Bun process or Docker) | `packages/cli/commands` | 3h |
| 8.4 | `jait logs` / `jait doctor` / `jait reset` | `packages/cli/commands` | 3h |
| 8.5 | `jait surfaces list` / `jait devices list` / `jait cron list` | `packages/cli/commands` | 3h |
| 8.6 | Docker Compose template generation — gateway, web, coturn (optional) — no postgres/redis | `packages/cli/templates` | 4h |
| 8.7 | `~/.jait/config.json` generation with sensible defaults | `packages/cli/templates` | 2h |
| 8.8 | `jait update` — pull latest images, run migrations, restart | `packages/cli/commands` | 2h |
| 8.9 | npm publish pipeline for `@jait/cli` | root | 2h |

**Deliverable:** Single `npm i -g @jait/cli && jait setup` gets everything running.

**Exit criteria:**
- [ ] Fresh machine: `jait setup` generates config, pulls images, starts services
- [ ] `jait status` shows all services healthy
- [ ] `jait doctor` detects common issues (ports, Docker missing, etc.)
- [ ] `jait stop` && `jait start` restores state

---

## Sprint 9 — Electron Desktop App

**Goal:** Desktop app with terminal view, browser view, chat, activity feed. Screen share host capability.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 9.1 | Electron shell — main process, preload, IPC, auto-updater scaffold | `apps/desktop` | 6h |
| 9.2 | Embed web app in Electron — shared React components via Chromium webview | `apps/desktop` | 4h |
| 9.3 | Desktop-specific: system tray, native notifications, global shortcut (talk mode) | `apps/desktop` | 4h |
| 9.4 | Terminal view — xterm.js with native node-pty (Electron main process) | `apps/desktop` | 4h |
| 9.5 | Activity feed — unified view: terminal + browser + files + agent actions | `apps/web` + `apps/desktop` | 4h |
| 9.6 | `@jait/ui-shared` — extract shared components (ChatBubble, ActionCard, TerminalView, etc.) | `packages/ui-shared` | 6h |
| 9.7 | Design tokens — colors, spacing, typography shared across web/desktop | `packages/ui-shared` | 2h |
| 9.8 | Electron build + packaging (Windows, macOS, Linux) | `apps/desktop` | 4h |

**Deliverable:** Electron app that connects to gateway. Full terminal + chat + browser snapshot + activity feed.

**Exit criteria:**
- [ ] Desktop app launches, connects to gateway via WS
- [ ] Terminal sessions run natively (not in Docker)
- [ ] Chat works same as web
- [ ] Activity feed shows all surface events
- [ ] System tray icon, native notifications work

---

## External Reference Baseline (Screen Sharing)

For Sprint 10 and Sprint 12, `E:\deskreen` is a required implementation reference for a working optimized baseline.

- Use it for architecture and performance patterns only.
- Re-implement in Jait style for this repository.
- Do not copy AGPL code verbatim.

---

## Sprint 10 - Screen Sharing (WebRTC)

**Goal:** RustDesk-style live screen streaming with an `os_tool` control plane that has full state and control over sharing across networked Jait devices (Electron + React Native).

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 10.0 | Deskreen baseline mapping (required) — map `E:\deskreen\src\features\DesktopCapturerSourcesService\index.ts`, `E:\deskreen\src\features\SharingSessionService\index.ts`, `E:\deskreen\src\server\index.ts`, `E:\deskreen\src\server\darkwireSocket.ts`, `E:\deskreen\src\renderer\src\features\PeerConnection\*`, and `E:\deskreen\src\client-viewer\src\features\PeerConnection\*` to Jait modules before implementation | planning | 2h |
| 10.1 | `@jait/screen-share` package scaffold — capture, encoder, transport, input modules | `packages/screen-share` | 2h |
| 10.2 | Screen capture — Electron `desktopCapturer` API, monitor selection | `packages/screen-share/capture` | 4h |
| 10.3 | WebRTC transport — peer connection, offer/answer, ICE candidates | `packages/screen-share/transport` | 8h |
| 10.4 | Signaling server — WebSocket-based SDP exchange in gateway | `packages/gateway/screen-share` | 4h |
| 10.5 | TURN relay integration — coturn config, fallback when P2P fails | `packages/screen-share/transport` | 4h |
| 10.6 | Adaptive streaming — auto-adjust resolution, FPS, codec based on network | `packages/screen-share/encoder` | 4h |
| 10.7 | Remote input forwarding — mouse, keyboard events from viewer to host | `packages/screen-share/input` | 4h |
| 10.8 | Screen share viewer component - video element, touch overlay, controls | `packages/ui-shared/screen` | 6h |
| 10.9 | Tools: `screen.share`, `screen.capture`, `screen.record` | `packages/gateway/tools` | 3h |
| 10.10 | Session recording - save WebRTC stream to file for audit/playback | `packages/screen-share/recording` | 4h |
| 10.11 | `os_tool` screen-share state model - host, viewers, controller, routes, health, capabilities | `packages/shared` + `packages/gateway` | 5h |
| 10.12 | `os_tool` distributed control endpoints - start/stop/pause/resume/transfer-control across trusted LAN devices | `packages/gateway/tools` + `packages/gateway/routes` | 6h |
| 10.13 | Consent + policy enforcement for remote takeover through `os_tool` (device allowlist, role checks) | `packages/gateway/security` | 4h |

**Deliverable:** Start screen share from Electron, view/control it from browser/Electron/mobile, and manage all share sessions via `os_tool` with complete runtime state visibility.

**Exit criteria:**
- [ ] Desktop streams screen to web viewer in real-time
- [ ] P2P connection on same LAN with <100ms latency
- [ ] Fallback to TURN relay when P2P fails
- [ ] Remote input (mouse/keyboard) works from viewer
- [ ] Agent can call `screen.share` to start/stop sharing
- [ ] `os_tool` returns full network share state (host/viewers/controller/capabilities) for every connected Jait device
- [ ] `os_tool` can transfer control between authorized Electron and React Native clients without restarting stream
- [ ] Sprint notes include a short Deskreen-to-Jait module mapping before Sprint 10 implementation is considered complete

---

## Sprint 11 — Voice (STT/TTS)

**Goal:** Talk to the agent, hear it respond. Wake word activation.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 11.1 | STT pipeline — microphone capture, streaming transcription (Whisper/Deepgram) | `packages/gateway/voice` | 6h |
| 11.2 | TTS pipeline — text-to-speech (ElevenLabs / native OS TTS), audio playback | `packages/gateway/voice` | 4h |
| 11.3 | Voice surface — connect/disconnect, stream audio, surface lifecycle | `packages/gateway/surfaces` | 3h |
| 11.4 | Wake word detection — "Hey Jait" using lightweight local model (Porcupine/Picovoice) | `packages/gateway/voice` | 4h |
| 11.5 | Talk mode — push-to-talk button + continuous conversation toggle | `apps/desktop` + `apps/web` | 3h |
| 11.6 | Voice consent — approve/reject by saying "yes" / "no" / "stop" | `packages/gateway/voice` | 3h |
| 11.7 | Tool: `voice.speak` — agent speaks a message via TTS | `packages/gateway/tools` | 2h |
| 11.8 | Desktop: microphone permission, audio routing, global PTT shortcut | `apps/desktop` | 3h |

**Deliverable:** User says "Hey Jait, run the tests." Agent speaks back the results.

**Exit criteria:**
- [ ] Voice input transcribed and sent to agent as text
- [ ] Agent response spoken via TTS
- [ ] Wake word activates listening
- [ ] "Yes, run it" approves a pending consent request
- [ ] Works in Electron desktop app

---

## Sprint 12 - React Native Mobile App

**Goal:** Phone app as supervisor - voice control, screen share viewer, consent approvals, push notifications, and `os_tool`-driven remote control.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 12.0 | Deskreen viewer/control flow comparison (required) — validate mobile viewer behavior parity and quality adaptation approach against `E:\deskreen\src\client-viewer\src\features\PeerConnection\*` and related flow in `E:\deskreen\src\renderer\src\features\PeerConnection\*` | planning | 2h |
| 12.1 | Expo project scaffold, navigation, auth flow | `apps/mobile` | 4h |
| 12.2 | API client integration — connect to gateway via `@jait/api-client` | `apps/mobile` | 3h |
| 12.3 | Chat view — React Native equivalent of web chat, using shared types | `apps/mobile` | 4h |
| 12.4 | Screen share viewer — `react-native-webrtc`, video display, touch-to-mouse mapping | `apps/mobile` | 8h |
| 12.5 | Remote takeover — touch input forwarded to desktop host | `apps/mobile` | 4h |
| 12.6 | Voice control — microphone, STT, TTS on device | `apps/mobile` | 4h |
| 12.7 | Consent approval view — push notification → tap to approve/reject | `apps/mobile` | 3h |
| 12.8 | Push notifications - expo-notifications, consent requests + job completions | `apps/mobile` | 3h |
| 12.9 | Gateway auto-discovery - mDNS/Bonjour on LAN, QR code fallback | `apps/mobile` | 3h |
| 12.10 | Activity feed - same unified view as desktop, adapted for mobile layout | `apps/mobile` | 3h |
| 12.11 | Mobile device node registration + capability heartbeat consumed by `os_tool` | `apps/mobile` + `packages/gateway` | 3h |

**Deliverable:** Phone app connects to gateway. Watch screen share, approve actions, talk to agent.

**Exit criteria:**
- [ ] Mobile app discovers and connects to gateway
- [ ] Live screen share from desktop visible on phone
- [ ] Touch on phone screen moves mouse on desktop
- [ ] Push notification for consent → tap to approve
- [ ] Voice command from phone triggers agent action
- [ ] Mobile can request/view/control sessions through `os_tool` using role-based consent rules
- [ ] Mobile viewer/control design is validated against Deskreen flow patterns and captured in Sprint 12 notes

---

## Sprint 13 — Docker Sandboxing

**Goal:** Tool execution isolated in containers. Sandbox browser for safe web browsing.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 13.1 | Sandbox manager — container lifecycle, pool, reuse, cleanup | `packages/gateway/security` | 6h |
| 13.2 | `Dockerfile.sandbox` — minimal Debian + bash, git, Node, ripgrep, jq | `docker/` | 2h |
| 13.3 | `Dockerfile.sandbox-browser` — Chromium + Xvfb + VNC + noVNC | `docker/` | 3h |
| 13.4 | Sandbox config integration — per-tool, per-profile sandbox enforcement | `packages/gateway/security` | 4h |
| 13.5 | Workspace mount modes — none, read-only, read-write with boundary enforcement | `packages/gateway/security` | 3h |
| 13.6 | Network isolation — container network policies, outbound control | `packages/gateway/security` | 2h |
| 13.7 | Resource limits — memory cap, CPU, execution timeout per container | `packages/gateway/security` | 2h |
| 13.8 | Sandboxed terminal — terminal sessions running inside Docker instead of host | `packages/gateway/surfaces` | 3h |

**Deliverable:** Dangerous commands run in containers. Sandbox browser available for safe browsing.

**Exit criteria:**
- [ ] Tool with `sandbox: true` runs inside Docker container
- [ ] Container cannot access paths outside workspace mount
- [ ] Container killed after timeout
- [ ] Sandbox browser runs Chromium in container, viewable via noVNC
- [ ] Host OS unaffected by sandboxed commands

---

## Sprint 14 — Plugin SDK & Skills

**Goal:** Third-party surfaces, memory backends, and tools installable via plugin SDK.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 14.1 | `@jait/plugin-sdk` — `definePlugin`, `SurfacePlugin`, `MemoryPlugin`, `ToolPlugin`, `HookPlugin` types | `packages/plugin-sdk` | 6h |
| 14.2 | Plugin loader — discover, validate, activate/deactivate plugins at runtime | `packages/gateway` | 6h |
| 14.3 | Plugin config — Zod schema validation, `configureInteractive` hooks | `packages/plugin-sdk` | 3h |
| 14.4 | Plugin slot model — one active memory, multiple surfaces, multiple tools | `packages/gateway` | 3h |
| 14.5 | Skills platform — load workspace-local `skills/` directories (SKILL.md + tools.ts) | `packages/gateway` | 4h |
| 14.6 | Built-in skills: github, git, npm/bun, docker, testing | `skills/` | 6h |
| 14.7 | `jait skills install` / `jait plugins list` CLI commands | `packages/cli` | 3h |
| 14.8 | Example extension: `@jait/memory-lancedb` | `extensions/memory-lancedb` | 3h |

**Deliverable:** `@jait/plugin-sdk` published. Skills loadable from workspace. Example plugin works.

**Exit criteria:**
- [ ] Plugin SDK types exported and importable
- [ ] Custom surface plugin loads and activates
- [ ] Skills loaded from `skills/github/` and tools registered
- [ ] `jait plugins list` shows installed plugins
- [ ] Memory plugin slot swappable (SQLite-vec → LanceDB)

---

## Sprint 15 — Verifiable Execution & Secrets

**Goal:** Signed audit receipts. Secrets vault integration. Compliance export.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 15.1 | Ed25519 key generation + management | `packages/gateway/security` | 3h |
| 15.2 | Audit receipt signing — sign canonical JSON of each audit entry | `packages/gateway/security` | 4h |
| 15.3 | Receipt verification endpoint — verify any audit entry's signature | `packages/gateway/server` | 2h |
| 15.4 | Secrets vault — OS Keychain integration (Electron) + Keytar/libsecret | `packages/gateway/security` | 4h |
| 15.5 | Per-tool secret scoping — tool X can only access secret Y | `packages/gateway/security` | 3h |
| 15.6 | Compliance export — JSON/CSV dump of audit logs with signatures | `packages/gateway/security` | 3h |
| 15.7 | `jait secrets audit` CLI command | `packages/cli` | 2h |

**Deliverable:** Every action has a cryptographic receipt. Secrets stored in OS keychain, not plaintext.

**Exit criteria:**
- [ ] Audit entries have Ed25519 signatures
- [ ] Signature verification returns true for unmodified entries
- [ ] Secrets stored in OS keychain, not in env or config files
- [ ] Compliance export generates verifiable audit trail

---

## Sprint 16 — Polish, MCP Bridge & Advanced Automation

**Goal:** MCP bridge, undo/rollback, error handling, OpenAI-compatible API. Production hardening.

### Tasks

| # | Task | Package | Est |
|---|------|---------|-----|
| 16.1 | Policy engine — self-defined rules: allowed tools, paths, commands, time windows | `packages/gateway/security` | 6h |
| 16.2 | MCP bridge — Model Context Protocol server, hot-reload tool providers | `packages/gateway` | 6h |
| 16.3 | Undo/rollback — reverse actions where possible (git revert, file restore) | `packages/gateway/agent` | 4h |
| 16.4 | Error handling — retries, timeouts, circuit breakers, partial-fail reports | `packages/gateway` | 4h |
| 16.5 | Rate limiting — per-tool with clear headers | `packages/gateway/server` | 2h |
| 16.6 | OpenAI-compatible API — drop-in LLM proxy endpoint | `packages/gateway/server` | 4h |
| 16.7 | Workspace profiles — per-project `.jait/` config for tool permissions, memory scope | `packages/gateway` | 4h |
| 16.8 | Data export/import — backup and restore `~/.jait/` with integrity checks | `packages/cli` | 3h |

**Deliverable:** Production-hardened agent with MCP support, undo, and workspace-level configuration.

**Exit criteria:**
- [ ] Policy can block `rm -rf` commands
- [ ] MCP tools load without gateway restart
- [ ] Undo reverts file changes via git
- [ ] OpenAI-compatible endpoint serves chat completions
- [ ] Per-workspace `.jait/` config overrides global settings

---

## Dependency Graph

```
Sprint 1 (Monorepo + Gateway)
  │
  ├── Sprint 2 (Sessions + Audit)
  │     │
  │     ├── Sprint 3 (Terminal + File System)
  │     │     │
  │     │     ├── Sprint 4 (Consent + Permissions)
  │     │     │     │
  │     │     │     ├── Sprint 5 (Browser)
  │     │     │     ├── Sprint 7 (Scheduling + Hooks)
  │     │     │     └── Sprint 13 (Sandboxing)
  │     │     │
  │     │     └── Sprint 6 (Memory)
  │     │
  │     └── Sprint 8 (CLI + Docker)
  │
  ├── Sprint 9 (Electron Desktop)
  │     │
  │     ├── Sprint 10 (Screen Sharing)
  │     │     │
  │     │     └── Sprint 12 (React Native Mobile)
  │     │
  │     └── Sprint 11 (Voice)
  │
  ├── Sprint 14 (Plugin SDK + Skills)
  │
  ├── Sprint 15 (Verifiable Execution)
  │
  └── Sprint 16 (MCP + Polish)
```

---

## Parallel Tracks

Some sprints can overlap if time allows or a second contributor joins:

| Track A (Backend) | Track B (Frontend/Clients) |
|-------------------|---------------------------|
| Sprint 1 (Gateway) | — |
| Sprint 2 (Sessions + Audit) | — |
| Sprint 3 (Terminal + FS) | Sprint 9 (Electron shell) |
| Sprint 4 (Consent) | Sprint 9 cont. (Electron UI) |
| Sprint 5 (Browser) | Sprint 10 (Screen Sharing) |
| Sprint 6 (Memory) | Sprint 11 (Voice) |
| Sprint 7 (Scheduling) | Sprint 12 (React Native) |
| Sprint 8 (CLI) | Sprint 12 cont. |
| Sprint 13 (Sandboxing) | Sprint 14 (Plugin SDK) |
| Sprint 15 (Signing) | Sprint 16 (MCP + Polish) |

With two tracks: **~16 weeks** instead of ~32 weeks.

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun 1.x | Built-in SQLite, fast startup, native TS execution, single binary |
| Database | bun:sqlite | Zero-dependency (built into runtime), single file, perfect for single-operator |
| Vector DB | sqlite-vec | Same SQLite file, no server, pluggable via memory plugin slot |
| ORM | Drizzle (SQLite) | Type-safe, zero-overhead SQL, great migrations, works perfectly with SQLite |
| Scheduler | croner (in-process) | Zero infrastructure, JSON file persistence, no external service |
| Queue | In-process (no Redis) | Single operator — no need for distributed queue. In-memory + croner suffices |
| Screen sharing | WebRTC | Browser-native, P2P capable, hardware-accelerated codecs |
| Terminal PTY | node-pty | Mature, cross-platform, used by VSCode terminal |
| Browser automation | Playwright CDP | Reliable, maintained by Microsoft, supports Chrome DevTools Protocol |
| Desktop framework | Electron | Shares web codebase, native access (screen capture, node-pty, keychain) |
| Mobile framework | React Native + Expo | Shared types/logic with web, WebRTC libraries available |
| Validation | Zod | Runtime + static types, composable, shared across all packages |
| Cron parsing | croner v10 | Lightweight, zero-dependency, supports timezone |
| Data storage | `~/.jait/` filesystem | Portable, inspectable, git-friendly, no services to manage |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebRTC complexity (NAT traversal, codec negotiation) | Screen sharing delayed | Start with same-LAN P2P only, add TURN later |
| AGPL contamination from Deskreen reference code | Legal/compliance risk | Reference architecture only, no direct code reuse |
| node-pty cross-platform issues | Terminal breaks on Linux/macOS | Test on all platforms in CI early |
| Electron app size | Slow download, high memory | Tree-shake, lazy-load, consider Tauri later |
| React Native WebRTC maturity | Mobile screen share viewer buggy | Use `react-native-webrtc` (well-maintained), fallback to server-rendered frames |
| Plugin SDK API instability | Breaking changes for plugin authors | Version plugin SDK separately, semver strictly |
| Solo developer burnout | Slow progress | Prioritize P0 features ruthlessly, ship MVP of each sprint |
| SQLite concurrent writes | Write contention under heavy tool use | WAL mode (default), single-writer is fine for single-operator |

---

## MVP Definition (Sprints 1–4)

After 4 sprints (~8 weeks), the MVP should be:

- **Monorepo** with `@jait/shared`, `@jait/gateway`, `@jait/api-client`, `apps/web`
- **Chat with LLM** (multi-provider, SSE streaming)
- **Terminal surface** (run commands, see output live)
- **File system surface** (read, write, patch with boundary enforcement)
- **Sessions** (per-project isolation, stored in SQLite)
- **Audit log** (every action logged to SQLite)
- **Consent manager** (approve dangerous actions)
- **Trust levels** (auto-execute safe actions at Level 2+)
- **Self-control tools** (`sessions.list`, `surfaces.list`, `gateway.status`)
- **Web UI** with chat, terminal view, action cards, session selector
- **Zero external dependencies** — no PostgreSQL, no Redis, no Docker required

This is a **usable developer agent** — no screen sharing, no voice, no mobile yet, but you can talk to an AI that runs your commands with your approval.
