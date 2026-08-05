# Changelog

This changelog is generated from git history. Each "version up" must regenerate
it (see the Release & Deployment section in `AGENTS.md`). Entries are listed
newest-first; each release links back to the commits that shipped in it.

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
