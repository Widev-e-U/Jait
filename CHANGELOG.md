# Changelog

This changelog is generated from git history. Each "version up" must regenerate
it (see the Release & Deployment section in `AGENTS.md`). Entries are listed
newest-first; each release links back to the commits that shipped in it.

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
