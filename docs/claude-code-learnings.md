# Learnings from Claude Code

Analysis of the Claude Code source (`e:\claude-code-main`) for features and patterns Jait can adopt.
Ordered roughly by implementation effort / ROI.

---

## 1. Away Summary

**What it is:** When the user returns to an idle session, a small/fast model generates 1–3 sentences: what they were building and what the concrete next step is.

**Why it matters:** Re-engagement UX — removes the cognitive cost of re-reading a long thread.

**Claude Code location:** `src/services/awaySummary.ts`

**Implementation notes:**
- Uses `RECENT_MESSAGE_WINDOW = 30` messages to keep the call cheap.
- Queries the small/fast model (not the main model).
- Augments the prompt with session memory content if it exists.
- Returns `null` on abort or empty transcript — no UI clutter for fresh sessions.

---

## 2. Contextual Tips Engine

**What it is:** Shows one contextually relevant tip per session at the spinner/idle state. Tips have per-category cooldowns (tracked across sessions) so the same tip is never shown too often.

**Why it matters:** Discoverability — surfaces features users don't know exist without being annoying.

**Claude Code locations:**
- `src/services/tips/tipRegistry.ts` — registers tips with conditions and cooldowns
- `src/services/tips/tipScheduler.ts` — selects the tip shown longest ago
- `src/services/tips/tipHistory.ts` — persists cooldown state

**Implementation notes:**
- `getRelevantTips(context)` filters by feature gates and current state.
- `selectTipWithLongestTimeSinceShown` is the selection algorithm — simple and fair.
- Tips are opt-out via `spinnerTipsEnabled` setting.

---

## 3. Plan Mode

**What it is:** A dedicated mode where the AI writes a plan to a file, the user can edit it in their IDE, and only then does execution proceed. No destructive actions happen until the user exits plan mode.

**Why it matters:** The #1 trust feature — users feel in control of what will happen before it happens.

**Claude Code locations:**
- `src/commands/plan/plan.tsx` — `/plan` command and plan display
- `src/tools/EnterPlanModeTool.ts` / `src/tools/ExitPlanModeV2Tool.ts`
- `src/utils/plans.ts` — plan file read/write helpers

**Implementation notes:**
- Plan is stored as a markdown file the user can freely edit.
- `prepareContextForPlanMode` restricts tool permissions while in plan mode (read-only + plan write only).
- `getPlanFilePath()` puts the plan in a predictable temp location.
- `/plan open` opens the plan file in the IDE editor.

---

## 4. Context Compaction with Custom Instructions

**What it is:** `/compact [optional instructions]` summarises the conversation and replaces the full history with the summary, freeing up context window. Auto-compact fires reactively when the window fills.

**Why it matters:** Long sessions stay usable without the user having to manage token budgets manually.

**Claude Code locations:**
- `src/commands/compact/compact.ts` — command handler
- `src/services/compact/compact.ts` — `compactConversation()` core
- `src/services/compact/autoCompact.ts` — reactive auto-compact
- `src/services/compact/sessionMemoryCompact.ts` — session-memory-aware variant
- `src/services/compact/microCompact.ts` — micro-compaction for individual tool outputs

**Implementation notes:**
- User-supplied instructions are injected into the summarisation prompt (e.g. "focus on API design decisions").
- `trySessionMemoryCompaction` runs first if no custom instructions — cheaper, uses cached session notes.
- `notifyCompaction()` resets prompt cache break detection baseline after compaction.
- Pre-compact hooks fire before summarisation — allows saving state externally.

---

## 5. Tool Lifecycle Hooks (pre/post per tool call)

**What it is:** User-configurable hooks that fire before and after every tool invocation. Pre-hooks can block execution; post-hooks can mutate the output.

**Why it matters:** Auditability, custom validation, third-party integrations (e.g. "require confirmation before any `git push`").

**Claude Code locations:**
- `src/services/tools/toolHooks.ts` — `runPostToolUseHooks`, `runPreToolUseHooks`
- `src/utils/hooks.ts` — `executePreToolHooks`, `executePostToolHooks`
- `src/commands/hooks/hooks.tsx` — `/hooks` config UI

**Implementation notes:**
- Pre-hooks receive tool name + input; can emit a blocking message with reason.
- Post-hooks can replace the tool output entirely (`updatedMCPToolOutput`).
- Both pre and post hooks are cancellable via `AbortController`.
- Hooks are configured per-tool-name in user settings.

---

## 6. Background Session Memory Extraction

**What it is:** After every N tool calls, a forked subagent reads the conversation and updates a living `session-memory.md` without blocking the main loop.

**Why it matters:** The AI maintains running context notes mid-session, dramatically improving coherence across long sessions.

**Claude Code locations:**
- `src/services/SessionMemory/sessionMemory.ts` — main extraction loop
- `src/services/SessionMemory/prompts.ts` — extraction prompt template
- `src/services/SessionMemory/sessionMemoryUtils.ts` — read/write helpers

**Implementation notes:**
- Runs as a `registerPostSamplingHook` — fires after the model produces a final response.
- `hasMetInitializationThreshold` and `hasMetUpdateThreshold` gate when extraction runs.
- Uses `runForkedAgent` pattern — shares the parent's prompt cache, adds no latency.
- Guards against concurrent extraction with a `sequential()` wrapper.
- Session memory feeds back into away summary and compact prompts.

---

## 7. Auto Memory Consolidation ("AutoDream")

**What it is:** After ≥5 sessions and ≥24 hours, fires a background `/dream` consolidation pass to merge per-session notes into a persistent `MEMORY.md` (the long-term memory entrypoint).

**Why it matters:** The product remembers the user across weeks. Makes Jait feel like a persistent collaborator, not a stateless tool.

**Claude Code locations:**
- `src/services/autoDream/autoDream.ts` — orchestration, gates, lock management
- `src/services/autoDream/consolidationPrompt.ts` — consolidation prompt builder
- `src/services/autoDream/consolidationLock.ts` — prevents concurrent consolidation
- `src/memdir/memdir.ts` — `MEMORY.md` read/write with line+byte caps

**Implementation notes:**
- Gate order (cheapest first): time → session count → file lock.
- `SESSION_SCAN_INTERVAL_MS = 10min` throttles the session-count stat call.
- `MAX_ENTRYPOINT_LINES = 200` / `MAX_ENTRYPOINT_BYTES = 25_000` — prevents unbounded growth.
- Lock file tracks consolidation to prevent races across processes.
- Fires via the same `registerPostSamplingHook` infrastructure as session memory.

---

## 8. Speculative Execution

**What it is:** While the user is reading the last response, Claude Code speculatively runs the predicted next agent turn in a forked process. If the user's next message matches the prediction, the result is accepted instantly — zero-latency response.

**Why it matters:** P50 latency for follow-up turns approaches zero. Massive UX win for interactive back-and-forth.

**Claude Code locations:**
- `src/services/PromptSuggestion/speculation.ts` — fork + speculative run
- `src/services/PromptSuggestion/promptSuggestion.ts` — suggestion generation heuristics
- `src/utils/forkedAgent.ts` — `runForkedAgent`, `createCacheSafeParams`

**Implementation notes:**
- `MAX_SPECULATION_TURNS = 20`, `MAX_SPECULATION_MESSAGES = 100` caps resource use.
- Uses `createCacheSafeParams` to share prompt cache — speculation is nearly free on cache hits.
- If the user's actual message doesn't match, the speculative result is discarded cleanly.
- `commandHasAnyCd` blocks speculation on directory-changing commands (state safety).

---

## 9. Bash/Shell Security Hardening

**What it is:** Exhaustive pattern-based security checks on every shell command before execution. Catches injection vectors that bypass naive allow/deny lists.

**Why it matters:** Jait's `execute.ts` and `path-guard.ts` are much simpler. The attack surface for shell tools is large; Claude Code's pattern set represents ~2 years of red-teaming.

**Claude Code location:** `src/tools/BashTool/bashSecurity.ts`

**Key patterns to port:**
- Zsh process substitution: `<(...)`, `>(...)`, `=(cmd)`
- `$()` / `${}` command/parameter substitution
- `zmodload` — gateway to `zsh/mapfile`, `zsh/net/tcp`, `zsh/zpty` (silent network exfiltration)
- `zmodload`-enabled builtins: `sysopen`, `syswrite`, `ztcp`, `zsocket`, `zpty`
- Heredoc-in-substitution: `/\$\(.*<</`
- PowerShell comment syntax in bash contexts: `<#`
- Malformed tokens and shell quote single-quote bugs

---

## 10. Coordinator Mode (Multi-Agent Orchestrator)

**What it is:** A top-level agent that spawns and manages named sub-agents (`TeamCreateTool` / `TeamDeleteTool` / `SendMessageTool`), each with its own restricted tool set and session context.

**Why it matters:** Jait has `agent-loop.ts` but no formal coordinator pattern. Coordinator mode enables safe parallelisation — web search, file editing, and shell work can run concurrently without trampling each other.

**Claude Code locations:**
- `src/coordinator/coordinatorMode.ts` — mode detection and session resumption
- `src/tools/TeamCreateTool/` / `src/tools/TeamDeleteTool/`
- `src/tools/SendMessageTool/`

**Implementation notes:**
- `INTERNAL_WORKER_TOOLS` set gates which tools workers expose vs. the coordinator.
- `matchSessionMode()` handles resuming a coordinator session when mode env var is mismatched.
- Workers are isolated — a crashed sub-agent doesn't kill the coordinator.

---

## 11. LSP Integration

**What it is:** Connects to the active language server to get real-time diagnostics, symbols, and hover info instead of re-reading files from disk.

**Why it matters:** Tool calls that incorporate live type errors and symbol resolution are far more precise than pure text search.

**Claude Code locations:**
- `src/services/lsp/LSPServerManager.ts` — lifecycle management
- `src/services/lsp/LSPClient.ts` — LSP protocol client
- `src/services/lsp/LSPDiagnosticRegistry.ts` — caches diagnostics per file

**Implementation notes:**
- `LSPTool` exposes diagnostics directly as a tool the model can call.
- `passiveFeedback.ts` tracks when LSP suggestions are accepted — improves future relevance.
- Server instances are per-language, lazily started.

---

## 12. Secret Scanner on Shared Memory Sync

**What it is:** Before syncing team memory files, scans content for credential patterns (API keys, tokens, connection strings).

**Why it matters:** Jait syncs memory/context across surfaces. Without a scan, a model that writes a secret to memory would propagate it to all connected clients.

**Claude Code location:** `src/services/teamMemorySync/secretScanner.ts`

**Implementation notes:**
- Regex-based, not ML — fast and deterministic.
- Blocks the sync write if a match is found, surfaces an error to the user.
- Worth running on any write to: memory files, shared thread context, export.

---

## 13. Prompt Cache Break Detection

**What it is:** Tracks whether the prompt cache was hit or invalidated. Fires analytics and can warn when cache efficiency drops unexpectedly.

**Why it matters:** Jait supports multiple providers (Claude, GPT, Gemini). Knowing when prompt reordering invalidates cache can inform prompt structure — direct cost impact.

**Claude Code location:** `src/services/api/promptCacheBreakDetection.ts`

**Implementation notes:**
- `notifyCompaction()` resets the baseline after a compact so false positives don't fire.
- Threshold-based: only warns after N consecutive misses.
- Can be provider-scoped — only relevant for Claude (Anthropic prompt caching).

---

## 14. Plugin / Bundled Skills System

**What it is:** Skills are prompt+tool bundles that ship with the binary (`bundledSkills.ts`) or are installed from a marketplace. Users can also author local skills as markdown files in `.claude/skills/`.

**Why it matters:** Enables the product to be extended without touching core code. Third-party skill authors become a distribution channel.

**Claude Code locations:**
- `src/skills/bundledSkills.ts` — `registerBundledSkill()` API
- `src/skills/loadSkillsDir.ts` — loads user/project skill directories
- `src/services/plugins/officialRegistry.ts` — marketplace registry
- `src/services/plugins/PluginInstallationManager.ts` — install/uninstall lifecycle

**Implementation notes:**
- `BundledSkillDefinition` supports: `allowedTools`, `model`, `hooks`, `files` (bundled reference files extracted on first use), `context: 'inline' | 'fork'`.
- `argumentHint` and `whenToUse` fields improve model-side skill selection.
- `disableModelInvocation` flag allows purely UI/utility skills.
