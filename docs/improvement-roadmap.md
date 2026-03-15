# Jait Improvement Roadmap

> Cross-project research synthesized from **OpenClaw**, **VS Code**, **VS Code Copilot Chat**, and an internal Jait audit.
> Generated 2025-07-17.

---

## Executive Summary

Jait already ships a capable platform: typed tool contracts with registry, pluggable providers/surfaces, evented real-time control plane, consent/trust engine, scheduler, memory, network mesh, and a rich web UI. The gaps below are drawn from patterns proven at scale in OpenClaw, VS Code core, and Copilot Chat that would raise Jait's reliability, security, extensibility, and developer experience.

Items are grouped into **tiers** by expected impact-to-effort ratio.

---

## Tier 1 — High Impact, Moderate Effort

### 1.1 Tool Gateway Service

**Source:** Copilot Chat `toolsService.ts`

Jait's tool registry handles registration and schema validation well, but tool invocation is spread across the agent loop and consent executor. Copilot Chat funnels every tool call through a single gateway service that owns:

- Pre-invocation permission/confirmation checks
- Tool filtering per model and mode
- OTel span creation around each execution
- Model-specific parameter overrides
- Post-invocation result normalization

**Recommendation:** Extract a `ToolGateway` service in `packages/gateway/src/tools/` that wraps `registry.execute()`. All agent-loop and thread-control callers go through it. Consent checks, telemetry, and permission policy become middleware on this single path.

---

### 1.2 Tighten Authorization & Ownership Checks

**Source:** Jait audit of `routes/threads.ts`, `routes/repositories.ts`, `routes/plans.ts`

Several thread/repo/plan mutation endpoints authenticate the user but don't always verify that the authenticated user owns the target resource. Copilot Chat and VS Code both enforce strict scope boundaries (workspace trust, auth-permission upgrade).

**Recommendation:**
- Add `assertOwnership(userId, resourceId)` guard to every mutating thread/repo/plan route handler.
- Review WS subscription path for the same pattern.
- Default-deny for any route that doesn't explicitly check ownership.

---

### 1.3 Structured Turn Model with Round Metadata

**Source:** Copilot Chat `conversation.ts`, `toolCallingLoop.ts`

Jait persists messages as flat rows. Copilot Chat wraps them in explicit Turn objects containing rounds (one LLM request + N tool calls = one round), metadata stamps, and reference lists. This enables:

- Reliable multi-turn prompt assembly (skip stale tool results when context is tight)
- Per-round token accounting
- Turn-level summaries for long sessions

**Recommendation:** Add a `rounds` JSONB column to the session messages table (or a sibling `message_rounds` table). Populate it during the agent loop. Use it in `buildVisibleHistoryMessages` to prune intelligently instead of by raw message count.

---

### 1.4 Stream Middleware Pipeline

**Source:** Copilot Chat `chatResponseStreamImpl.ts`, `defaultIntentRequestHandler.ts`

Jait's SSE streaming is handled inside the chat route with inline event switches. Copilot Chat uses stackable stream participants:

| Participant | Role |
|---|---|
| Telemetry | Token counts, TTFT, span events |
| Linkifier | Rewrite file paths to clickable links |
| Citation tracker | Attach code references to response |
| Edit tracker | Correlate edits with tool calls |

**Recommendation:** Define a `StreamMiddleware` interface (`onToken`, `onToolStart`, `onToolResult`, `onDone`) and compose a pipeline in the chat route. Move telemetry, accumulator logic, and any future citation/linkification into separate middleware modules.

---

### 1.5 Persist Scheduler Run History to DB

**Source:** Jait audit of `scheduler/service.ts`, OpenClaw cron run records

The scheduler already has a `scheduled_job_runs` table in the DB schema, but the jobs route currently keeps run history in an in-memory map. OpenClaw persists every run with status, duration, stdout, and error and exposes run introspection in the UI.

**Recommendation:** Wire `scheduler/service.ts` to insert run records into `scheduled_job_runs` on every execution. Expose a `/api/jobs/:id/runs` endpoint with pagination. Surface run history in the web UI's jobs panel.

---

## Tier 2 — Medium Impact, Moderate Effort

### 2.1 Hybrid Context Retrieval (Semantic + Lexical Fallback)

**Source:** Copilot Chat `workspaceChunkSearchService.ts`, `embeddingsComputer.ts`

Jait's memory search uses bag-of-words cosine similarity. Copilot Chat orchestrates a retrieval stack:

1. Local embedding index (fast, high relevance)
2. TF-IDF/BM25 fallback (when index unavailable)
3. Full-workspace text search (last resort)
4. Optional LLM re-ranking pass

**Recommendation:**
- Keep the current lexical backend as the fallback.
- Add an optional embedding backend (OpenAI `text-embedding-3-small` or local ONNX model) behind a feature flag.
- Implement a strategy switcher in `memory/service.ts` that attempts semantic first, degrades gracefully.

---

### 2.2 Confirmation DSL for High-Risk Operations

**Source:** Copilot Chat `editFileToolUtils.tsx`, `vscodeCmdTool.tsx`; OpenClaw two-phase execution approvals

Jait has consent manager + trust engine, but confirmation message generation is scattered across individual tools. Copilot Chat centralizes confirmation construction:

```ts
interface ToolConfirmation {
  title: string;
  message: MarkdownString;
  severity: 'info' | 'warning' | 'danger';
  details?: Record<string, string>; // e.g. { path, command, impact }
}
```

**Recommendation:** Create `packages/gateway/src/security/confirmation-builder.ts` with typed confirmation factories for each risk category (file-write, terminal-execute, network-call, system-control). Wire into consent-executor so the UI always gets structured, consistent confirmation prompts.

---

### 2.3 Expand Shared Schemas and API Client

**Source:** Jait audit of `packages/shared`, `packages/api-client`

The shared package covers session/action/chat/gateway schemas, but many routes (threads, jobs, network, repos, plans) use ad-hoc route-level typing. The API client only exposes health, messages, sendMessage, and WS subscribe.

**Recommendation:**
- Add Zod schemas for thread, job, network, repo, and plan API surfaces in `packages/shared/src/schemas/`.
- Generate or manually extend `packages/api-client/src/client.ts` to cover the full route inventory.
- Use schema-derived types as route handler generics for automatic request/response validation.

---

### 2.4 Plugin / Extension Model

**Source:** OpenClaw capability-driven plugin manifests; VS Code extension host + typed activation

Jait's tool system is already registry-based. The natural next step is a plugin boundary:

- Plugin manifest (name, version, capabilities, tool definitions, required surfaces)
- Lifecycle hooks (activate, deactivate, onSessionStart)
- Capability gating (plugin declares what it needs; gateway grants or denies)
- Lazy activation (only load plugin when its tool/surface is first requested)

**Recommendation:** Design a `PluginManifest` schema in `packages/shared`. Add a plugin loader in `packages/gateway/src/plugins/` that reads manifests from a `plugins/` directory, validates capabilities against security profile, and registers tools/surfaces through existing registries. Start with a single first-party plugin (e.g. extract browser tools into a plugin) to validate the contract.

---

### 2.5 WS Rate Limiting and Per-Client Throttling

**Source:** Jait audit of `ws.ts`; VS Code notification dedup/priority

The WebSocket handler is a single monolithic file with no per-client rate controls. A misbehaving client can flood the control plane.

**Recommendation:**
- Add a per-client message rate limiter (token bucket, e.g. 100 msgs/sec burst, 20 msgs/sec sustained).
- Add per-event-type throttling where appropriate (e.g. terminal input: 500/sec; UI state sync: 5/sec).
- Split `ws.ts` into handler modules per message category (session, terminal, consent, remote, screen-share) to reduce file size and improve testability.

---

### 2.6 App.tsx Decomposition

**Source:** Jait audit — `apps/web/src/App.tsx` centralizes too much orchestration

**Recommendation:** Extract view-level state and routing into:
- `AppShell.tsx` (layout, navigation, global providers)
- `ChatView.tsx`, `JobsView.tsx`, `NetworkView.tsx`, `SettingsView.tsx` (each self-contained)
- Shared state via context providers already in use; just lift the JSX tree apart.

This reduces merge conflicts, improves code splitting, and makes it easier to test individual views.

---

## Tier 3 — Strategic, Higher Effort

### 3.1 OTel Instrumentation

**Source:** Copilot Chat `agent_monitoring_arch.md`, `toolsService.ts`; OpenClaw OTel diagnostics extension

Jait has audit logging but no structured observability. Copilot Chat instruments:

- `invoke_agent` spans per turn
- `execute_tool` spans per tool call with GenAI semantic conventions
- `chat` spans per LLM request with token counts, model ID, TTFT
- No-op fallback when tracing is disabled

**Recommendation:**
- Add `@opentelemetry/api` as a dependency, wire a trace provider in `packages/gateway/src/index.ts`.
- Instrument the tool gateway (Tier 1.1), chat route LLM calls, and provider adapters.
- Export to stdout/OTLP collector based on config.
- Keep content capture opt-in for privacy.

---

### 3.2 Transcript Event Sourcing

**Source:** Copilot Chat JSONL session transcripts + metadata store

Jait persists messages to SQLite and builds snapshots on the fly. Copilot Chat additionally writes append-only JSONL transcript logs per session that enable:

- Offline replay and debugging
- Deterministic test fixtures from real sessions
- Export/import of conversation history

**Recommendation:** Add a `SessionTranscriptWriter` that appends typed event lines (user-message, assistant-token, tool-start, tool-result, error, metadata) to `data/transcripts/{sessionId}.jsonl`. Keep the existing DB as primary; transcripts are a debug/audit complement.

---

### 3.3 Provider Discovery Registry

**Source:** OpenClaw provider discovery registry; VS Code extension host model

Today adding a new provider means writing a new adapter file and editing the registration list. A discovery registry would:

- Auto-detect installed CLI tools (codex, claude, aider, etc.) at startup
- Expose a `/api/providers/available` endpoint with health/version for each
- Allow runtime enable/disable without restart
- Support remote provider registration from mesh nodes

**Recommendation:** Add `packages/gateway/src/providers/discovery.ts` that probes `PATH` for known CLIs, checks version/auth status, and populates the provider registry. Wire into health check and settings UI.

---

### 3.4 Formal Node Error Taxonomy

**Source:** OpenClaw node error taxonomy (connect, auth, version, capability)

Jait's network scanner discovers hosts but doesn't classify connection failures beyond basic port probing. A typed error model would improve the network topology UI:

```ts
type NodeError =
  | { code: 'CONNECT_REFUSED'; host: string; port: number }
  | { code: 'AUTH_FAILED'; host: string; method: string }
  | { code: 'VERSION_MISMATCH'; host: string; remote: string; local: string }
  | { code: 'CAPABILITY_MISSING'; host: string; capability: string }
```

**Recommendation:** Define `NodeError` in `packages/shared/src/types/network.ts`. Populate during network scan deep-discovery phase. Surface in network panel as status badges per node.

---

### 3.5 MCP Onboarding Sub-Loop

**Source:** Copilot Chat `mcpToolCallingLoop.tsx`, `mcpToolCallingTools.tsx`

Jait already exposes itself as an MCP server. For consuming external MCP servers, Copilot Chat uses a constrained setup sub-loop that:

- Validates MCP package manifest
- Runs a limited tool set (only config-writing tools)
- Guides the user through auth and capability setup
- Prevents full agent tools from running during configuration

**Recommendation:** When adding MCP client consumption, implement a `setupMcpServer` intent that runs a constrained agent loop with only file-read, file-write, and config tools available. This prevents accidental side effects during server configuration.

---

### 3.6 Offline Evaluation Pipeline

**Source:** Copilot Chat `script/alternativeAction/` pipeline

An offline evaluation system that replays recorded sessions and scores tool call quality would catch regressions in prompt engineering and tool selection.

**Recommendation:** Build a `scripts/evaluate/` pipeline that:
1. Reads JSONL transcripts (from 3.2)
2. Replays user messages against current prompts
3. Compares tool selections and parameter quality
4. Outputs a scored report

This is low-priority but becomes valuable once transcript logging is in place.

---

## Tier 4 — Nice to Have

| Item | Source | Description |
|---|---|---|
| **Layered configuration merge** | VS Code 7-target config | Support workspace → user → default config layering with explicit precedence |
| **Notification dedup/priority** | VS Code notification model | Deduplicate identical toasts, prioritize errors over info |
| **Search pipeline with incremental results** | VS Code search provider | Stream search results progressively instead of waiting for full scan |
| **Voice/TTS centralized wake-word** | OpenClaw wake-word management | Centralize voice activation config if voice features expand |
| **Sandbox per execution profile** | OpenClaw Docker sandboxing | Run untrusted tool executions in isolated containers |

---

## Cross-Cutting Gaps (from Jait Audit)

These are existing issues worth addressing alongside any new feature work:

| Area | Issue | Priority |
|---|---|---|
| **Security** | Default fallback JWT secret in code path | High |
| **Security** | WS allows unauthenticated clients in dev mode | Medium |
| **Security** | SSRF guard doesn't resolve DNS-to-private edge cases | Medium |
| **Providers** | JaitProvider `sendTurn` is a no-op shim | Medium |
| **Providers** | Claude approval response not implemented for print mode | Low |
| **Surfaces** | Remote filesystem delete for newly-created files not handled | Low |
| **Network** | Mesh node registry is in-memory only | Medium |
| **Network** | Network devices route returns empty placeholder | Low |
| **DB** | Migration ID ordering (15/16) is confusing | Low |

---

## Suggested Implementation Order

```
Phase 1 (Foundation)
  ├── 1.2 Authorization ownership checks
  ├── 1.5 Persist scheduler runs to DB
  └── Cross-cutting security fixes (JWT default, WS auth)

Phase 2 (Architecture)
  ├── 1.1 Tool gateway service
  ├── 1.4 Stream middleware pipeline
  └── 2.6 App.tsx decomposition

Phase 3 (Developer Experience)
  ├── 1.3 Structured turn model
  ├── 2.2 Confirmation DSL
  └── 2.3 Expand shared schemas + API client

Phase 4 (Extensibility)
  ├── 2.4 Plugin / extension model
  ├── 3.3 Provider discovery registry
  └── 3.4 Node error taxonomy

Phase 5 (Observability & Quality)
  ├── 3.1 OTel instrumentation
  ├── 3.2 Transcript event sourcing
  └── 3.6 Offline evaluation pipeline
```

---

## Sources

| Project | Location | Key Patterns Borrowed |
|---|---|---|
| OpenClaw | `e:\openclaw` | Plugins, approvals, scheduler diagnostics, provider discovery, node errors, sandboxing |
| VS Code | `e:\vscode` | Extension host, terminal service, config layers, workspace trust, search pipeline |
| Copilot Chat | `e:\vscode-copilot-chat` | Tool gateway, stream middleware, structured turns, hybrid retrieval, transcripts, MCP setup, security layering |
| Jait (self-audit) | `e:\Jait` | Gap analysis across tools, providers, surfaces, security, memory, scheduler, DB, WS, network, UI |
