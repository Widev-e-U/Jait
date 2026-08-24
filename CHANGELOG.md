# Changelog

This changelog is generated from git history. Each "version up" must regenerate
it (see the Release & Deployment section in `AGENTS.md`). Entries are listed
newest-first; each release links back to the commits that shipped in it.

## [v0.1.758](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.758) — 2026-08-24
- feat(web): show live read-only terminal in tool cards — 9553da12
- feat(gateway): route provider terminals to Jait surfaces — 58871719

## [v0.1.757](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.757) — 2026-08-24
- fix(web): keep SSE stream attached across send and mid-answer reconnect — 9c0b3141
- fix(gateway): remove CLI turn inactivity watchdog — fe7f6fe0
- fix(web): make empty header regions draggable in electron — 9e5f7a46

## [v0.1.756](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.756) — 2026-08-23
- fix(gateway): finish with a persisted fallback answer when a round delivers only empty/timing-noise reasoning — 489bb810

## [v0.1.755](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.755) — 2026-08-23
- feat(web): show waiting-for-approval state and summary on pending tool calls — 29f9d383

## [v0.1.754](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.754) — 2026-08-23
- fix(gateway): keep CLI turns parked on approval past inactivity timeout — aab0501d

## [v0.1.753](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.753) — 2026-08-23
- fix(web): stop auto-restore from re-enabling a deactivated code editor — ba7eb40f

## [v0.1.752](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.752) — 2026-08-22
- fix(web): render editor-mode status icon blue (instead of theme primary) in the project list even when the project is not currently being viewed, and muted gray when inactive

## [v0.1.749](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.749) — 2026-08-22
- fix(mobile): restore Android release build — AgentOverlayPlugin still called the removed WearBridge.relayQuestion, so :app:compileReleaseJavaWithJavac failed and the v0.1.748 release never shipped an APK; switch it to relayAttention (the v0.1.747 attention rename)

## [v0.1.748](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.748) — 2026-08-22
- fix(release): republish @jait/shared with the attentionKey export the gateway v0.1.747 imports at runtime — the previous release added it to shared source without bumping its version, so the published gateway resolved the stale @jait/shared@0.1.75 and crashed on startup with "does not provide an export named 'attentionKey'"

## [v0.1.747](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.747) — 2026-08-22
- feat(gateway,web,mobile): once-per-device notifications via stable attention key; fix watch app + dark/light mode; release v0.1.747 — 2a2b4198

## [v0.1.746](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.746) — 2026-08-22
- fix(web): update session-selector test for always-present 'Personal chats' drop target; release v0.1.746 — 3f0c63d9
- chore: sync bun.lock with workspace package versions — c8410624

## [v0.1.745](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.745) — 2026-08-21
- chore: release v0.1.745 — 17c74336

## [v0.1.744](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.744) — 2026-08-21
- feat(web): drag chats between projects/personal; fix edit-composer swarm target + sub-agent mission modal alignment; release v0.1.744 — 352eafff

## [v0.1.743](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.743) — 2026-08-20
- feat(gateway,web): remote bg-command completion routing, disk retention janitor, shell-prompt + prewarm; release v0.1.743 — a2a1d935

## [v0.1.742](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.742) — 2026-08-20
- fix(web): fix minimap rail scrubbing — pan on rail scale, sizer offset in content coords, pointer capture; release v0.1.742 — 79eedc0e

## [v0.1.741](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.741) — 2026-08-19
- fix(web): keep collapsed tool-card header in view via manual scroll nudge; release v0.1.741 — 0ca085de

## [v0.1.740](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.740) — 2026-08-19
- fix(web): slide content up and scroll collapsed tool card into view; smooth user-message alignment — a08d67f0
- ci: use system CA for release asset upload — 2ae4ffd4

## [v0.1.739](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.739) — 2026-08-18
- fix(web): align minimap scroll math with real scroll range and sizer offset — 1d23bfed

## [v0.1.738](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.738) — 2026-08-18
- fix(web): make chat scroll-to-bottom reach the true end and add jump-to-previous-message button — 4455a43b

## [v0.1.737](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.737) — 2026-08-18
- fix(web): restore ChatGPT-style new-turn top anchoring in chat scroll — 15aee771

## [v0.1.736](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.736) — 2026-08-18
- fix(web): keep global new chat personal after opening a project — 4add9d3d
- refactor(web): extract chat minimap into a dedicated component with tests — 3f6460da

## [v0.1.735](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.735) — 2026-08-17
- fix(web): persist per-project editor layout across switches and reloads — 0c499945

## [v0.1.734](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.734) — 2026-08-17
- chore(release): retry npm publishing after GitHub rate-limited the checkout action during the v0.1.733 release

## [v0.1.733](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.733) — 2026-08-17
- fix(web): map minimap rows to persisted semantic bands and stabilize provider picker — 3c9dd9e9

## [v0.1.732](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.732) — 2026-08-17
- fix(web): render all chat lines in minimap including thinking and tool rows — 0f398916

## [v0.1.731](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.731) — 2026-08-17
- fix(web): persist per-project panel layout and surface missing project paths — eb728631

## [v0.1.730](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.730) — 2026-08-17
- fix(web): refine chat scrolling and provider picker — d2cf0793

## [v0.1.729](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.729) — 2026-08-17
- release: v0.1.729 — c59961c7

## [v0.1.728](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.728) — 2026-08-16
- fix(web): make resumed chat streams generation-owned and self-healing — a 3s snapshot handshake timeout and 40s heartbeat watchdog abort hung SSE connections, fresh snapshots repair missed events, retryable HTTP/body/EOF failures reconnect, stale generations cannot write, and failed handshakes keep jittered exponential backoff until a healthy snapshot resets it
- feat(web): expand the trajectory view into a full step inspector with request/provider metadata, context-usage steps, complete tool payloads/results, nested call ids, completion timing, searchable details, and responsive tabbed summary panels while keeping the chat composer outside the trajectory pane
- feat(gateway + web): add an authenticated model-catalogue reset endpoint and Settings actions for every provider group, clearing gateway and browser caches so the next model-picker open fetches the current provider list
- feat(shared + gateway + web): persist terminal height and split-column width per project, restore and clamp them on project switches, report changes only after drag completion, and merge partial layout updates without discarding saved dimensions or visibility
- feat(web): combine projects and root-level personal chats into one searchable `Projects & Chats` sidebar hierarchy with a dedicated new-chat action and unified empty/search states
- fix(web): make fenced-code highlighting react to light/dark theme changes, normalize common language aliases with plain-text fallback, highlight completed responses immediately, and retain a short debounce only while code is streaming

## [v0.1.727](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.727) — 2026-08-16
- fix(gateway + web): persist a sub-agent tool call's ordered child segments (thinking / text / nested tool groups) in the streaming accumulator and replay them in reload snapshots, so a reconnected or reloaded chat renders the sub-agent card's full interleaved history instead of only its newest part
- refactor(web): theme the SSE debug and trajectory panels with the app's context-indicator palette and popover/muted/border tokens so they follow light/dark theme switching instead of a fixed dark palette (done/error keep explicit status colors)

## [v0.1.726](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.726) — 2026-08-16
- fix(gateway + web): add a cross-round replayed-reasoning guard to `runAgentLoop` that pairs verbatim thinking with the same tool-call signature and stops the turn (after one corrective steer) instead of letting a deterministic provider (Ollama / `deepseek-v4-flash:0731-cloud`) burn the whole round budget replaying the same reasoning + quarantined call
- fix(gateway + web): emit a `content_rollback` event whenever the loop discards a generation after streaming (runaway repetition / replayed-reasoning loop) and roll back the live token/segment accumulators in the CLI chat route, the web streaming hook, and the provider adapter so reload snapshots don't persist content the loop itself removed

## [v0.1.725](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.725) — 2026-08-16
- feat(gateway): add a typed `request` variant to the gateway's `StreamEvent` union so the turn-boundary event is constructed as a typed `StreamEvent` instead of `as unknown as StreamEvent`
- feat(shared + gateway + web): add a shared `TrajectoryStreamEvent` type in `@jait/shared` (re-exported from the types barrel and root) and use it in both the gateway trajectory SSE endpoint and the web debug hook, removing the duplicated inline interface
- fix(gateway): make the search regex-retry path deterministic on CI runners without ripgrep by injecting a fake `rg` through the existing `rgCommand` runtime hook

## [v0.1.724](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.724) — 2026-08-16
- feat(gateway): per-session trajectory SSE endpoint (`GET /api/sessions/:sessionId/trajectory`) that replays the persisted stream-event log then forwards live events, staying open across turns with a 15s keepalive — so a trajectory/debug view shows a session's full history (even after reload or session switch) and keeps following new turns
- feat(gateway): persist every stream event to a new bounded `session_events` table (20k rows/session, pruned incrementally) and emit a synthetic `request` turn-boundary event at turn start, making the gateway the single source for trajectory turn boundaries instead of a client-synthesized push
- feat(web): trajectory panel now streams the gateway's per-session trajectory (history replay + live) with dedup by `log_id`, capped exponential backoff reconnect, and a live-connection indicator dot; the in-memory debug log is only used when no session is active
- fix(web): force-reconnect the sidebar socket on window resume — mobile browsers can suspend the socket in the background without firing `close`, so a reconnect unconditionally re-pushes the authoritative snapshot and never leaves a stale streaming spinner after the tab is hidden
- fix(web): gate the patch-notes hover card behind `(hover: hover) and (pointer: fine)` so touch devices don't get a covering full-width bottom sheet that blocks the update button
- fix(web): hide the GitDiffIndicator overlay in trajectory/debug mode so it no longer covers the panel
- fix(gateway): isolate failing stream subscribers — a client that disconnected a moment ago can no longer abort event delivery to the other subscribers

## [v0.1.723](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.723) — 2026-08-16
- fix(gateway): kill the search retry loop that dominated broken turns — a search root that does not exist, a `path` pointing at a file, or a missing ripgrep all used to surface as the same unfixable "ripgrep is unavailable and Git is required" error, which the model could only respond to by retrying (one turn reached 1034 calls); search now resolves relative paths against the project root, validates the root up front as a named input error, separates a sync-throw ENOTDIR from a missing binary, walks files natively with a compiled `.gitignore` engine (the same approach Codex CLI uses, so no binary is required), treats `git ls-files` as an optimization rather than a requirement, and degrades regex to an explicit literal-text search with a message that says repeating the call will not change the result
- fix(gateway): bound repeated tool calls hard — a lifetime cap of 10 per exact call per turn that interventions never reset, plus quarantine of any call that returns the identical error twice, with the steering message naming the actual error instead of "you already have that result"; together these terminate the interleaved-repeat loops the round-streak and per-turn counters could not
- feat(gateway): persist sub-agent transcripts — a sub-agent that fails, times out, or is cancelled now writes its partial content, ordered segments, and executed tool calls to a new `sub_agent_history` table (the parent message keeps a light stub), so a reloaded chat renders the turn up to where it stopped instead of a bare error stub
- fix(gateway): deliver the turn-`done` SSE event to mid-run resume subscribers — the per-session sequence counter is now cleared only after the done event is sequenced, so a client reconnecting mid-turn (snapshot seq >= 1) actually receives it and the stream closes instead of hanging on "loading"
- fix(gateway): record turn-ending errors (rate limits, quota, transport failures) at their live transcript position so a reload keeps the red marker where the turn stopped
- fix(web): render sub-agent tool calls on reload from the persisted tool data, and append a turn-ending gateway error to the in-flight message inline instead of spawning a second bubble
- fix(desktop): port the search fixes to the desktop node's own search implementation — same native ignore-aware walker, root validation, and fallback degradation, so remote/desktop projects do not hit the old dead-end either

## [v0.1.722](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.722) — 2026-08-15
- fix(web): align the debug panel scrollbar with the content center — the trajectory and SSE debug panels no longer use the virtualizer, whose fixed `estimateSize` for non-rendered rows made `getTotalSize()` drift so the native scrollbar thumb lost the content center; rendering all rows in normal flow makes the scrollbar reflect the true content height exactly, with auto-scroll-to-bottom preserved via `scrollTop = scrollHeight`

## [v0.1.721](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.721) — 2026-08-15
- fix(chat): trajectory view replaces only the chat transcript, keeping the composer in place
- feat(debug): trajectory panel live-streaming auto-scroll (stick-to-bottom with user-scroll detach), opens at the newest step, and scrollbar row estimates
- fix(debug): accurate collapsed row height for the SSE debug panel virtualizer
- fix(session-selector): project menu opens at the cursor on right-click / touch long-press
- feat(settings): add the Nodes tab trigger

## [v0.1.720](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.720) — 2026-08-15
- feat(chat): conversation minimap with 1:1 line mapping, fixed pitch, and a content-band indicator
- fix(useChat): trajectory mode replaces the entire chat and streaming stays consistent
- feat(gateway): `OMNIROUTE_MAX_MODELS` env override for the model-picker cap

## [v0.1.719](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.719) — 2026-08-15
- fix(chat): restore access to the Trajectory debug panel from inside a chat — the desktop developer sidebar footer now has a Trajectory button (Bug icon) that toggles the trajectory panel for any active session, and the mobile toolbar's debug button now appears for any developer chat (previously only project chats) with its tooltip renamed to "Trajectory", so the trajectory view is reachable again on both desktop and mobile after the last release dropped the toolbar entry point

## [v0.1.718](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.718) — 2026-08-15
- feat(debug): add a trajectory debug panel alongside the existing SSE view — the developer-mode debug drawer now has Trajectory and SSE tabs, where Trajectory reconstructs the agent's model trajectory (provider/model/mode, direction/feedback, files) from the live chat and lets you scrub through it; a small `trajectory-builder` turns raw chat events into the ordered trajectory the panel renders
- feat(settings): replace the debug toggle in the developer sidebar with a Settings button that opens the Settings view directly, so the full settings page is one click away from a project instead of being buried in the project menu
- fix(settings): make the settings search box actually find results across pages — searching now auto-jumps to the first tab whose content matches the query (and tabs that never filter stay reachable so they can't hijack an active search); the provider-accounts card was also moved out of the general tab into the API tab so it renders as a real section there
- perf(conversation): rewrite the conversation minimap to mirror real transcript lines instead of arbitrary character-count chunks — preview lines are now wrapped at the same column width as the prose and laid out at the transcript's real line-height pitch, so each rail line maps 1:1 to an actual line and already-painted lines hold still while a streaming turn grows instead of re-splitting on every chunk
- feat(ui): replace the no-op tooltip shim with a real dependency-free tooltip (portal + fixed positioning + hover/focus triggers) that keeps the shadcn/radix component API, so tooltips actually show across the app without pulling in the Radix ref-composition path that tripped the React 19 update-depth loop
- feat(node-permissions): add an `agent` capability and gate agent-execution provider ops behind it — `start-session`, `send-turn`, and `stop-session` (the session lifecycle ops proxied by `RemoteCliProvider`) now require the node to have the "Agent" capability granted, otherwise the call is denied outright instead of being proxied to an unconfigured node; auth/listing ops stay ungated
- fix(gateway): make `nodes.update-permissions` accept `nodeId`/`grants` at the message top level or nested in `payload` — the web "Nodes & Permissions" settings tab sent them at the top level while the handler only read `payload`, so saving permissions on a node returned BAD_REQUEST `"nodes.update-permissions requires nodeId and grants"` and the settings could never be saved; the sender now nests them in `payload` and the handler accepts both shapes
- fix(project-panel): convert the git auto-fetch mode `<select>` to the app's styled Select component in both the project header and footer so it matches the rest of the chrome
- fix(chat): offset the context-usage indicator to the left of the minimap scrollbar on desktop so it isn't hidden underneath it

## [v0.1.717](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.717) — 2026-08-15
- fix(gateway): stop editing or resending a user message from silently eating the assistant answers around it — `restart-from` resolved the target against the in-memory history but deleted from the `messages` table, two lists that drift apart (hydration drops system notices, a live turn pushes one entry per tool round, a cancelled turn can persist a row that was never pushed), so an edit either deleted a preceding answer or failed to delete the edited row and left a duplicate; target resolution and deletion now both run on the persisted rows the client's ids actually come from, and the in-memory history is re-hydrated from what survived instead of index-sliced

## [v0.1.716](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.716) — 2026-08-15
- fix(web): stop the conversation from snapping back to the bottom right after a minimap scrub — the minimap moves the container by writing `scrollTop`, which the wheel/touch handlers never see, so the scroll handler re-armed stick-to-bottom and the 500ms bottom-sync poll dragged the view back to the end; a scrub now detaches exactly like scrolling by hand, and drops a stale scroll anchor instead of letting the next reflow pull the view back to where the scrub started

## [v0.1.715](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.715) — 2026-08-15
- feat(gateway): node capability permission model — every node that says hello is persisted with a deny-all grant map (terminal, filesystem, screen, voice, browser, camera, network), enforced at the WebSocket route boundary, with denials written to the consent log and `nodes.list` / `nodes.get` / `nodes.update-permissions` control messages to inspect and change grants
- feat(web): "Nodes & Permissions" settings tab plus an onboarding gate that surfaces newly seen nodes so their capabilities can be granted deliberately instead of implicitly
- feat(gateway): Windows VM sandbox (`windows.sandbox.start` / `windows.sandbox.stop`) built on `dockurr/windows`, with an RDP + web-viewer endpoint, KVM acceleration, persistent disk under `$JAIT_WINDOWS_SANDBOX_STORAGE`, and docker/compose files for standalone testing
- feat(gateway): Linux desktop sandbox (`linux.desktop.sandbox.start` / `linux.desktop.sandbox.stop`) and an `os-control` layer with Windows (SSH-driven) and Linux desktop drivers behind a shared resolver, so `os.*` screenshot/click/type/exec tools run against a sandboxed desktop
- feat(gateway): Codex-style context compaction — history now stays verbatim until usage crosses 85% of the model window and then summarizes once, replacing the tiered tool-result crushing that kept erasing file contents the model had just read
- feat(gateway): serve the real provider/model list to the jobs UI (including expanded jait-backend models) instead of a hardcoded OpenAI/Ollama stub, and let jobs carry a description
- fix(web): require every question in a user-questions prompt to be answered before submit, so mobile-web sends the complete answer map, and keep the submit row pinned while the prompt scrolls
- test(gateway): cover node permissions, the sandbox manager, and the os-control resolver; make the Ollama e2e suite opt-in via `OLLAMA_E2E=1` so it stops failing on machines that cannot load the 26B model

## [v0.1.714](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.714) — 2026-08-15
- feat(web): polish the conversation minimap scroll bar — right-aligned user-turn preview lines, centered viewport indicator, reactive scroll-container ref
- fix(gateway): replace the bare `require()` in screenshot-tools with top-level `node:fs` / `node:path` imports for ESM

## [v0.1.713](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.713) — 2026-08-14
- feat(gateway): stop the agent loop from stacking a fresh "keep going" reminder every 4 rounds — one live copy now replaces the previous one and re-injects the session's todo list, so the goal survives context compaction instead of being thrown away with the plan-creating tool result
- feat(gateway): detect investigation-without-progress (rounds that only read/search and complete no plan step) — re-anchor the model on the goal after 12 such rounds, and withhold tools for one round after 24 so the model has to answer instead of circling forever
- feat(gateway): drop superseded file reads from history before any lossy compaction, so duplicate content stops being the cause of the compaction that forces the next re-read; run the recoverable tool-result compaction before the destructive active-turn collapse, and make the collapse budget-driven so it only removes as many oldest rounds as needed
- feat(gateway): raise the active-turn keep window from 3 to 8 rounds so recently read file contents stay readable instead of being collapsed into summaries that force re-reads
- feat(web): upgrade the conversation minimap from one bar per message to a VSCode/Rider-style content preview — one thin line per text line, blue for user turns, muted for agent turns, derived from the virtualizer's measurement cache so the full history stays on the rail while scrolling; memoize the preview lines and cache per-message line shapes so streaming re-splits only the message that changed

## [v0.1.711](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.711) — 2026-08-13
- fix(web): show editor mode as a read-only status glyph beside each project instead of a toggle button, so the icon tells the user whether editor mode is active; the sidebar editor button remains the activation control
- fix(web): route chat archiving through the confirmation dialog so it always asks before archiving
- fix(web): use explicit red styling for archive/remove actions so they no longer look grayed out in dark mode
- fix(web): bound the mobile provider-model dialog and patch-notes tooltip to the viewport so they no longer overflow the screen

## [v0.1.710](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.710) — 2026-08-13
- feat(web): add a "Sign in to GitHub" action to the pull-requests authentication error so a missing GitHub credential can be fixed from within Jait; it opens the forge setup dialog pre-targeted at the selected repository
- feat(web): keep project action menus visible on desktop without hovering, and add a per-project editor-mode indicator (with toggle) left of the menu that opens the editor for the active project or switches to that project first
- fix(web): stop the project settings dialog from clipping the left focus ring on its inputs by reserving left padding inside the scroll area
- fix(web): keep the in-memory project's sessions when a project PATCH response omits them, so the chat list no longer appears empty until a reload
- fix(gateway): read gateway-owned absolute files (such as installed skills) locally even while a project is remote, avoiding bogus Windows-mangled paths on remote nodes

## [v0.1.709](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.709) — 2026-08-12
- feat(web): add a built-in Light Plus Monaco theme so light mode uses the real VS Code light-plus scopes instead of the plain `vs` fallback; load both Dark Plus and Light Plus into the Shiki highlighter and register them with Monaco, with light palette overrides that match the app shell, and drop the hand-written dark-plus fallback rules in favour of the live bundled theme scopes
- feat(web): persist project panel/tree widths per-project (previously a single global localStorage value); sizes are reported only on drag end and merged with the current tree/editor visibility so a size-only update never drops them
- fix(web): reset tree/editor visibility to the defaults when switching projects so the previous project's layout does not leak into the next while its saved layout is still loading
- fix(web): respect a saved desktop project layout as-is, so an explicitly fully-collapsed layout stays collapsed instead of forcing the editor open
- fix(web): show the project button in the developer sidebar as soon as a project id is active, even before the project object finishes loading

## [v0.1.708](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.708) — 2026-08-11
- fix(desktop): stop injecting the unstable prerelease `features.code_mode` configuration that current stable Codex rejects at startup, which broke Jait-orchestrated Codex sessions on Windows before any prompt could be sent (`f3631cfb`)

## [v0.1.707](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.707) — 2026-08-11
- fix(web): hide the header's overflow "…" menu entirely when no nav items have overflowed, so an empty 3-dot menu never appears (`c24913db`)

## [v0.1.706](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.706) — 2026-08-11
- feat(gateway): add `jait update` command to install and restart the latest gateway (or a specific version) (`b676931f`)
- fix(web): move the header's progressive overflow menu to the right of the visible items so collapsed entries disappear toward the "…" control, align the dropdown right, and reserve trigger width while resizing (`d2bf4338`)

## [v0.1.705](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.705) — 2026-08-11
- fix(web): keep chat transcript hooks unconditional so the empty-to-loaded render cannot crash with React error #310; enforce the Rules of Hooks in the standard lint/CI path (`8a97559b`)

## [v0.1.704](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.704) — 2026-08-11
- feat(projects): nest projects in folders with instructions, descriptions, colours, and optional repository assignments (`f0d989f6`)
- feat(gateway): add OmniRoute as a configurable Jait LLM backend with model discovery and connection testing (`0e6ba270`)
- feat(persistence): bound stored context and tool-call payloads, suppress noisy streaming activity from session search, add opt-in incremental retention, and keep startup migrations fast on multi-gigabyte databases (`b50af04e`)
- feat(search): rank bounded project/code-search results across gateway, remote nodes, and desktop while enforcing literal argv execution, ownership checks, ignore rules, output caps, and safe fallbacks (`b50af04e`)
- feat(pull requests): add conflict inspection and resolution workflows, harden Git/path handling, and bind every GitHub operation to the authenticated user's encrypted token instead of shared gateway credentials (`b50af04e`)
- fix(agent + chat): preserve reasoning effort through threads and providers, improve cancellation/background continuation, tighten tool-loop persistence, and stabilize message editing, mobile project controls, and provider selection (`b50af04e`)
- test: isolate gateway and E2E databases from live Jait data, add fail-then-pass authorization/search regressions, and benchmark migrations against large database copies (`b50af04e`)
- fix(gateway): keep the provider-account test double compatible with the provider type contract (`69a7581c`)

## [v0.1.703](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.703) — 2026-08-10
- fix(web): persist per-project manager provider, refresh thread on WS reconnect, markdown reasoning (`f0fd4b3f`)
- fix(gateway): reject quarantined tool calls and repeated reasoning without ending the turn (`75c7c01e`)

## [v0.1.702](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.702) — 2026-08-10
- feat: real MCP SDK bridge, large-repo fast worktrees, session-scoped streams (`c1006dad`)

## [v0.1.701](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.701) — 2026-08-10
- test(e2e): isolate dev stack and stabilize flaky specs (`099ecfd7`)
- fix(gateway): one-round quarantine of repeated tools after duplicate-call nudges (`8fc8d398`)
- fix(web): clickable paths in reasoning, secret tool-card, preview routing, ws env (`92f262db`)
- feat(web): surface ACP provider version, distribution and description in settings (`ea1bde5f`)
- feat(gateway): registry-driven ACP provider catalog with first-use installs (`2a572eef`)
- test(gateway): make streaming cadence assertion deterministic (`e3e29fcd`)

## [v0.1.700](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.700) — 2026-08-09
- fix: stabilize chat startup and session streaming (`10077c8e`)

## [v0.1.699](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.699) — 2026-08-09
- fix(gateway): compact completed active-turn work to prevent context-driven tool loops (`a8e672d8`)

## [v0.1.698](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.698) — 2026-08-09
- feat: improve provider reasoning and chat continuity (`5e0847e0`)

## [v0.1.697](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.697) — 2026-08-08
- feat: Telegram channel assistant through the OpenClaw extension (#233) (`5d53ff06`)
- feat: move chats between projects from the sidebar context menu (#235) (`0b6e4281`)
- feat(web): central, customizable keyboard shortcut system (#234) (`1d283488`)

## [v0.1.696](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.696) — 2026-08-08
- fix(gateway): gateway projects now self-heal stale repository device assignments before Manager provider scoping, and remote node registration no longer claims repositories whose paths already exist on the gateway; selecting the Jait repo therefore shows its gateway provider accounts instead of incorrectly limiting Manager to Jait.

## [v0.1.695](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.695) — 2026-08-08
- fix(web): developer and Manager modes now keep independent provider/model selections; switching modes no longer replaces the chat's developer provider with Jait, and Manager's picker includes provider accounts advertised by the selected repositories' nodes.
- fix(web): the conversation loading skeleton again spans the full viewport with alternating realistic turns, beginning and ending with user-message placeholders instead of collapsing to a three-turn block at the bottom.

## [v0.1.694](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.694) — 2026-08-08
- fix(web): Manager thread composers now preserve the explicitly selected matching repository when duplicate records share a path across different devices, so the provider/model picker remains scoped to the selected repo node and shows that node's provider accounts instead of falling back to Jait only.
- feat(web): Manager mode now exposes the global model selector in the app header, while session performance aggregation is deferred until the context details dialog opens to avoid scanning long conversations during ordinary rendering.
- fix(gateway): chat snapshots no longer touch multi-megabyte context-flow blobs; lightweight sidecar metadata preserves context/memory badges, stored traces are capped at 512 KB even after metrics are attached, and latest-assistant updates avoid loading full histories.
- feat(gateway + web): queued chat messages can be held/locked; a held head item blocks both client and server auto-drain until the user explicitly unlocks it.
- fix(gateway): agent-loop safety now includes a 64-round default backstop, a 200-round absolute ceiling, per-round duplicate collapse, a 64-call round cap, and recurring-call detection across non-consecutive rounds.
- fix(web): tool, approval, and nested-agent stream events flush pending paced text synchronously, preserving order without stalling the SSE reader behind long prose.
- fix(mobile): Android now requests notification permission at launch and microphone permission before voice capture through a native Capacitor bridge, with `RECORD_AUDIO` declared in the manifest.

## [v0.1.693](https://github.com/Widev-e-U/Jait/releases/tag/v0.1.693) — 2026-08-08
- fix(web): the chat loading skeleton now reads as a single exchange — one user prompt, one agent reply, then the user's latest prompt — instead of a run of assistant turns ending in two user messages back-to-back, so the placeholder mirrors a real scrolled-to-end chat.
- fix(web): swarm-mode live streaming no longer stalls — the direct-POST SSE reader loop previously awaited the text pacer before each tool event, so the (long) swarm `mode_notice` text blocked the loop and the coordinator's tool card + specialist prose didn't render until a reload. Tool events now call `textPacer.flushNow()`, which drains pending text synchronously so tool/sub-agent content commits immediately without blocking the loop on rAF/deadline timers.
- feat(web): the context-window indicator's detail dialog now also surfaces session-level performance metrics (completion/prompt tokens, tokens-per-second, text written, total duration) aggregated lazily from already-persisted per-message metrics.
- fix(web): on mobile the floating edit composer now stays pinned just above the on-screen keyboard (tracked via the visual viewport) and the message being edited is scrolled into view, so it isn't pushed out of the viewport when the keyboard opens.
- feat(web): a sub-agent's delegation prompt is now a sticky header pinned to the top of its inline chat, collapsed to a single truncating line with a "Show more" toggle, so it stays in view while scrolling the run's history.
- fix(web): agent tool calls now collapse into a wrapper for all providers (including the Jait loop), not just non-Jait providers, so multi-tool turns render consistently.
- fix(web): the merged in-composer approval row (e.g. the terminal/`execute` tool needing consent) no longer wraps onto a second line on narrow/mobile screens — the row is now `flex-nowrap` with the summary truncating instead of wrapping, so the tool icon, name, preview and Approve/Reject stay on a single line.
- fix(web): the tiny "copy chat id" icon button no longer gets blown up to 40px wide by the global mobile `button[aria-label]` min-width rule — it now overrides `min-width: 0` so it hugs the icon without dead space beside the project label.

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
