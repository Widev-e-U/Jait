# Jait Vision & Architecture

> Just Another Intelligent Tool — for Developers.

## What Jait Is

Jait is an **AI-powered developer agent** that sits on your devices — desktop (Electron) and phone (React Native) — and can actually **control your terminal, browser, and operating system** on your behalf. Think VSCode's agent mode, but not locked to an editor. Jait sees your screen, runs your commands, browses the web, and works alongside you — including via voice.

You can **watch everything it does in real-time** — through actual live screen sharing (like RustDesk) streamed directly to your desktop or phone. Open the app, see the agent's screen, approve or interrupt from anywhere.

You talk to it. It shows you what it's doing. You approve or correct. It learns.

### The Developer Workflow

```
You (voice or text)
 │  "Set up a new Next.js project, install shadcn, and push to GitHub"
 │
 ▼
┌──────────────────────────────────────────────────────────────┐
│                        JAIT AGENT                            │
│                                                              │
│  1. Opens PowerShell → runs `npx create-next-app`           │
│  2. You SEE the terminal output in real-time (textual view)  │
│  3. Runs `npx shadcn@latest init` → you see it choosing      │
│  4. Opens browser → navigates to github.com/new              │
│  5. You SEE the browser state as a textual snapshot          │
│  6. Creates repo → runs `git remote add && git push`         │
│  7. Reports back: "Done. Repo at github.com/you/project"    │
│                                                              │
│  Meanwhile: you're watching the LIVE SCREEN on your phone    │
│  via RustDesk-style streaming — tap to interrupt anytime.    │
└──────────────────────────────────────────────────────────────┘
```

You're not just chatting with an AI. You're **watching it work** — via live screen sharing (RustDesk-style remote desktop streamed to any device) plus structured textual views of terminal output, browser state, and OS activity — and you can interrupt, correct, or take over at any point.

---

## Core Philosophy

Jait is a **single-operator developer agent** — your personal AI that runs on your machine, controls your devices, and answers only to you. It is **not** a multi-user web service, not a SaaS platform, not something you deploy for a team. One developer, one agent, total control.

Every feature follows these principles:

1. **Single-Operator, Local-First** — Your agent, your data, your machine. No cloud databases, no external services required. Everything stored in `~/.jait/` as SQLite + files.
2. **Zero Infrastructure** — No PostgreSQL to install, no Redis to manage, no Docker required to run. `bun run dev` and you're working. External services are optional enhancements, never requirements.
3. **Offline-Capable** — Works without internet when using a local LLM (Ollama). Your agent doesn't phone home.
4. **Predictable > Magical** — LLM for understanding, deterministic execution
5. **Secure by Default** — Least privilege, audited, cryptographically verifiable
6. **Human-in-the-Loop** — Autopilot earned through trust, not assumed
7. **You See Everything** — Live screen sharing (RustDesk-style) + textual views of terminal, browser, and screen state
8. **Agent Controls Itself** — Every platform feature (scheduling, sessions, surfaces, memory) is a tool the agent calls. No backdoor APIs, no hidden control plane.
9. **Voice-Native** — Talk to your agent, hands on keyboard or hands-free
10. **Everywhere at Once** — Phone, desktop — one agent, all devices, same session
11. **TypeScript Everywhere** — One language, shared types from database to UI, no translation layer
12. **Data Portability** — Everything is files. Back up with `cp`, sync with `rsync`, version with `git`. No database dumps, no export tools needed.

---

## Why TypeScript End-to-End

The entire Jait stack — backend, frontend, worker, CLI, SDK — is **TypeScript**. No Python, no language boundary, no serialization mismatches. One `pnpm install`, one runtime, shared types from database to UI.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Bun 1.x (ESM) |
| **Language** | TypeScript 5.x (strict) |
| **Backend Framework** | Fastify (HTTP) + ws (WebSocket) |
| **Validation** | Zod (shared schemas) |
| **Database** | bun:sqlite (built-in, zero-dependency) |
| **ORM** | Drizzle ORM (SQLite) |
| **Vector Search** | sqlite-vec (vector extension for semantic memory) |
| **Scheduler** | croner (in-process cron) + JSON file persistence |
| **Frontend** | React 19 + Vite + shadcn/ui |
| **Mobile** | React Native + Expo |
| **Desktop** | Electron |
| **CLI** | Commander.js / yargs |
| **Testing** | Vitest |
| **Linting** | oxlint + oxfmt (fast, Rust-based) |
| **Build** | tsdown / tsup |
| **Monorepo** | Bun workspaces |
| **Screen Sharing** | WebRTC (DataChannel + MediaStream) / RustDesk protocol concepts |
| **Video Codec** | H.264 / VP9 (hardware-accelerated) via native encoder |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              JAIT PLATFORM                                  │
│                        (TypeScript End-to-End)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐                                       │
│  │  Electron /  │  │   Gateway    │                                       │
│  │  React Native│  │  (Fastify)   │                                       │
│  └──────┬───────┘  └──────┬───────┘                                       │
│         │                 │                                              │
│         └─────────────────┘                                              │
│                           │                 │                              │
│  ┌────────────────────────▼─────────────────▼────────────────────────┐    │
│  │                        CORE SERVICES                               │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │    │
│  │  │ LLM Router  │  │ Tool Engine │  │ Scheduler   │  │ Memory    │ │    │
│  │  │ (Vercel AI) │  │ (Sandboxed) │  │ (croner)    │  │ (Scoped)  │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │    │
│  │  │ Surface     │  │ Extension   │  │ Session     │  │ Screen    │ │    │
│  │  │ Manager     │  │ Runtime     │  │ Router      │  │ Renderer  │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     SECURITY & COMPLIANCE                          │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │    │
│  │  │ Secrets     │  │ Audit Log   │  │ Policy      │  │ Consent   │ │    │
│  │  │ Vault       │  │ (Signed)    │  │ Engine      │  │ Manager   │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    CONTROL SURFACE LAYER                           │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │  Terminal (pwsh) │ Browser (CDP) │ Screen Share (WebRTC)          │   │
│  │  Voice (STT/TTS) │ File System │ OS Control │ Clipboard          │   │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                          DATA LAYER                                │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │  bun:sqlite (sessions, audit, state) │ sqlite-vec (memory) │ ~/.jait/  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature Roadmap

### Phase 1: Foundation ✅ (Current)
- [x] Multi-provider LLM support (OpenAI, Anthropic, Ollama, Local)
- [x] In-process cron scheduler (croner + JSON persistence)
- [x] Basic tool execution
- [x] Chat interface with SSE streaming
- [x] Google OAuth authentication

### Phase 2: Control Surfaces — Terminal & OS 🔄 (Next)
| Feature | Description | Priority |
|---------|-------------|----------|
| **PowerShell Surface** | Spawn, control, and stream PowerShell sessions (cross-platform: pwsh on Windows + Linux) | P0 |
| **Terminal Multiplexer** | Multiple concurrent terminal sessions, named/tagged, with history | P0 |
| **Textual Terminal Display** | Real-time terminal output rendered as structured text in the client UI | P0 |
| **File System Surface** | Read, write, edit, `apply_patch` with path boundary enforcement | P0 |
| **OS Control via PowerShell** | Install software, manage services, edit configs, query system state — all via pwsh | P0 |
| **Clipboard Surface** | Read/write system clipboard | P1 |
| **Notification Surface** | OS-native notifications for consent requests, job completions, alerts | P1 |

### Phase 3: Control Surfaces — Browser, Screen & Screen Sharing
| Feature | Description | Priority |
|---------|-------------|----------|
| **Browser Surface** | Playwright CDP control of dedicated Chrome — navigate, click, type, snapshot | P0 |
| **Textual Browser Display** | Browser page state rendered as structured text: DOM snapshot, visible text, interactive elements | P0 |
| **Live Screen Sharing** | RustDesk-style real-time screen streaming from agent device to any client (desktop or phone) via WebRTC | P0 |
| **Remote Observation** | Watch the agent work on your desktop from your phone — see the actual screen, not just text | P0 |
| **Remote Takeover** | Tap/click into the shared screen to take control — mouse, keyboard, touch input forwarded back | P0 |
| **Screen Capture Surface** | Capture device screen, convert to textual description (accessibility tree / OCR) for agent context | P1 |
| **Adaptive Streaming** | Auto-adjust resolution, FPS, and codec based on network quality (H.264/VP9, 1-30fps) | P1 |
| **Sandbox Browser** | Separate container with Chromium + Xvfb + VNC/noVNC for safe browsing | P1 |
| **Session Recording** | Record screen sharing sessions for playback, audit, and debugging | P1 |
| **Multi-Monitor** | Select which monitor to share, or share all | P2 |
| **Web Search** | Brave, Perplexity, xAI Grok search + `web_fetch` | P1 |

### Phase 4: Voice & Interaction
| Feature | Description | Priority |
|---------|-------------|----------|
| **Voice Input (STT)** | Real-time speech-to-text — talk to your agent hands-free (Whisper / Deepgram) | P0 |
| **Voice Output (TTS)** | Agent speaks responses — ElevenLabs / native TTS | P0 |
| **Voice Wake Word** | "Hey Jait" — always-on listening with wake word detection | P1 |
| **Talk Mode** | Push-to-talk overlay / continuous conversation mode | P1 |
| **Voice Consent** | Approve/reject actions by voice: "Yes, run it" / "No, stop" | P1 |
| **Voice + Screen** | Agent narrates what it's doing while you watch via screen share or textual display | P2 |

### Phase 5: Security & Control
| Feature | Description | Priority |
|---------|-------------|----------|
| **Consent Manager** | Explicit approval for dangerous actions (shell commands, file deletes, OS changes) | P0 |
| **Audit Log** | Every action logged with who/what/why/tool/params | P0 |
| **Dry-Run Mode** | Agent shows plan + expected side-effects before execution | P0 |
| **Exec Approvals** | Structured approval flow for shell commands with frozen execution plans | P0 |
| **Action IDs** | Unique IDs for idempotency, no double-executions | P1 |
| **Secrets Vault** | OS Keychain/TPM integration, per-tool scoped, ref-only profiles | P1 |

### Phase 6: Reliability & UX
| Feature | Description | Priority |
|---------|-------------|----------|
| **Action Cards** | Visual previews: commands, file changes, browser actions with Approve/Reject | P0 |
| **Status Queue** | "Running", "Awaiting Approval", "Needs Input" visibility | P0 |
| **Session Model** | Per-project, per-device isolated sessions with history | P0 |
| **Live Activity Feed** | Unified view of all surfaces: terminal output + browser state + files changed | P0 |
| **Quick Edits** | "Use port 4000 instead of 3000" without restarting the plan | P1 |
| **Error Handling** | Retries, timeouts, circuit breakers, partial-fail reports | P1 |
| **Undo/Rollback** | Reverse actions where possible (git revert, file restore, etc.) | P2 |

### Phase 7: Memory & Context
| Feature | Description | Priority |
|---------|-------------|----------|
| **Project Memory** | Per-project context: tech stack, conventions, recent decisions | P0 |
| **Attributed Memory** | "I believe X because: file Y / terminal output Z / browser page A" | P0 |
| **Semantic Search** | Vector-indexed memory retrieval (SQLite-vec / LanceDB) | P0 |
| **Daily Memory Log** | Append-only `memory/YYYY-MM-DD.md` + curated `MEMORY.md` | P1 |
| **Pre-Compaction Flush** | Silent agentic turn to persist durable memories before context trim | P1 |
| **Forget + TTL** | One-click forget, auto-expiring sensitive data | P1 |
| **Workspace Indexing** | Index project files, git history, terminal history as retrieval sources | P2 |

### Phase 8: Docker Sandboxing
| Feature | Description | Priority |
|---------|-------------|----------|
| **Docker Sandboxing** | Per-session, per-agent, or shared containers for tool isolation | P0 |
| **Sandboxed Terminal** | Terminal sessions running inside Docker instead of host OS | P0 |
| **Sandbox Browser** | Separate container with Chromium + Xvfb + VNC/noVNC | P1 |
| **Tool Profiles** | `minimal`, `coding`, `full` — restrict what the agent can do per context | P1 |
| **MCP Bridge** | Model Context Protocol server support (add/remove without restart) | P2 |

### Phase 9: Verifiable Execution (Differentiator)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Signed Receipts** | Cryptographic proof of inputs/outputs/toolcalls (Ed25519) | P0 |
| **Trust Levels** | Autopilot unlocked progressively per action type | P1 |
| **Compliance Export** | Audit trails for regulators/legal | P2 |

### Phase 10: Automation & Scheduling
| Feature | Description | Priority |
|---------|-------------|----------|
| **Cron Scheduler** | One-shot, interval, cron expression with timezone support | P0 |
| **Hooks System** | Event-driven automation: on session start/stop/reset, agent lifecycle | P0 |
| **Webhooks** | HTTP ingress for external triggers (wake, agent run) with token auth | P1 |
| **Heartbeat** | Periodic agent wakeup with configurable delivery policy | P1 |
| **Typed Pipelines** | Resumable approval-gated workflows (multi-step dev tasks) | P2 |

### Phase 11: Skills & Extensions
| Feature | Description | Priority |
|---------|-------------|----------|
| **Plugin SDK** | `@jait/plugin-sdk` — typed TS package for surface/memory/tool/hook plugins | P0 |
| **Skills Platform** | Workspace-local skill packs (Markdown + tool definitions) | P0 |
| **Built-in Skills** | GitHub, Docker, npm/pnpm, git, testing, deployment, database | P0 |
| **Skill Registry** | Community skill hub for sharing/installing skills | P1 |
| **Plugin Slots** | Slot-based plugins: one active memory plugin, multiple surfaces, etc. | P1 |
| **Interactive Onboarding** | Plugins can own `configureInteractive` hooks for guided setup | P2 |

### Phase 12: Cross-Platform
| Feature | Description | Priority |
|---------|-------------|----------|
| **Electron Desktop App** | Primary desktop client — terminal view, browser view, screen view, voice, chat | P0 |
| **React Native Mobile App** | Mobile companion — voice control, screen monitoring, approval on the go | P0 |
| **Shared Component Library** | Extract shadcn/ui-based components into `@jait/ui-shared` | P0 |
| **Remote Device Access** | RustDesk-style: watch and control your desktop from your phone — full screen sharing, input forwarding, clipboard sync | P0 |
| **Multi-Device Sessions** | Same session continues across desktop and mobile | P1 |
| **Push Notifications** | Consent requests, job completions, alerts on all devices | P1 |
| **Policy Engine** | Self-defined: allowed tools, paths, commands, time windows | P1 |

---

## Control Surface Architecture

Jait is a **multi-surface developer agent** — one agent that can reach into your terminal, browser, screen, file system, and OS through a unified **Surface** abstraction. Instead of messaging channels, Jait's surfaces are **control planes for your devices**.

### Surface Abstraction

Every control surface implements a common `Surface` interface:

```typescript
// @jait/shared — shared across backend and all surface plugins
interface Surface {
  id: string;
  type: SurfaceType;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  execute(action: SurfaceAction): Promise<SurfaceResult>;
  stream(handler: (event: SurfaceEvent) => void): void;

  // Per-surface capabilities
  capabilities: SurfaceCapabilities;
}

type SurfaceType =
  | 'terminal'       // PowerShell / shell sessions
  | 'browser'        // Playwright CDP control
  | 'screen-share'   // RustDesk-style live screen streaming
  | 'screen-capture' // Screenshot → textual description
  | 'voice'          // STT input + TTS output
  | 'file-system'    // Read/write/edit files
  | 'os-control'     // System management via PowerShell
  | 'clipboard'      // Read/write clipboard
  | 'notification';  // OS-native notifications

interface SurfaceCapabilities {
  supportsStreaming: boolean;    // real-time output (terminal, screen share)
  supportsInput: boolean;        // can receive user input (takeover, type)
  supportsSnapshot: boolean;     // point-in-time capture
  supportsRecording: boolean;    // session recording for playback
  requiresConsent: boolean;      // needs approval before activation
  maxConcurrent: number;         // how many instances can run at once
}
```

### Screen Sharing Surface (RustDesk-Style)

The screen sharing surface is a **first-class control surface** - not a bolted-on afterthought. It streams the agent device's actual screen to any connected client via WebRTC:

All screen-share lifecycle and routing is managed by an explicit `os_tool` control plane. `os_tool` owns full state and control for any trusted device on the network that is running the Jait Electron app or the React Native mobile app.

```typescript
// @jait/shared — screen sharing configuration
interface ScreenShareConfig {
  codec: 'h264' | 'vp9' | 'av1';          // hardware-accelerated preferred
  maxFps: number;                           // adaptive 1-30 fps
  maxResolution: { w: number; h: number };  // scale down for mobile
  quality: 'low' | 'medium' | 'high' | 'adaptive';
  audio: boolean;                           // include system audio
  monitor: number | 'all';                  // which display(s)
  allowRemoteInput: boolean;                // let viewer send mouse/keyboard
  requireConsentForTakeover: boolean;       // prompt before remote control
  recordSession: boolean;                   // save for audit/playback
}

interface ScreenShareSession {
  id: string;
  hostDeviceId: string;                     // device being shared
  viewers: ScreenShareViewer[];             // connected clients
  status: 'waiting' | 'streaming' | 'paused' | 'ended';
  startedAt: string;
  recording?: { path: string; sizeBytes: number };
}

interface ScreenShareViewer {
  deviceId: string;
  role: 'observer' | 'controller';         // watch-only or full takeover
  connectedAt: string;
  latencyMs: number;
}

interface OsToolScreenShareState {
  sessionId: string;
  hostDeviceId: string;
  viewerDeviceIds: string[];
  controllerDeviceId?: string;
  route: 'p2p' | 'turn-relay';
  capabilities: {
    canView: boolean;
    canControl: boolean;
    canTransferControl: boolean;
  };
  updatedAt: string;
}
```

### How Screen Sharing Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCREEN SHARING FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent's Desktop (Electron)           Your Phone (React Native) │
│  ┌──────────────────────┐             ┌──────────────────────┐  │
│  │ Screen Capture       │   WebRTC    │ Video Decoder        │  │
│  │ (OS-native API)      │────────────►│ (hardware accel)     │  │
│  │                      │  H.264/VP9  │                      │  │
│  │ Mouse/KB events  ◄───│────────────│ Touch → Mouse map    │  │
│  │                      │ DataChannel │                      │  │
│  │ Clipboard sync   ◄──►│────────────│ Clipboard sync       │  │
│  └──────────────────────┘             └──────────────────────┘  │
│                                                                 │
│  Connection path:                                               │
│  1. Direct P2P (same LAN) — lowest latency                     │
│  2. TURN relay via gateway — when P2P fails                     │
│  3. Tailscale/WireGuard — for remote access                    │
│                                                                 │
│  Security:                                                      │
│  - E2E encrypted (DTLS-SRTP)                                   │
│  - Viewer must authenticate via gateway                         │
│  - Takeover requires explicit consent prompt                    │
│  - All sessions logged in audit trail                           │
└─────────────────────────────────────────────────────────────────┘
```

### Surface Routing

All control surfaces funnel through a **unified surface router**:

```
Terminal ────┐
Browser ─────┤
Screen Share ┤   ┌──────────────┐   ┌──────────────┐
Voice ───────┼──►│  Surface      │──►│  Agent       │
File System ─┤   │  Router       │   │  Runtime     │
OS Control ──┤   └──────────────┘   └──────────────┘
Clipboard ───┘
```

- **Per-session** → each project/workspace gets isolated surface instances
- **Per-device** → surfaces route to the correct device (desktop vs. phone)
- **Multi-viewer** → multiple clients can observe the same screen share session

### Supported Surfaces

| Surface | Implementation | Priority | Notes |
|---------|---------------|----------|-------|
| **Terminal** | node-pty + PowerShell | P0 | Cross-platform via pwsh, multiplexed sessions |
| **File System** | Node.js fs + chokidar | P0 | Path-bounded, workspace-scoped |
| **Browser** | Playwright CDP | P0 | Dedicated Chrome instance, snapshots + interaction |
| **Screen Share** | WebRTC + OS capture API | P0 | RustDesk-style live streaming to any client |
| **Voice** | Whisper / Deepgram + ElevenLabs | P0 | STT + TTS, wake word, talk mode |
| **OS Control** | PowerShell commands + `os_tool` coordinator | P0 | Install, configure, query system state, and orchestrate network screen-share control |
| **Screen Capture** | OS API + OCR/A11y | P1 | Screenshot → textual description for agent |
| **Clipboard** | Electron / OS native | P1 | Read/write, sync across devices via screen share |
| **Notification** | Electron / expo-notifications | P1 | Consent requests, alerts, job completions |

---

## Extension & Plugin System

Jait uses a **plugin architecture** where surfaces, memory backends, tool providers, and automation hooks are all extensions that can be installed, configured, and swapped independently.

### Plugin Types

| Type | Slot Model | Examples |
|------|------------|---------|
| **Surface** | Multiple active | Terminal, browser, screen share, RDP, VNC |
| **Memory** | One active (slot) | SQLite-vec (default), LanceDB, PostgreSQL pgvector |
| **Tool Provider** | Multiple active | Browser, file system, shell, web search, self-control |
| **Hook** | Multiple active | Session memory flush, command logger, bootstrap files |
| **Auth Provider** | Multiple active | Google OAuth, Copilot proxy, API keys |
| **Diagnostics** | One active (slot) | OpenTelemetry exporter |

### Plugin SDK

```typescript
// @jait/plugin-sdk
import { definePlugin, SurfacePlugin, MemoryPlugin, ToolPlugin } from '@jait/plugin-sdk';

// Example: a custom surface plugin (RDP, VNC, etc.)
export default definePlugin({
  name: 'jait-surface-rdp',
  version: '1.0.0',
  type: 'surface',

  // Typed config schema (Zod)
  configSchema: z.object({
    host: z.string(),
    port: z.number().default(3389),
    username: z.string(),
  }),

  // Interactive onboarding
  async configureInteractive(prompts) {
    const host = await prompts.input('RDP host:');
    const user = await prompts.input('Username:');
    return { host, username: user };
  },

  // Plugin lifecycle
  async activate(ctx) { /* connect to RDP host */ },
  async deactivate(ctx) { /* disconnect */ },
});
```

### Skills Platform

Skills are workspace-local **capability packs** — Markdown descriptions + tool definitions that teach the agent how to perform specific tasks:

```
skills/
├── github/              # GitHub integration skill
│   ├── SKILL.md         # Tool descriptions, examples, constraints
│   └── tools.ts         # Tool implementations
├── obsidian/            # Obsidian vault management
├── home-assistant/      # Smart home control
├── spotify/             # Music playback
├── email-triage/        # Email classification and drafting
├── calendar/            # Calendar management
└── coding-agent/        # Code generation and execution
```

- Skills can be **per-agent** or **shared** across agents
- Community **skill registry** for discovering and installing skills
- Skills compose naturally: `github` + `coding-agent` = AI code reviewer

---

## Monorepo Structure

```
jait/
├── packages/
│   ├── shared/             # @jait/shared — types, schemas, constants
│   │   ├── schemas/        # Zod schemas (shared backend ↔ frontend ↔ SDK)
│   │   ├── types/          # TypeScript interfaces & enums
│   │   └── constants/      # Shared constants, error codes
│   ├── gateway/            # @jait/gateway — core backend server
│   │   ├── server/         # Fastify HTTP + WebSocket server
│   │   ├── surfaces/       # Surface manager + built-in surfaces
│   │   ├── sessions/       # Session router, isolation, device routing
│   │   ├── agent/          # Agent runtime, LLM routing, tool dispatch
│   │   ├── tools/          # Built-in tools (file, shell, browser, web)
│   │   ├── memory/         # Memory engine, retrieval, scoping
│   │   ├── scheduler/      # Cron, hooks, webhooks, heartbeat
│   │   ├── security/       # Auth, consent, audit, policy, sandbox
│   │   ├── screen-share/   # WebRTC signaling, TURN relay, session management
│   │   └── voice/          # STT/TTS pipeline, wake word, talk mode
│   ├── screen-share/       # @jait/screen-share — screen sharing core
│   │   ├── capture/        # OS-native screen capture (Electron desktopCapturer)
│   │   ├── encoder/        # H.264/VP9 encoding, adaptive bitrate
│   │   ├── transport/      # WebRTC peer connection, DataChannel, TURN
│   │   ├── input/          # Remote input forwarding (mouse, keyboard, touch)
│   │   └── recording/      # Session recording, playback
│   ├── plugin-sdk/         # @jait/plugin-sdk — typed plugin contracts
│   ├── api-client/         # @jait/api-client — typed REST + WS + SSE client
│   │   ├── client.ts       # Typed HTTP/WS client
│   │   ├── auth.ts         # OAuth + JWT token management
│   │   └── types.ts        # Re-exports from @jait/shared
│   ├── ui-shared/          # @jait/ui-shared — shared React components
│   │   ├── chat/           # ChatBubble, ChatInput, StreamingMessage
│   │   ├── actions/        # ActionCard, ConsentDialog, StatusBadge
│   │   ├── screen/         # ScreenShareViewer, RemoteDesktop, TouchOverlay
│   │   ├── terminal/       # TerminalView, TerminalTabs
│   │   ├── layout/         # Sidebar, Dashboard, TopBar
│   │   └── primitives/     # Buttons, inputs, cards (shadcn wrappers)
│   └── cli/                # @jait/cli — global install CLI
│       ├── commands/        # setup, start, stop, status, doctor, surfaces, etc.
│       └── templates/       # Docker Compose + env templates
├── extensions/
│   ├── surface-rdp/        # @jait/surface-rdp — RDP protocol surface (Windows)
│   ├── surface-vnc/        # @jait/surface-vnc — VNC protocol surface
│   ├── memory-lancedb/     # @jait/memory-lancedb
│   ├── diagnostics-otel/   # @jait/diagnostics-otel
│   └── copilot-proxy/      # @jait/provider-copilot
├── skills/
│   ├── github/
│   ├── obsidian/
│   ├── coding-agent/
│   ├── deployment/
│   ├── database/
│   └── ...
├── apps/
│   ├── web/                # Vite + React app (browser — lightweight viewer)
│   ├── desktop/            # Electron shell (primary — screen share host + viewer)
│   └── mobile/             # React Native (Expo — screen share viewer + voice)
├── docker/
│   ├── Dockerfile.gateway  # Gateway image (Bun runtime)
│   ├── Dockerfile.web      # Web UI (nginx)
│   ├── Dockerfile.sandbox  # Minimal tool execution sandbox
│   └── Dockerfile.sandbox-browser  # Chromium + Xvfb + VNC for browser tools
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

### Data Directory (`~/.jait/`)

All persistent state lives in a single portable directory. No external databases, no services:

```
~/.jait/
├── data/
│   └── jait.db              # SQLite database (sessions, audit, consent, trust)
├── memory/
│   ├── MEMORY.md            # Curated long-term memory (agent-maintained)
│   ├── 2026-03-01.md        # Daily memory log (append-only)
│   ├── 2026-03-02.md
│   └── vectors/             # sqlite-vec embeddings for semantic search
├── sessions/
│   ├── sess_abc123.jsonl    # Session transcript (append-only JSONL)
│   └── sess_def456.jsonl
├── cron/
│   └── jobs.json            # Scheduled jobs persistence
├── config.json              # User configuration (LLM provider, ports, etc.)
├── secrets/                 # Encrypted secrets (OS keychain preferred)
└── logs/
    └── gateway.log          # Rotating log files
```

**Why this matters:**
- **Backup:** `cp -r ~/.jait ~/.jait.bak` — done.
- **Migrate:** Copy the folder to a new machine.
- **Version:** `git init ~/.jait/memory` — version your agent's memory.
- **Inspect:** Every file is human-readable (SQLite via any DB browser, JSON/JSONL/Markdown with any editor).
- **Delete:** `rm -rf ~/.jait` — complete clean slate, no orphaned services.

---

## Cross-Platform Architecture

Jait runs on **two primary clients** — desktop (Electron) and phone (React Native). The desktop app is the **screen sharing host** where the agent works. The phone app is a **supervisor and voice remote** — watch what the agent is doing, approve actions, and take over when needed.

### Principle: Desktop Does the Work, Phone Supervises

```
┌─────────────────────────────────────────────────────────────────────┐
│                         JAIT CLIENTS                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────┐           ┌──────────────────────┐       │
│  │   Electron (Desktop) │           │ React Native (Phone) │       │
│  │   ─────────────────  │           │ ──────────────────── │       │
│  │   • Screen share HOST│  WebRTC   │ • Screen share VIEWER│       │
│  │   • Terminal sessions│──────────►│ • Voice control      │       │
│  │   • Browser control  │◄──────────│ • Consent approvals  │       │
│  │   • File editing     │  P2P/TURN │ • Activity feed      │       │
│  │   • Agent execution  │           │ • Remote takeover    │       │
│  └──────────┬───────────┘           └──────────┬───────────┘       │
│             │                                  │                   │
│             └──────────────┬───────────────────┘                   │
│                            │                                       │
│                 ┌──────────▼──────────┐                            │
│                 │  @jait/api-client   │  ← Typed API client,        │
│                 │  + @jait/screen-share│   WS/SSE + WebRTC          │
│                 └──────────┬──────────┘                            │
│                            │                                       │
│               ─────────── LAN / Internet ───────────               │
│                            │                                       │
│                 ┌──────────▼──────────┐                            │
│                 │  Jait Gateway       │  ← Fastify + WebRTC        │
│                 │  (Self-hosted)      │    signaling + TURN relay   │
│                 └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Platform Roles

| Platform | Role | Screen Sharing | Key Features |
|----------|------|---------------|--------------|
| **Desktop (Electron)** | Primary host | HOST — streams screen to viewers | Terminal, browser, file system, OS control, agent execution |
| **Phone (React Native)** | Supervisor | VIEWER — watches desktop screen | Voice control, consent approval, remote takeover, push alerts |
| **Browser (Vite)** | Lightweight viewer | VIEWER — WebRTC in browser | Quick access, screen viewing, basic chat (no host capabilities) |

### Screen Sharing as the Core Interaction

The phone app isn't a separate experience — it's a **window into the desktop agent**:

```
┌────────────────────────────────────────┐
│  📱 Jait Mobile (React Native)         │
│  ┌──────────────────────────────────┐  │
│  │  LIVE SCREEN (from Desktop)      │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │ VSCode with terminal open  │  │  │
│  │  │ > npx create-next-app@lat  │  │  │
│  │  │   ✓ packages installed     │  │  │
│  │  │ > _                        │  │  │
│  │  └────────────────────────────┘  │  │
│  │  [🔇 Mute] [🖱️ Take Over] [⏸ Pause]│
│  └──────────────────────────────────┘  │
│                                        │
│  🎤 "Hey Jait, also install Prisma"    │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ⚡ Agent wants to run:           │  │
│  │   npm install prisma @prisma/cl  │  │
│  │   [✅ Approve]  [❌ Reject]      │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### Device Nodes

Desktop and mobile apps act as **device nodes** — they connect to the gateway via WebSocket and advertise capabilities:

| Capability | Desktop (Electron) | iOS | Android | Description |
|------------|-------------------|-----|---------|-------------|
| Screen Share (Host) | ✅ | ❌ | ❌ | Stream screen to viewers |
| Screen Share (View) | ✅ | ✅ | ✅ | Watch another device's screen |
| Remote Input | ✅ | ✅ | ✅ | Send mouse/keyboard/touch to host |
| Terminal | ✅ | ❌ | ❌ | PowerShell / shell sessions |
| Browser Control | ✅ | ❌ | ❌ | Playwright CDP |
| File System | ✅ | ❌ | ❌ | Agent workspace access |
| Voice | ✅ | ✅ | ✅ | STT/TTS, wake word |
| Camera | ✅ | ✅ | ✅ | Snap photo, record clip |
| Location | ❌ | ✅ | ✅ | GPS coordinates |
| Notifications | ✅ | ✅ | ✅ | Push & local |
| Clipboard | ✅ | ✅ | ✅ | Read/write + sync via screen share |

### Component Sharing Approach

- **Web & Electron**: 100% shared — Electron renders the same React DOM components via its Chromium webview
- **React Native**: Shared **logic, types, API client, and state management**. UI primitives use React Native equivalents (e.g., `react-native-paper` or `tamagui` mapped to shadcn tokens)
- **Screen share viewer**: Shared `@jait/screen-share` transport code. Electron uses native `desktopCapturer` for hosting; React Native uses `react-native-webrtc` for viewing
- **Design tokens** (colors, spacing, typography) defined once in `@jait/ui-shared`, consumed by all platforms

### Remote Access & Deployment

The gateway runs directly on your machine (`bun run dev`) or in **Docker for production-like deployment**. No external databases required:

```yaml
# docker-compose.yml — optional, for containerized deployment
services:
  gateway:
    build: .
    ports:
      - "8000:8000"        # HTTP API — accessible from LAN
      - "18789:18789"      # WebSocket control plane + signaling
    volumes:
      - ~/.jait:/data       # All state in one portable directory
    environment:
      - JAIT_DATA_DIR=/data
      - OLLAMA_URL=http://host.docker.internal:11434
  turn:
    image: coturn/coturn    # TURN server for screen sharing relay (optional)
    ports:
      - "3478:3478/udp"    # STUN/TURN
      - "3478:3478/tcp"
      - "49152-49200:49152-49200/udp"  # Media relay ports
  web:
    build: ./apps/web
    ports:
      - "3000:3000"        # Web UI — accessible from LAN
```

**No postgres, no redis, no object store.** The gateway reads/writes `~/.jait/data/jait.db` and filesystem paths. That's it.

- **Same LAN**: P2P WebRTC screen sharing — near-zero latency
- **Remote access**: Tailscale (recommended) or WireGuard VPN for encrypted tunnel
- **TURN relay**: Falls back to gateway-hosted coturn when P2P fails
- **mDNS/Bonjour**: Zero-config discovery for devices on the local network
- **Mobile**: React Native app auto-discovers gateway, authenticates via OAuth/JWT, connects to screen share

---

## Tool System & Sandboxing

### Built-in Tools

The agent controls **everything** through tools — including its own platform features. There is no separate admin API. If the agent can do it, it's a tool call that flows through consent → execute → audit.

#### Device & Surface Tools

| Tool | Description | Consent Required |
|------|-------------|-----------------|
| **terminal.run** | Execute commands in PowerShell sessions (cross-platform) | Always |
| **terminal.stream** | Stream terminal output to client in real-time | No |
| **browser.navigate** | Playwright CDP — navigate, click, type, snapshot | Trust Level 1+ |
| **browser.snapshot** | Capture browser DOM as textual description | No |
| **screen.share** | Start/stop screen sharing session (WebRTC) | First time only |
| **screen.capture** | Screenshot + OCR/accessibility tree description | No |
| **screen.record** | Record screen sharing session for audit | Trust Level 1+ |
| **file.read** | Read files within workspace boundary | No |
| **file.write** | Write/create files within workspace | Trust Level 2+ |
| **file.patch** | Apply structured patches | Trust Level 2+ |
| **os.install** | Install software via package manager | Always |
| **os.service** | Start/stop/restart system services | Always |
| **os.query** | Query system state (processes, disk, network) | No |
| **os_tool** | Full screen-share state/control across trusted Electron and React Native devices | Trust Level 1+ |
| **web.search** | Brave/Perplexity/Gemini web search | No |
| **web.fetch** | Fetch URL content (SSRF-guarded) | No |
| **clipboard.read** | Read system clipboard | Trust Level 1+ |
| **clipboard.write** | Write to system clipboard | Trust Level 1+ |
| **voice.speak** | Agent speaks via TTS | No |

#### Platform Self-Control Tools (Agent Controls Itself)

The agent manages its own scheduling, sessions, surfaces, memory, and sub-agents — all via standard tool calls:

| Tool | Description | Consent Required |
|------|-------------|-----------------|
| **cron.list** | List all scheduled jobs | No |
| **cron.add** | Create a new scheduled job | Trust Level 1+ |
| **cron.remove** | Delete a scheduled job | Trust Level 1+ |
| **cron.update** | Modify an existing job's schedule or action | Trust Level 1+ |
| **sessions.list** | List active sessions | No |
| **sessions.history** | Read another session's conversation history | No |
| **sessions.send** | Send a message to another session | Trust Level 1+ |
| **sessions.spawn** | Spawn a new isolated agent session | Trust Level 2+ |
| **sessions.status** | Check session health and state | No |
| **agents.list** | List configured agents | No |
| **agents.spawn** | Spawn a sub-agent for background work | Trust Level 2+ |
| **surfaces.list** | List active control surfaces and status | No |
| **surfaces.start** | Activate a control surface | Trust Level 1+ |
| **surfaces.stop** | Deactivate a control surface | Trust Level 1+ |
| **os_tool** | Manage networked screen-share state, controller role, and takeover routing | Trust Level 1+ |
| **gateway.status** | Check gateway health and connected devices | No |
| **memory.search** | Semantic search over memory index | No |
| **memory.save** | Persist a memory entry | No |

### Docker Sandboxing

Tool execution can be isolated in Docker containers with configurable scope:

```typescript
// @jait/shared — sandbox configuration
interface SandboxConfig {
  mode: 'off' | 'non-main' | 'all';         // when to sandbox
  scope: 'session' | 'agent' | 'shared';     // container lifecycle
  workspace: 'none' | 'ro' | 'rw';           // workspace mount
  networkAccess: boolean;                      // outbound network
  timeoutMs: number;                           // execution timeout
  memoryLimitMb: number;                       // memory cap
}
```

- **`Dockerfile.sandbox`** — minimal Debian with bash, git, Node, ripgrep, jq
- **`Dockerfile.sandbox-browser`** — Chromium + Xvfb + VNC + noVNC for browser automation in sandbox
- Path traversal guards, symlink rebind prevention, blocked host env keys

---

## Agent Self-Control via Tools

A core principle of Jait: **the agent controls its own platform features through the same tool-calling interface it uses for everything else.** The agent doesn't have special backdoor APIs — it manages scheduling, sessions, surfaces, memory, and devices by calling tools, just like it calls `terminal.run` or `file.write`.

### Platform Self-Control Tools

These tools let the agent manage its own features:

| Tool | Description | Example Agent Use |
|------|-------------|-------------------|
| **cron.list** | List all scheduled jobs | "What do I have scheduled?" |
| **cron.add** | Create a new scheduled job | "Remind me to check CI every morning at 9am" |
| **cron.remove** | Delete a scheduled job | "Stop that hourly backup check" |
| **cron.update** | Modify an existing job | "Change the CI check to every 2 hours" |
| **sessions.list** | List active sessions | "What sessions are running right now?" |
| **sessions.history** | Read session conversation history | "What did we discuss in the database session?" |
| **sessions.send** | Send a message to another session | "Tell the deploy session to pause" |
| **sessions.spawn** | Create a new isolated session | "Start a coding session for the auth refactor" |
| **sessions.status** | Check session health/state | "Is the long-running build session still alive?" |
| **agents.list** | List configured agents | "What agents are available?" |
| **agents.spawn** | Spawn a sub-agent for a specific task | "Spin up an agent to review PRs in the background" |
| **surfaces.list** | List active control surfaces | "What's connected right now?" |
| **surfaces.start** | Activate a control surface | "Open a new terminal session" |
| **surfaces.stop** | Deactivate a control surface | "Close the browser" |
| **os_tool** | Manage network screen-share state and control handoff | "Transfer screen control to my phone" |
| **screen.share** | Start/stop screen sharing | "Start streaming my screen to my phone" |
| **gateway.status** | Check gateway health | "Are all services healthy?" |
| **memory.search** | Search the memory index | "What do I know about the auth system?" |
| **memory.save** | Persist a memory entry | "Remember that we chose Drizzle ORM" |
| **memory.forget** | Delete a memory entry | "Forget the old database password reference" |
| **voice.speak** | Speak via TTS | "Say 'build complete' out loud" |

### How It Works

```
User: "Check the CI status every morning at 9am and tell me if anything failed"

Agent reasoning:
  1. I need to create a cron job → call cron.add
  2. The job should run a terminal command → the job's action calls terminal.run
  3. Results go to the main session → the job's action calls sessions.send

Tool calls:
  → cron.add({
      name: "morning-ci-check",
      schedule: { type: "cron", expression: "0 9 * * MON-FRI" },
      timezone: "Europe/Berlin",
      action: "Run 'gh run list --limit 5' and report failures to main session"
    })

Result: Scheduled. Job ID: cron_abc123. Next run: tomorrow 09:00 CET.
```

### In-Process Scheduler (croner)

Jait uses **croner** (lightweight cron expression parser) with an in-process `setTimeout` loop — no external scheduler service needed. Inspired by OpenClaw's zero-infrastructure approach:

```typescript
// @jait/gateway/scheduler — in-process cron service
import { Cron } from 'croner';

interface CronService {
  start(): void;                              // begin processing scheduled jobs
  stop(): void;                               // graceful shutdown
  add(job: CronJob): string;                  // returns job ID
  update(id: string, patch: Partial<CronJob>): void;
  remove(id: string): void;
  run(id: string): Promise<void>;             // manual trigger
  list(): CronJob[];
  wake(): void;                               // recalculate next fire time
}

// Persistence: ~/.jait/cron/jobs.json
// Schedule types: 'at' (one-shot), 'every' (interval), 'cron' (cron expr + tz)
```

---

## Installation & Onboarding

Jait should be **trivial to install** — no databases, no Docker, no infrastructure. Just Bun and your LLM.

### Option 1: One-Line CLI Install

```bash
npm install -g @jait/cli
jait setup
```

`jait setup` runs an interactive onboarding wizard:

```
$ jait setup

  🚀 Welcome to Jait — Just Another Intelligent Tool

  ❯ Where should Jait store its data?  ~/.jait
  ❯ LLM provider?  [ollama / openai / anthropic / local]
  ❯ Ollama URL?  http://localhost:11434
  ❯ Port for API?  8000
  ❯ Port for Web UI?  3000

  Screen Sharing:
  ❯ Enable TURN relay for remote screen sharing?  (y/N)
  ❯ Default screen share codec?  [h264 / vp9]

  ✔ Created ~/.jait/config.json
  ✔ Created ~/.jait/data/jait.db (SQLite)
  ✔ Starting gateway...
  ✔ Starting web UI...

  Jait is running:
    • Web UI:      http://localhost:3000
    • API:         http://localhost:8000
    • Gateway WS:  ws://localhost:18789
    • Data:        ~/.jait/

  No databases to manage. No services to monitor.
  Everything is in ~/.jait/ — back it up, move it, delete it.

  Next steps:
    Install the desktop app → jait install desktop
    Install the mobile app → scan the QR at http://localhost:3000/mobile
    Run 'jait status' to check health.
```

### Option 2: Docker Compose (Optional — for containerized deployment)

```bash
mkdir jait && cd jait
curl -fsSL https://get.jait.dev/docker-compose.yml -o docker-compose.yml
curl -fsSL https://get.jait.dev/.env.example -o .env

# Edit .env with your settings
docker compose up -d
```

### Option 3: Just Run It (Development)

```bash
git clone https://github.com/your/jait && cd jait
bun install
bun run dev
# Gateway on :8000, Web UI on :3000. That's it.
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `jait setup` | Interactive onboarding wizard — generates config, creates SQLite DB, starts services |
| `jait start` | Start gateway + web UI (or `jait start gateway` / `jait start web`) |
| `jait stop` | Stop all services gracefully |
| `jait status` | Show running services, surfaces, devices, health checks |
| `jait logs` | Stream logs (`--service gateway`, `--follow`) |
| `jait update` | Pull latest version, run migrations, restart |
| `jait config` | View / edit current configuration |
| `jait surfaces list` | List active control surfaces and their status |
| `jait devices list` | List connected devices (desktop, phone, browser) |
| `jait screen-share` | Start/stop screen sharing, list active sessions |
| `jait skills install` | Install a skill from the registry |
| `jait plugins list` | List installed plugins |
| `jait agents list` | List configured agents |
| `jait cron list` | List scheduled jobs |
| `jait hooks list` | List automation hooks |
| `jait secrets audit` | Audit secrets configuration |
| `jait doctor` | Diagnose common issues (ports, Docker, connectivity, WebRTC) |
| `jait reset` | Wipe data and start fresh (with confirmation) |

---

## Tool Permission Model

```yaml
# Example: Terminal Tool Permission
tool: terminal.run
permissions:
  requires_consent: true
  consent_level: "confirm"
  sandbox: true
  allowed_commands: ["git *", "npm *", "node *", "pnpm *"]
  denied_commands: ["rm -rf /*", "sudo *", "format *"]
  timeout_ms: 30000

# Example: Screen Share Permission
tool: screen.share
permissions:
  requires_consent: first_time    # approve once, then auto-connect
  allowed_viewers: ["owner"]      # who can watch
  allow_remote_input: true
  require_takeover_consent: true  # prompt before viewer takes control
  recording: "optional"           # off | optional | always
  max_viewers: 3

# Example: OS Control Permission
tool: os.install
permissions:
  requires_consent: true
  consent_level: "confirm"
  allowed_managers: ["winget", "choco", "apt", "brew"]
  denied_packages: ["*crack*", "*keygen*"]
  sandbox: false  # must run on host
  audit: true

# Example: File Tool Permission
tool: file_operations
permissions:
  allowed_paths: ["~/Projects/*", "/tmp/*"]
  denied_paths: ["~/.ssh/*", "~/.aws/*", "~/.jait/secrets/*"]
  operations: ["read", "write", "list"]  # no delete
  requires_consent_for: ["delete", "write_outside_workspace"]

# Tool Profiles (presets)
profiles:
  minimal: [file.read, web.search, memory.search, screen.capture]
  coding: [file.*, terminal.run, web.*, memory.*, browser.*, screen.share, os_tool]
  full: ["*"]
```

---

## Action Flow: Human-in-the-Loop

```
User Request (voice, text, or remote via phone screen share viewer)
     │
     ▼
┌─────────────┐
│ Session      │  ← Route to correct session/device/agent
│ Router       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ LLM Parse   │  ← Understand intent
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Plan Build  │  ← Deterministic workflow steps
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ Dry Run     │────►│ Action Card  │  ← Show preview on desktop + phone
└──────┬──────┘     │ + Side       │     (visible via screen share)
       │            │   Effects    │
       ▼            └──────────────┘
┌─────────────┐            │
│ Await       │◄───────────┘
│ Consent     │  ← Approve via desktop click, phone tap, or voice
└──────┬──────┘
       │ (Approve)
       ▼
┌─────────────┐
│ Execute     │  ← Idempotent, with Action ID, optionally sandboxed
└──────┬──────┘     (viewer watches execution live via screen share)
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ Log + Sign  │────►│ Audit Entry  │  ← Signed receipt
└──────┬──────┘     │ (Verifiable) │
       │            └──────────────┘
       ▼
┌─────────────┐
│ Deliver     │  ← Response to desktop UI + phone notification
│ Response    │     + update screen share viewers
└─────────────┘
```

---

## Trust Level Progression

| Level | Name | Requirements | Capabilities |
|-------|------|--------------|--------------|
| 0 | **Observer** | New user | Read-only, suggestions only |
| 1 | **Assisted** | 10 approved actions | Execute with confirmation |
| 2 | **Trusted** | 50 actions, 0 reverts | Auto-execute safe actions |
| 3 | **Autopilot** | 200 actions, explicit opt-in | Auto-execute most actions |

Each action type has its own trust progression:
- Terminal: Always requires Level 1+ consent
- OS control (install, services): Always Level 1+ consent
- Files: Level 2 for write, Level 3 for delete
- Browser: Level 1 for navigation, Level 2 for form submissions
- Screen share: Level 0 for viewing, Level 1 for remote takeover
- os_tool: Level 1 for state inspection, explicit consent for takeover/transfer control
- Voice commands: Level 1 for safe actions, Level 2 for destructive

---

## Audit Log Schema

```sql
-- SQLite (bun:sqlite) — stored in ~/.jait/data/jait.db
-- Managed via Drizzle ORM with type-safe queries

CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,              -- UUIDv7 (sortable by time)
    timestamp TEXT NOT NULL,          -- ISO 8601

    -- Context
    session_id TEXT,
    surface_type TEXT,                -- 'terminal', 'browser', 'screen-share', 'file-system', etc.
    device_id TEXT,                   -- which device performed/observed the action

    -- What
    action_id TEXT UNIQUE,            -- For idempotency
    action_type TEXT,                 -- 'tool_call', 'consent', 'message', etc.
    tool_name TEXT,

    -- Details (JSON strings — SQLite has no JSONB, but JSON functions work)
    inputs TEXT,                      -- JSON, sanitized (no secrets)
    outputs TEXT,                     -- JSON
    side_effects TEXT,                -- JSON — what changed

    -- Verification
    signature TEXT,                   -- Ed25519 signature of canonical JSON
    parent_action_id TEXT,            -- For action chains

    -- Status
    status TEXT,                      -- 'pending', 'approved', 'executed', 'failed', 'reverted'
    consent_method TEXT               -- 'auto', 'confirm', 'voice'
);

CREATE INDEX idx_audit_action_id ON audit_log(action_id);
CREATE INDEX idx_audit_session ON audit_log(session_id, timestamp DESC);
CREATE INDEX idx_audit_surface ON audit_log(surface_type, timestamp DESC);
CREATE INDEX idx_audit_device ON audit_log(device_id, timestamp DESC);

-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,              -- UUIDv7
    name TEXT,
    workspace_path TEXT,              -- project directory this session is bound to
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    status TEXT DEFAULT 'active',     -- 'active', 'archived', 'deleted'
    metadata TEXT                     -- JSON — custom session data
);

-- Trust progression (single user, per-action-type tracking)
CREATE TABLE trust_levels (
    action_type TEXT PRIMARY KEY,     -- 'terminal.run', 'file.write', etc.
    approved_count INTEGER DEFAULT 0,
    reverted_count INTEGER DEFAULT 0,
    current_level INTEGER DEFAULT 0   -- 0=observer, 1=assisted, 2=trusted, 3=autopilot
);

-- Consent history
CREATE TABLE consent_log (
    id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    decision TEXT NOT NULL,           -- 'approved', 'rejected', 'timeout'
    decided_at TEXT NOT NULL,
    decided_via TEXT                   -- 'click', 'voice', 'auto'
);
```

---

## Memory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MEMORY LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Workspace   │  │   Contact    │  │   Project    │          │
│  │   Memory     │  │   Memory     │  │   Memory     │          │
│  │              │  │              │  │              │          │
│  │ - Prefs      │  │ - History    │  │ - Goals      │          │
│  │ - Context    │  │ - Prefs      │  │ - Files      │          │
│  │ - Shortcuts  │  │ - Notes      │  │ - Decisions  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                    ┌──────▼──────┐                              │
│                    │  Retrieval  │  ← Semantic search via       │
│                    │  Engine     │    vector embeddings          │
│                    └──────┬──────┘                              │
│                           │                                     │
│  ┌────────────────────────▼──────────────────────────────────┐ │
│  │                   MEMORY STORAGE                           │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  ┌────────────────┐  ┌─────────────────┐                  │ │
│  │  │ Daily Log      │  │ Long-term       │                  │ │
│  │  │ memory/        │  │ MEMORY.md       │                  │ │
│  │  │ YYYY-MM-DD.md  │  │ (curated)       │                  │ │
│  │  │ (append-only)  │  │                 │                  │ │
│  │  └────────────────┘  └─────────────────┘                  │ │
│  │                                                            │ │
│  │  Pluggable backend: sqlite-vec (default) │ LanceDB (extension)  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   MEMORY ENTRY                             │ │
│  │  {                                                         │ │
│  │    "fact": "Prefers morning meetings",                     │ │
│  │    "source": {"type": "terminal", "id": "sess_abc123",         │ │
│  │               "surface": "terminal"},                        │ │
│  │    "confidence": 0.9,                                      │ │
│  │    "scope": "contact:john@example.com",                    │ │
│  │    "ttl": "2026-12-31",  // or null for permanent         │ │
│  │    "can_forget": true                                      │ │
│  │  }                                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Pre-compaction flush: silent agentic turn to persist durable   │
│  memories before context window is compacted                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Design Principles

1. **Every mutating action returns an `action_id`** for tracking and idempotency
2. **All dangerous operations support `dry_run=true`** to preview effects
3. **Batch operations return partial results** with per-item status
4. **Rate limits are per-tool** with clear headers
5. **Errors include remediation hints** and retry guidance
6. **WebSocket control plane** for real-time events (typing, presence, delivery)
7. **OpenAI-compatible HTTP API** for drop-in LLM proxy usage

```typescript
// @jait/shared — response types used by API, SDK, and UI
interface ActionResponse {
  action_id: string;          // "act_abc123"
  status: ActionStatus;       // "awaiting_consent" | "executing" | "completed" | "failed"
  surface: string;            // "terminal" | "browser" | "screen-share" | ...
  device_id?: string;         // which device performed the action
  preview?: {
    command?: string;
    description: string;
    side_effects: string[];
  };
  consent_url?: string;
  expires_at?: string;        // ISO 8601
}

// Same type used in backend handler, API client, and UI component
```

---

## Automation & Scheduling

### Cron Jobs

```typescript
// @jait/shared — cron job schema
interface CronJob {
  id: string;
  name: string;
  schedule: 
    | { type: 'at'; datetime: string }            // one-shot
    | { type: 'every'; interval: string }          // "30m", "2h"
    | { type: 'cron'; expression: string };        // "0 9 * * MON-FRI"
  timezone: string;                                 // "Europe/Berlin"
  session: 'main' | 'isolated';                    // reuse main session or spawn new
  action: string;                                   // prompt or command
  notify?: { surface: string; session?: string };     // announce results
  enabled: boolean;
}
```

### Hooks

Event-driven automation triggered by system events:

| Hook | Trigger | Example Use |
|------|---------|-------------|
| `session.start` | New session created | Load bootstrap files |
| `session.end` | Session closed | Flush memory to disk |
| `session.compact` | Context about to be compacted | Silent memory save turn |
| `agent.error` | Agent encountered an error | Notify via push/desktop notification |
| `surface.connected` | A control surface comes online | Log surface availability |
| `surface.disconnected` | A control surface goes offline | Alert user |
| `cron.fired` | Scheduled job triggered | Run automation |
| `consent.timeout` | Consent request expired | Notify user |

### Webhooks

HTTP endpoints for external triggers:

```
POST /hooks/wake     — system event trigger (token-authenticated)
POST /hooks/agent    — spawn isolated agent turn (token-authenticated)
POST /hooks/gmail    — Gmail Pub/Sub push notification
```

---

## Implementation Priorities (Q1 2026)

### This Sprint
1. Migrate backend from Python/FastAPI to TypeScript/Fastify
2. Set up pnpm monorepo with `@jait/shared`, `@jait/gateway`, `@jait/api-client`
3. Implement WebSocket control plane for real-time events
4. Add basic audit logging (database, not signed yet)

### Next Sprint
1. Surface manager abstraction + Terminal surface (PowerShell)
2. File system surface with workspace boundary enforcement
3. Session router with per-device isolation
4. Consent manager for tool execution
5. Self-control tools: `sessions.*`, `surfaces.*`, `gateway.status`

### Following Sprint
1. Browser automation surface (Playwright CDP)
2. Docker sandboxing for tool execution
3. Memory engine with semantic search (SQLite-vec)
4. In-process cron scheduler (croner) + hooks system
5. Screen sharing surface (WebRTC) + `os_tool` network control plane (P2P + TURN relay, Electron + React Native device control)

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Action Success Rate | >95% | Reliability |
| Consent-to-Execute Time | <5s | UX |
| Zero double-executions | 100% | Idempotency |
| Audit coverage | 100% | Compliance |
| User-reported "surprising" actions | <1% | Predictability |
| Surface activation latency | <1s (p95) | Responsiveness |
| Screen share frame latency | <100ms (LAN) | Real-time feel |
| Self-control tool reliability | >99.9% | Agent autonomy |
| Plugin install-to-working time | <5 min | Developer experience |

---

## Competitive Positioning

| Capability | OpenClaw | Others | Jait |
|------------|----------|--------|------|
| **Full-stack TypeScript** | ✅ | Rarely | ✅ Shared types end-to-end |
| **Security-first** | Partial | Rarely | ✅ Core |
| **Verifiable execution** | ❌ | ❌ | ✅ Signed receipts |
| **Human-in-the-loop** | Optional | Optional | ✅ Default |
| **Local-first / zero infrastructure** | ✅ | ❌ | ✅ SQLite + files, no servers |
| **Multi-channel messaging** | ✅ 22+ channels | Web only | N/A — Jait is a dev agent, not a messaging gateway |
| **Terminal/Browser/OS control** | ❌ | ❌ | ✅ First-class control surfaces |
| **Screen sharing (RustDesk-style)** | ❌ | ❌ | ✅ WebRTC live desktop streaming |
| **Agent self-control via tools** | Partial (tools) | ❌ | ✅ Every platform feature is a tool |
| **Provider flexibility** | ✅ 25+ providers | Varies | ✅ Any LLM |
| **Plugin / extension system** | ✅ Rich SDK | Varies | ✅ Typed TS SDK |
| **Skills platform** | ✅ 55+ skills | ❌ | ✅ Community registry |
| **Multi-agent** | ✅ | ❌ | ✅ Isolated agents, cross-agent comms |
| **Memory attribution** | Partial | ❌ | ✅ Sourced, scoped, TTL |
| **Docker sandboxing** | ✅ Per-session | ❌ | ✅ Per-session + sandbox browser |
| **Browser automation** | ✅ Playwright | ❌ | ✅ CDP + VNC |
| **Voice / Talk Mode** | ✅ | ❌ | ✅ Wake word + TTS |
| **Device nodes** | ✅ iOS/Android/macOS | ❌ | ✅ Camera, screen, location |
| **Cross-platform** | ✅ macOS/iOS/Android | Web only | ✅ Phone + Desktop + Web |
| **Cron + Hooks + Webhooks** | ✅ | Partial | ✅ Full automation |
| **One-line install** | ✅ | Rarely | ✅ `npm i -g @jait/cli && jait setup` |

### Where Jait Differentiates

1. **Personal-first, not SaaS** — Your agent runs on your machine, stores data in files you own. No cloud lock-in, no subscriptions, no data leaving your network.
2. **Zero infrastructure** — No PostgreSQL, no Redis, no Docker required. `bun run dev` and you're working. OpenClaw gets this right too — we match it.
3. **Security as product** — Signed audit receipts, trust levels, exec approval flows. Not an afterthought.
4. **TypeScript everywhere** — Zero translation layer. Types defined once, used in backend, frontend, SDK, plugins, CLI.
5. **Agent controls itself** — Every platform feature (scheduling, sessions, surfaces, memory, sub-agents) is a tool the agent calls. The agent is self-aware and self-managing.
6. **Consent-first** — Human-in-the-loop is the default, not an opt-in. Autopilot is earned.
7. **Attributed memory** — Every memory entry has a source, confidence score, scope, and TTL. No black-box recall.
8. **Live screen sharing** — RustDesk-style remote desktop streaming to any device. Watch the agent work, take over anytime.
9. **Developer-dedicated** — Not a general-purpose assistant. Every feature, every surface, every tool is designed for the software development workflow.

---

## Technical Debt to Avoid

1. **No plaintext secrets** — Ever. Use vault from start.
2. **No "we'll add auth later"** — Every endpoint authenticated.
3. **No "trust the LLM"** — Always validate, sanitize, bound.
4. **No "users won't do that"** — Assume adversarial input.
5. **No "we'll add logging later"** — Audit from day one.
6. **No Python "just for this one thing"** — TypeScript everywhere, no exceptions.
7. **No untyped plugin interfaces** — Plugin SDK is fully typed with Zod schemas.
8. **No hardcoded surface logic** — Everything goes through the surface abstraction. No special-casing per device.

---

*"Make it secure, make it reliable, make it trustworthy — let the agent control itself — watch it work from anywhere — own all your data — and make it all TypeScript. Or don't make it at all."*
