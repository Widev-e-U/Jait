# Changelog

This changelog is generated from git history. Each "version up" must regenerate
it (see the Release & Deployment section in `AGENTS.md`). Entries are listed
newest-first; each release links back to the commits that shipped in it.

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
