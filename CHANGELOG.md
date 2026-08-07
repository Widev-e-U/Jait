# Changelog

This changelog is generated from git history. Each "version up" must regenerate
it (see the Release & Deployment section in `AGENTS.md`). Entries are listed
newest-first; each release links back to the commits that shipped in it.

## [v0.1.687](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.687) — 2026-08-07
- fix(web): lazy-loaded history no longer snaps to the top — scrolling up to paginate now restores your exact viewport position. The old restore ran a single `requestAnimationFrame` after `onLoadMore`, but that fetch is async, so the list hadn't grown by the time it measured; the correction was always `+= 0` and the batch then landed with `scrollTop` untouched. The list is now scroll-anchored by picking the first item still on screen and preserving its offset through the reflow (via `pickScrollAnchor` / `scrollAnchorDelta`), so prepending older messages keeps you exactly where you were.
- fix(web): scroll position no longer flickers while a streaming sub-agent is open — a single scroll-anchor primitive now guards both the lazy-load path and the live streaming path. Anchoring the first on-screen item (with a sub-pixel epsilon so a scroll write isn't emitted for jitter that would itself look like flicker) keeps the viewport pinned during streaming even when a tool/sub-agent card is streaming alongside the main turn.
- feat(web): the chat loading skeleton now fills the full viewport height and mirrors real conversation proportions — ten bottom-anchored turns (user prompts 1–2 lines in the narrow right-aligned bubble, assistant replies 3–6 full-width lines with an avatar), ending on an assistant turn against the composer, so it reads as a real scrolled-to-end chat rather than a generic list and reflows naturally when messages arrive.
- fix(web): re-entering a chat that this tab is already streaming directly no longer opens a second resume consumer — both consumers were appending token chunks into the same turn and rendering duplicated/interleaved text that existed only on screen. The direct stream now hands off to a resume stream when it ends.
- fix(gateway): reconnect snapshots no longer report every in-flight tool call as already-succeeded — an explicit `running` status is set on `accumulateToolStart` and cleared on result, so a long-running sub-agent card comes back as running instead of looking finished and frozen.
- fix(gateway): leaving a chat mid-run and returning no longer leaves a stuck, child-less duplicate tool card — the live accumulator already replays the in-flight turn's nested sub-agent calls (which the raw LLM `tool_calls` cannot carry), so pending rounds are no longer also emitted as their own bubbles.
- feat(gateway): delegated threads now render inline as real sub-agent turns — a thread started from a chat forwards its provider events (tokens, thinking, tool start/output/result) as `NestedAgentEvent`s keyed by thread id on the calling turn, so each thread gets its own card (making `create_many` work without interleaving), instead of only living behind the threads UI. Detached threads still run behind the threads UI as before.
- fix(gateway): streamed tool-call deltas no longer collapse into one garbage call when a compatible backend omits the OpenAI `index` field — slots are now resolved by unique tool-call id (falling back to index), instead of defaulting every fragment to slot 0 and concatenating names like "searchweb_fetchfile_read" with unparseable args.
- feat(gateway): irreversible shell commands now always re-ask for consent regardless of accumulated trust or approve-all sessions. Since consent is granted per tool, a single `terminal.run` approval could previously authorize `git stash`, `git checkout --`, `git reset --hard`, `git clean -f`, `git rm`, force-push, `rm -rf`, `pkill`/`killall`, or `mkfs`/`dd` — commands that destroy uncommitted work or kill processes by pattern. These are classified by `classifyIrreversibleCommand` and surfaced as a high-risk, "dangerous" consent prompt. Ordinary outward-facing commands like `git push`/deploy are deliberately excluded.
- feat(gateway): sub-agents no longer expose a round cap at all — the `maxRounds` parameter was removed from the `agent`/`agent.spawn` tools, since a cap truncates a specialist mid-task and its partial work then gets reported back as if finished. Specialists run until done or until a behavioral guard (duplicate-call detection) stops them; the swarm/role prompts were updated to match.

## [v0.1.686](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.686) — 2026-08-06
- feat(gateway + web): sub-agents now render as real chat turns instead of a flat log
  - gateway: the `agent`/`agent.spawn` tools emit a sub-agent's live work (its reasoning, its own assistant prose, and every tool it runs) as `NestedAgentEvent`s that are stamped with the owning tool call and forwarded onto the parent turn's event stream, wired through a new `onNestedEvent` tool-context callback. A new `thinking` output channel keeps reasoning separate from output so the UI can render it as a proper thinking block.
  - web: extracted a shared `AssistantBody` renderer (thinking block + tool cards + markdown) used by both normal chat messages and sub-agent tool cards. A sub-agent now renders with the standard tool-call card header, a one-line ellipsed delegated description with a "Show more" toggle, a borderless inner body, and its work ordered as it actually ran — multiple interleaved thinking blocks and tool calls — via new `childSegments` captured from the live event stream (with a best-effort fallback for historical messages).

## [v0.1.685](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.685) — 2026-08-06
- feat(gateway): real duplicate tool-call loop detection in the agent loop — if the model emits the exact same tool call(s) (same name + args) for `MAX_DUPLICATE_CALL_STREAK` (3) consecutive rounds, the loop now nudges the model to break out (up to `MAX_DUPLICATE_CALL_INTERVENTIONS` (2) times) and, if the nudge is ignored, ends the turn with an explanatory stop message instead of looping forever. This is the actual backstop for the repeated-call failure mode; the previous comments/prompts referenced "loop detectors" that didn't exist.
- feat(gateway): swarm mode now forces delegation — the coordinator is nudged to hand off work to a specialist once it has made `SWARM_MAX_UNDELEGATED_READS` (6) direct read/search-style calls without ever calling the agent tool, since the orchestration allowlist blocks mutating tools but not reads (so a coordinator could previously stay "compliant" while never delegating).

## [v0.1.684](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.684) — 2026-08-06
- feat(gateway): Swarm mode is now hard-enforced — the coordinator is restricted to a fixed set of orchestration tools (read, search, web, todo, jait, agent, agent.spawn, agent.message, thread.control, etc.); any attempt to use an implementation tool (edit, execute, terminal.run, browser.*, cron.add, ...) is blocked at the loop level and returned as an error telling it to delegate to a specialist sub-agent via the `agent` tool instead of merely being instructed to.
- feat(gateway): Swarm mode picks from named specialist teams (Developer, Research, Content, Security, Ops) instead of one flat roster, and can invent a new named team on the spot when none fit — both the full swarm system prompt and the per-provider mode block now render from a shared `SWARM_TEAMS` registry.
- fix(web): per-chat provider/model selection no longer resets to the project default when switching projects or chats — a chat's own saved `chat.cliModels`/`chat.provider` selection is now merged over (and takes priority over) the shared project-level cache, and the eager project-cache value used for instant switch feedback no longer gets written back to the server and clobbering the real per-chat selection.
- fix(web): mobile chat scroll no longer flickers when scrolling up during a streaming message — a touch drag in the "reveal earlier content" direction now detaches from the bottom immediately (mirroring the existing wheel behavior), instead of waiting on a scroll-event heuristic that missed native momentum scrolling after the finger lifts.
- fix(web): the merged consent/approve row shown above the chat composer no longer overflows on narrow mobile widths — added `flex-wrap` (matching the sibling compact action card), right-aligned the button group, and collapsed the "Approve all" button to icon-only below the `sm` breakpoint.

## [v0.1.680](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.680) — 2026-08-06
- feat(gateway + web): voice assistant gets full Jait tool access
  - The Realtime voice assistant now exposes the full tool registry (minus external/MCP tools) to the model and routes calls through the consent-aware executor, so it can read files, run commands, search memory, and more — gated by the same consent rules as the main agent (the voice-assistant consent bypass was removed).
  - Defaults moved to the newer `gpt-realtime-2.1` model and `semantic_vad` turn detection.
- feat(web): voice overlay shows the active project title
- feat(web): sub-agent delegated prompt gets a "Show more" toggle
- fix(gateway): sub-agents no longer hit a hard 8-round cap by default
  - Sub-agents now run until done or until a behavioral guard (tool-loop / duplicate / unproductive detection) stops them, matching the main agent loop; a positive `maxRounds` still acts as a hard backstop.

## [v0.1.679](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.679) — 2026-08-06
- feat(web): render swarm specialists as flat normal-chat rows with inline work

## [v0.1.678](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.678) — 2026-08-06
- feat(web): git-diff indicator self-fetches status & only shows for repo-backed projects
  - The project-chat git-diff pill now runs `git status` itself (refreshed every 15s) instead of waiting for the composer's enriched file list, so insertions/deletions appear as soon as there are changes.
  - It is only rendered when the active project has a repository assigned (`getProjectRepositoryId`), so loose folders without a repo no longer show an empty/`0` pill even if a `.git` is present.
- feat(web): session chat icon reflects the provider, not the model
  - The per-chat provider badge in the session/project list now uses the same icon as the provider/model selector, so e.g. a Jait chat running a deepseek model shows the Jait logo rather than DeepSeek. `providerIconFor`/`providerLabelFor` are now exported from the selector for reuse.

## [v0.1.677](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.677) — 2026-08-06
- fix(gateway): never re-send a queued chat message after a WebSocket drop
  - When a message was queued server-side but the client delivered it directly via `POST /api/chat` while the WebSocket was down, the end-of-turn drain (or a stale client re-push after reconnect) could re-send it — the "already sent but still queued" duplicate. The direct send now removes the matching queued entry and tracks its id as consumed, so the drain filters re-introductions and the message is sent exactly once.

## [v0.1.676](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.676) — 2026-08-06
- feat(gateway + web): CLI provider turns now capture estimated metrics in the LLM context-flow trace
  - Codex / Claude Code / Pi turns previously produced a context-flow with no numbers, so "View LLM context" opened to just round headers. Now, once each turn completes (never during streaming), Jait estimates prompt tokens from the setup messages actually sent and completion tokens from the response + tool calls, derives latency and tokens/sec from real timing, and estimates a context-window breakdown. Metrics are persisted with the message and lazy-loaded on demand.
  - CLI turns now also emit a `context_usage` event, so the context-window indicator shows in the chat region for CLI providers too.
  - Historical flows persisted without metrics are enriched lazily (tokens + context; latency is unavailable retroactively) when the trace dialog is opened — no load-time cost.
  - The trace dialog renders "—" for latency instead of a misleading "0ms" when no timing data exists.
- feat(web): git-diff indicator in project chats
  - A small up/down diff pill (insertions/deletions) now sits in the top-left of a project chat, mirroring the context-window indicator on the top-right. Clicking it opens the project editor with the source-control (Git) tab focused.
  - The context-window and git indicators shrink on mobile so they don't get in the way.
- feat(web): move the context-window indicator from the app header into the chat region (top-right)
- feat(gateway): task-appropriate swarm specialists + sub-agent communicative acts
  - Swarm mode assembles a small task-specific specialist lineup (Research / Implementation / Testing / Validation) and delegates each concurrently via the `agent` tool, sequencing dependent roles; sub-agent prompts and results render as markdown.
  - Sub-agents tag final answers with a FIPA-ACL performative (`[INFORM]` / `[PROPOSE]` / `[REFUSE]` / `[FAILURE]` / `[QUERY]` / `[AGREE]`) so a refused/failed/querying sub-agent is treated as unresolved instead of a silent success.
  - Fail fast with an actionable message when a Claude Code CLI model alias leaks into HTTP-based swarm/sub-agent delegation.
- feat(gateway + web): per-chat provider/model persistence
  - Each chat remembers its own last-picked provider/model/reasoning-effort (`chat.provider` UI-state key, persisted onto the session row via `PATCH /api/sessions`), and the session/project list shows a provider icon per chat without subscribing to live session state.
- feat(web): conversation scroll detachment
  - Once the user scrolls up away from the bottom, the chat stops following newly streamed content until they scroll back down to the bottom edge.
- feat(web): consent queue cleanup
  - Single-row pending-request summary in the merged composer surface and neutral risk/level badges.
- fix(gateway): reconnect snapshots keep real tool-call elapsed time
  - Tool-call start times are tracked live so a reload mid-tool-call no longer resets the elapsed-time display to ~0ms even after the tool ran for minutes.
- fix(gateway): cap read-tool output by bytes
  - A single read is capped at 50KB in addition to the line cap, so huge files can't silently balloon conversation context.

## [v0.1.675](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.675) — 2026-08-05
- feat(gateway + web): task-appropriate swarm specialists + markdown sub-agent output (`9924415c`)
  - Swarm prompts (live `getSwarmModeInstructions` and legacy `SYSTEM_PROMPT_SWARM`) now deploy a small curated specialist roster — Research, Implementation, Testing, and Validation — tailored to the specific task rather than a fixed full developer team. The coordinator states the chosen lineup and why, then delegates each specialist concurrently via the `agent` tool, sequencing dependent roles (e.g. Implementation first, then Testing + Validation against its output).
  - Sub-agent and tool results now render as markdown via `MessageResponse` instead of plain pre-wrapped text, with the delegated prompt collapsed to a single hover-revealed line.
- feat(calendar): month-grid view + copyable OAuth redirect URI (`6ac03a7c`)
  - Calendar page gains a List/Month view toggle with a navigable month grid (prev/next month, Today) that fetches events scoped to the viewed month.
  - Settings now surfaces the exact authorized redirect URI with a copy button and a link to the Google Cloud OAuth credentials console; the `config` and `connect` endpoints return the `redirectUri` so the UI can display it.

## [v0.1.674](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.674) — 2026-08-05
- feat(web): neutralize sub-agent cards + simplify consent UI (`57de617a`)
  - Removed the purple gradient "workspace" cards from swarm/sub-agent tool-call cards. The delegated prompt now renders inside a neutral bordered "Delegated task" panel (instead of a bare, un-bordered chat bubble) so it reads as contained within the sub-agent; the performative badge (Declined / Failed / Proposed options / etc.) moved up into the compact metadata line next to rounds / tools / duration.
  - Consent `RiskBadge` / `ConsentLevelBadge` changed from colored filled pills to neutral muted text with a small colored status dot.
  - Consent queue header dropped the profile / configured-tools policy line for a cleaner single-line pending-count.

## [v0.1.673](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.673) — 2026-08-05
- feat(gateway + web): agent-to-agent communicative acts + swarm delegation rework (`546188e3`)
  - Sub-agents now tag their final answer with a FIPA-ACL-inspired performative — `[INFORM]`, `[PROPOSE]`, `[REFUSE]`, `[FAILURE]`, `[QUERY]`, or `[AGREE]` — which the parent parses so a refused/failed/querying sub-agent is treated as `ok:false` (unresolved) instead of a silent success.
  - Swarm mode reworked: the coordinator now recommends a tailored specialist lineup, then delegates one `agent` tool call per specialist (run concurrently as visible sub-agents) instead of forcing a `thread.control create_many` first call; prompts updated.
  - Sub-agent cards restyled as a two-line exchange: the delegation prompt renders as a muted chat bubble (matching Jait's own user-message bubble) and the specialist's reply as plain flowing text, with a performative badge (Declined / Failed / Proposed options / etc.) in the card header.
  - Thread-list activity now pairs `tool.start`/`tool.result` into `ToolCallCard` entries and polls while the swarm thread is active.

## [v0.1.672](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.672) — 2026-08-05
- fix(gateway): fall back to ACP tool kind for tool names — community ACP wrappers (pi-acp, cursor-agent-acp, deepagents-acp) often skip `title` on `tool_call` updates, so names fell back to an opaque toolCallId; now prefer `kind` (`execute`/`fetch`/`delete`/etc.) before the ID, and add tool-card meta for the new kinds (`a489c534`)
- feat(gateway + web): general changelog for the Settings page — `/api/update/changelog` now accepts a `limit` param returning the N most-recent releases (ignoring `from`), so the Settings changelog page shows recent notes even when already on the latest version, with a current/latest badge (`486ca04e`)
- feat(gateway): raise read tool line cap to 6000 — whole files fit in a single read by default; only pass `startLine`/`endLine` for larger files, with agent-mode prompts updated to match (`10d4745e`)

## [v0.1.671](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.671) — 2026-08-04
- fix(web): refine chat loading skeleton to match real message styling — transparent text-only assistant turns and right-aligned primary-tinted user bubbles instead of generic chat-bubble placeholders (`e0fe97c4`)

## [v0.1.670](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.670) — 2026-08-04
- feat(gateway): surface background-terminal command completions as a visible gray system-notice line in the chat (with terminal id + exit code), persisted across reloads, instead of hiding them entirely
- fix(gateway + web): make hidden system-notification (background command) turns stream live to the client — broadcast `message.started` for injected turns and reset the resume-stream seq baseline on each snapshot — so the chat no longer freezes until a manual reload
- fix(web): load chat history behind a skeleton and wait for the server snapshot to be evaluated and merged before rendering (no stale-cache-then-update flash), replacing the loading spinner with a skeleton
- feat(gateway): forward ACP provider reasoning (`agent_thought_chunk`) as a collapsible "Thinking" block in the live stream

## [v0.1.669](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.669) — 2026-08-04
- feat(gateway): pi-style agent loop — execute independent tool calls in parallel by default (explicit opt-out for stateful/ordering-sensitive tools) and persist thinking across rounds for reasoning continuity, so tasks finish in fewer, batched round-trips

## [v0.1.668](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.668) — 2026-08-04
- fix(web): remove duplicated settings link in header nav overflow menu (`59971db5`)

## [v0.1.667](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.667) — 2026-08-04
- feat(gateway): add patch notes to the version-up flow — new `/api/update/changelog` endpoint (GitHub commit diffs) plus a dedicated Settings "Changelog" page and a hover tooltip on the update button showing what's new in the target version
- docs: require regenerating `CHANGELOG.md` from git history on every version up

## [v0.1.666](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.666) — 2026-08-04
- feat: swarm sub-agent cards in chat, pretext height utility, agent-loop cleanup (`16b27adf`)

## [v0.1.665](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.665) — 2026-08-04
- feat: session unread indicator, official Pi logo, nav + tool card polish (`36f84620`)

## [v0.1.664](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.664) — 2026-08-04
- feat: widen chat surface, harden search truncation, authenticated consent WS, tool display names (`57ff061b`)

## [v0.1.663](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.663) — 2026-08-04
- feat(gateway): detect narrow-range read thrashing in agent loop, + read line numbers in UI (`8e5ae1aa`)

## [v0.1.662](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.662) — 2026-08-04
- feat(web): add brand icons for ACP providers (Cursor, Pi, Gemini, DeepAgents) (`1dd6aca0`)
