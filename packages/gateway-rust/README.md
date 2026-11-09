# Native Rust gateway

## Component repairs and portability wave — 2026-11-05

`maintenance.ts` now formats timestamps with the reference `toLocaleDateString()` behavior: unpadded `M/D/YYYY` taken from the local-timezone calendar day of an RFC 3339 value, replacing the previous ISO `%Y-%m-%d` output. The crate tests passed 8/8 under `TZ=UTC`, `TZ=America/New_York` and `TZ=Asia/Tokyo` (`.jait/artifacts/gateway-rust/preview-history/maintenance-locale-tz.log`) and the contract harness passed 9/9 (`maintenance-harness.log`); measured Bun reference values are `11/5/2026` in UTC and Tokyo, `11/4/2026` in New York for `2026-11-05T02:30:00Z`, and `12/31/2025` in New York for `2026-01-01T00:00:00Z`, with `LANG=de_DE` still yielding en-US. The ledger row is `implemented` with this partial evidence; the reference's remaining call sites and full component validation are still open.

`browser_handoff.ts` is ported and its focused crate tests passed 19/19 (`.jait/artifacts/gateway-rust/preview-history/browser-handoff-focused.log`); it remains implemented-but-unverified because no runtime handoff transport or effect-authority registration exists yet.

`git-forge.ts` was promoted from `partial` to `implemented`-but-unverified after recording two passing evidence sets: the contract target `tests/contract/tests/verify_git_forge_pr.rs` passed 9/9 (provider selectors and credential aliases, GitHub/GitLab/Azure remote and web URL construction, branch and selector injection rejection, PR create URLs, and merged/pushed/conflict payload shapes) and the crate session tests passed 9/9 at the time (14/14 today, after the token-helper and `resolve_token` regressions moved into `mod tests`), cancellation and denial before process launch, changed-argv and ambient-routing denial, credential redaction, branch encoding, remote-identity escapes, merged-state preservation). Verification is withheld because the reference's live session methods (auth checks, default branch, existing-PR lookup, PR creation, checks, diff stats) are not yet driven by a contract target through the injected process pool. CLI presence probes were then aligned with the reference `cliAvailable` catch-all: a failed `gh`/`az` probe now reports "not installed" (`Ok(false)`) instead of surfacing a command failure, while cancellation, denial, invalid input and unsupported-provider errors stay explicit. Two regressions were added — a pure mapper contract and an Azure fixture showing a successful probe yielding `true` and a non-zero exit yielding `false` — covered by the `git_forge::azure_tests` target (7/7). The reference `resolveToken` chain then gained native counterparts in `src/services/git_forge.rs`: `token_environment_names` reproduces the per-provider environment probe order, `token_from_environment` short-circuits on the first non-empty value without trimming, and `resolve_token` reproduces the GitHub-only `git credential fill` fallback (stdin exactly `protocol=https\nhost=github.com\n\n`, 5 s budget, password-field parsing) degrading to `None` on every failure instead of rejecting, with the subprocess caller-supplied so authorization, the process pool and cancellation stay centralized. Three independently written regressions cover environment short-circuiting, the GitHub-only credential fallback and failure degradation. A single focused run of `git_forge::` now passes 21/21 (14 in `git_forge::tests`, 7 in `git_forge::azure_tests`; `.jait/artifacts/gateway-rust/preview-history/git-forge-resolve-token.log`); the contract target stayed 9/9 after the change. The row stays `implemented`-but-unverified: `resolve_token` is a library seam with no wired token-login flow, `loginWithToken`'s authenticated session is still unimplemented, and live provider sessions never run against a real provider. GitLab/Gitea/Bitbucket availability is credential-driven via `src/services/git_forge_http.rs` rather than CLI-driven.

Seven previously absent reference files were ported in this wave and exercised by their focused targets (`ports-focused-batch.log`: 7 targets, exit 0); `browser_cursor.ts` is deliberately unported and stays `absent`.

Ledger counts after these changes (classifications, not a fresh audit): originals 370 = 319 verified / 47 partial / 4 implemented / 0 absent; newer additions 13 = 5 verified / 7 implemented / 1 absent / 0 partial. Native coverage, runtime integration and production readiness remain separate, and the full frozen-source gate stays deferred until all implementation is integrated.

Null or missing content in room-name and fallback member events now fails after state updates; a focused actual-crate regression passed (1/1), recorded in `.jait/artifacts/gateway-rust/preview-history/messenger-null-state-content-focused.log`. Null state entries and other malformed event representations remain open; this is partial evidence only.

Room account and ephemeral event collections now follow JavaScript iterable failure order, retaining earlier existing-room updates. Focused actual-crate regression passed (1/1): `.jait/artifacts/gateway-rust/preview-history/messenger-room-iterable-focused.log`. This is partial evidence, not component verification.

## Messenger room event collections — 2026-11-05

Malformed state and timeline collections now fail before state updates, preserving existing-room membership and avoiding insertion of a new room. Nullish state fallback also respects a present empty string. The focused actual-crate regression passed (1/1): `.jait/artifacts/gateway-rust/preview-history/messenger-room-collections-focused.log`. This is partial evidence; other malformed event behavior and component verification remain open.

## Messenger account event iteration — 2026-11-05

Sync now rejects non-iterable account event collections before room updates, while accepting null, arrays, and strings as the TypeScript path does. The focused actual-crate regression passed (1/1): `.jait/artifacts/gateway-rust/preview-history/messenger-account-iterable-focused.log`. This is partial evidence, not component verification; malformed room event collections remain under review.

## Messenger sync key ordering — 2026-11-05

Direct-message account entries, room sections, and room IDs now use JavaScript property enumeration for integer-like keys. A focused actual-crate test passed for the selected direct counterpart and partial room state before a malformed receipt; a separate section-order regression and the focused sync tests now pass (30/30), with previously ignored sync results asserted. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-assertions-focused.log` and `.jait/artifacts/gateway-rust/preview-history/messenger-room-direct-order-focused.log`. This is partial evidence, not component verification; A focused regression also covers non-object room entries and null failure state: `.jait/artifacts/gateway-rust/preview-history/messenger-non-object-focused.log`. Broader malformed input behavior remains under review.

## Messenger network retry — 2026-11-05

Sync request failures now use the SDK’s same randomized 5–15 second retry as callback failures, while retaining reconnecting status and cancellation. A focused paused-clock actual-crate test passed across four repeated retries. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-network-backoff-focused.log`. This is partial evidence and does not promote component verification.

## Messenger callback retry — 2026-11-05

The sync callback error path now waits a randomized 5–15 seconds, matching the installed matrix-bot-sdk 0.8.0 retry interval; entropy failure falls back to five seconds. Focused paused-clock actual-crate tests passed 2/2, covering token reuse on retry and cancellation during the wait. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-callback-backoff-focused.log`. This is partial evidence only; other input ordering and component validation remain open.

## Messenger receipt input ordering — 2026-11-05

Receipt event IDs and reader IDs now follow JavaScript property enumeration: numeric array indices precede other keys. A focused actual-crate regression confirms prior updates are applied in that order before a malformed receipt aborts processing (1 passed). Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-receipt-input-order-focused.log`. This is partial evidence, not component verification; callback backoff, other input ordering, token and cancellation behavior remain open.

## Messenger malformed receipt investigation — 2026-11-05

A JavaScript semantics probe confirms that null outer receipt content and null
per-event types throw, while string content enumerates UTF-16 indices. Evidence:
`.jait/artifacts/gateway-rust/preview-history/messenger-null-receipt-semantics.log`.
The installed Matrix SDK advances its in-memory token before awaiting the sync
callback; callback errors enter its backoff path without calling the gateway's
`doSync` failure callback. TypeScript inserts a new room only after processing
its receipts, while Rust currently inserts it earlier. The native path now returns an error for these null cases, retains earlier receipt
updates for existing rooms, discards a newly inserted room on error, and advances
the token before the callback. A focused crate regression passed 1/1; evidence is
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-null-focused.log`.
A subsequent focused regression passed 2/2: existing-room summary and unread
updates precede a malformed receipt, while the pagination token is not committed.
Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-null-order-focused.log`.
This was partial evidence; subsequent retry and token/cancellation tests are recorded above. Remaining mutation and input ordering need review. This does not promote component coverage.

## ACP permission compatibility decision — 2026-11-05

A boolean approval does not express consent for future tool calls. The native ACP
approval helper selects only the corresponding `allow_once` or `reject_once`
option; if it is absent, it sends the agent a cancelled outcome and returns an
error. This intentionally differs from the TypeScript ACP provider, which selects
the first matching allow/reject option and can therefore select a persistent
choice. The focused `persistent_only_approval_cancels_and_reports_failure` test
passed (execution `01a1ad32-ff09-7e2d-bb04-279144b20579`); it tests the helper,
not an integrated HTTP request.

Client evidence: `apps/web/src/hooks/useChat.ts` sends a boolean and optimistically
shows the decision, reverting to an error on a non-2xx response;
`apps/web/src/lib/agents-api.ts` also sends a boolean and throws on non-2xx. The
future adapter and approval routes must propagate the helper error as non-2xx and
be tested end to end, including thread UI behavior. Until then, this decision does
not establish client compatibility or runtime integration and grants no component
verification credit.

The focused `notification_checks_session_before_mutating_mapper` regression passed
1/1 (execution `01a1ad36-6973-7c3f-867d-730ada176c09`): mismatched or missing
ACP identities and a missing update are rejected before mapper state changes,
while a valid update uses the gateway session identity. The transport still emits
raw update activity for a future session owner to route through this mapper; the
regression does not test that integration. `route_transport_event` now provides
the validated handoff for raw transport update envelopes. Focused test
`transport_updates_are_validated_before_mapping` passed 1/1 (execution
`01a1ad39-cbb2-7d2a-a10a-e30b0212d2e1`) using a child-process stream: a foreign
session update is rejected before mutation and a matching update maps to the
gateway identity. This handoff still has no supervised owner caller. Source
review previously found no caller of `agentsApi.approveToolCall` under `apps/web/src`.
The Threads page now passes explicit decisions from tool cards to that API and
refreshes recorded activities; worker `01a1ad3e-dd96-73d7-b208-cebef5008073`
reports 10 thread-page and 98 tool-card focused tests passed. These tests do not
exercise browser clicks or end-to-end provider delivery. The thread approval HTTP route now
requires a nonempty request ID and an explicit boolean decision; the focused
`requires an explicit thread approval decision and request identity` regression
passed 1/1 (execution `01a1ad3d-8584-78bf-b79d-a336405129c4`). The web activity
mapper retains request IDs and restores recorded decisions; its focused test file
passed 10/10 in worker `01a1ad3b-4ed0-79ca-ba77-44d813bd784a`. Recorded
responses only establish that the adapter returned. The thread route now selects
an owner-scoped provider, rejects remote-node and Jait approvals as unsupported,
and records a response only after the adapter returns successfully. ACP now
rejects an unknown or already resolved request instead of silently succeeding.
Focused route and ACP boundary regressions passed 2/2 (execution
`01a1ad40-ba7d-713b-8b43-c526e26ec7e6`); a subsequent route regression also
passed with remote fallback covered (execution `01a1ad41-0f43-7d2f-b628-dc18bc001501`).
These intentional changes make stale or unsupported decisions fail rather than
appear successful; other adapters and end-to-end client behavior remain to be
verified. The stricter route rejects formerly implicit approval; the existing web
API caller already sends both fields, but other client compatibility remains
unverified. Selection fetches and explicit refreshes now share a generation guard.
The focused Chromium fixture `automation-refresh.spec.ts` passed (execution
`01a1ad49-a475-7b02-b270-adaa518209db`), covering overlapping refreshes, a
selection fetch superseded by a refresh, and switching away and back. A subsequent
run (`01a1ad4c-95ca-743d-a7b9-dea55b417d6c`) also covered disabling and
re-enabling while a refresh is pending. Hydration now shares that guard; Chromium execution
`01a1ad4f-17d1-73ee-a092-f40e6e6212aa` passed two cases, including an older
hydration response after a newer refresh and a return to the cached thread. Live
events arriving during selection, refresh, or hydration snapshots are reconciled
with the snapshot; Chromium execution `01a1ad51-cd5c-7f25-9b7a-5adb4221fa81`
passed three cases. These fixture tests do not exercise the real provider or HTTP
decision flow. The one-time-only ACP policy
intentionally differs from the TypeScript client's first matching option; client
compatibility evidence remains open. A read-only client audit found both chat and
thread UI decisions carry a boolean without permission duration; the TypeScript
ACP adapter may select a persistent or positional fallback option. The audit
did not exercise a live provider or establish client compatibility.

A single-turn ACP owner has been added in `providers/acp_provider.rs`; worker
`01a1ad42-e960-7551-95fa-5bc8d368be36` reports two focused tests passing for
approval/interrupt during a prompt and a mismatched session update. It is not yet
wired into the runtime registry or provider entry point. Raw transport now bounds
queued event count and fails visibly on overload; worker tests report three focused
pressure cases and 64 ACP provider tests passing (`.jait/artifacts/acp-raw-pressure-tests.log`
and `.jait/artifacts/acp-transport-regression-tests.log`). Frame size remains unbounded,
overload client compatibility and descendant cleanup are unproven, and multi-turn
ownership and end-to-end decision delivery remain open. No component verification credit
is promoted.

## Preview lifecycle draft — 2026-11-05

The unregistered preview owner can identify an in-flight generation for joining
and conditionally reuse a ready generation while preserving or explicitly changing
sharing. The host must independently authorize callers, serialize liveness and
input checks with reuse, bound and supervise waiters, and cancel and drain startup
and late resources. Ten standalone module tests passed, including generation,
sharing and cancellation-state cases. This is draft-level evidence; browser
ownership, runtime integration and client compatibility remain open, and the
preview component remains partial. The native route now has a typed adapter for
`POST /api/preview/history`, but remains unmounted and its earlier verification is
historical; the coverage ledger marks it partial.

## Janitor safety and intake boundary — 2026-11-05

Old empty worktree containers are discovered and reported in dry runs, but live
removal now fails closed: a descriptor and inode check cannot prevent replacement
of the parent directory entry before name-based removal. The focused janitor
suite passed 15/15, including the fail-closed and changed-contents cases. Same-pass
container cleanup, enforceable namespace exclusion, notification parity and a
production authority and lifecycle remain open; the ledger remains partial.

The intake route currently parses into `serde_json::Value`, which rejects escaped
lone surrogates before the service. Exact parity requires a code-unit-preserving
route and service representation as well as compatible storage and serialization;
the adapter remains unmounted. Its split-surrogate matching regression passed
again, but this does not establish end-to-end compatibility. An unregistered
`github_intake_utf16.rs` primitive preserves UTF-16 units in bounded individual
JSON string tokens and passed four standalone tests, including all code units and
a split surrogate at the 201-unit boundary. It does not parse whole JSON documents
or establish SQLite, route, service, or response compatibility.

## Loop and intake compatibility follow-up — 2026-11-05

The native chat-loop instructions, progress review and turn-limit checkpoint
text now follow the live TypeScript source. The focused live differential suite
`gateway_rust_chat_loops` passed 28/28, including UTF-16 checkpoint truncation,
both limits and error precedence. This is focused evidence, not final component
verification against a frozen source snapshot.

The unmounted intake adapter no longer matches a rule when a 201-unit JavaScript
truncation splits a supplementary character; its focused boundary regression
passed. SQLite storage and read parity for the resulting isolated surrogate
remain unresolved. A Bun 1.3.10 direct SQLite probe stored a split surrogate
as invalid UTF-8 TEXT, which Rust `String` reads reject; Bun read behavior also
varied with the byte sequence and length. The byte-level observations and probe
limits are in `.jait/artifacts/github-surrogate-probe/REPORT.md`. Escaped lone
surrogates also encounter a JSON parser difference before the Rust service. Do
not treat the boundary regression or raw-byte insertion as end-to-end parity.

The 06:33 UTC reference-drift snapshot records 35 changed reference hashes,
33 from the original 370, including 21 originals historically marked verified.
See `.jait/artifacts/gateway-rust/chat-loops/reference-drift-20261105.json`;
these historical labels need reconciliation and no credit was promoted. The
original 370, 13 inventoried additions and five further live additions remain
separate as described below. Runtime integration and replacement, platform,
load, recovery, rollback and activation gates remain open.

## Shutdown and consent review — 2026-11-05

The janitor now exposes a stop-and-drain operation for admitted runs and rejects
new runs after stopping. Its focused retained-permit regression passed. The host
must call it before runtime shutdown; independent planning, descendant process
quiescence, and shared writer authority remain outside its guarantee.

The focused `batch` test selection passed 33/33 after correcting a stale
waiter assertion to expect the new finalization error; abandoned operations
and panics remain indeterminate and cannot be retried.

Consent batch claim can publish a resolution before fallible finalization. A
subscriber may observe a resolution while the waiter receives a finalization
error; client reconciliation and a compatibility decision are required before
mounting. Operation replay remains in-memory and does not prove durable effects.

## Additional live intake source — 2026-11-05

The unmounted GitHub app route candidate now exposes authenticated intake GET
and PUT through an optional host port, and returns 503 on webhook intake or
sink failure. Three focused tests passed for rule bounds, signature rejection,
sink failures, authenticated ownership and tenant-scoped route calls. A staged
SQLite intake adapter persists observe-only rules and idempotent decisions
scoped by user and agent. The focused `cargo test --lib intake` selection
passed nine tests, including an authenticated router-to-database flow, signed
delivery replay, database reopen and concurrent delivery across eight SQLite
connections with a five-second busy timeout. Production host wiring and live
TypeScript differential evidence remain incomplete; existing contract fixtures
retain an absent intake port.


A read-only live inventory audit using the coverage capture's path and test
exclusions found 388 gateway runtime paths: the original 370 and 18 additions.
The recorded coverage inventories contain 383 paths (370 originals and 13
additions). Five further live additions are recorded without verification credit
in `.jait/artifacts/gateway-rust/chat-loops/live-uninventoried-additions.json`,
but are not yet represented in either coverage inventory: `packages/gateway/src/http-shutdown.ts`,
`packages/gateway/src/services/browser-intelligence.ts`,
`packages/gateway/src/services/browser-workflows.ts`,
`packages/gateway/src/services/github-intake.ts`, and
`packages/gateway/src/tools/browser-workflow-tools.ts`. These are tracked
separately pending classification and evidence; their presence does not imply
native implementation or verification. Counts reflect this workspace at audit time.
The intake service supplies persistent observe-only rules and decisions; native
integration remains incomplete. No component credit is awarded.


## Continuation and cleanup follow-up — 2026-11-05

The consent route treats early resolved events as provisional and reconciles them
before forwarding; transition-in-flight and unrecoverable states fail closed.
A future host must serialize recovery and raw event receivers cannot assume an
early event is final. Durable replay remains unimplemented. The janitor has no
runtime shutdown owner; direct-child reap does not prove escaped descendants
have stopped. Shared writer authority and host-owned containment remain open.


The staged consent batch operation module provides bounded, in-memory per-operation
cursors and latest-result replay, with immutable binding and snapshot boundary.
It is registered but unmounted; it does not authenticate, scan the queue, journal
effects durably, supervise finalizers, or grant authority. Restart and uncertain
effects remain unresolved before any route can use it. Five focused crate tests
passed on `consent_batch_operation.rs` SHA-256
`655596c2aa2cd4232155cea9170bbcc71507cda473159cef0dcb9760941b6b57`.

Disk janitor planning now skips recent activity without reporting an error and marks
scan failures truncated so counts are not represented as complete. Eleven focused
janitor tests passed on `disk_janitor.rs` SHA-256
`2fcc25893b5b416d2d509c61205548b386a26e1422456dd943c5aa3cd2057c93` and
`disk_janitor_tests.rs` SHA-256
`da1bdf2e2b8828a6ef2d1c6bd0a49db71e10b6e469723c739e8ac9fcc814f609`.
The ownership test uses real descriptor metadata with a simulated caller UID;
a foreign-owned fixture and notification parity remain open. Runtime wiring has
no shared authority for thread updates, writers, sandbox activity or Git process
termination; effectful cleanup remains unmounted. No coverage is promoted.

## Disk cleanup drift follow-up — 2026-11-05

Scratch and sandbox candidates now undergo bounded, no-follow nested write-age
checks during planning and immediately before deletion. Two focused `nested_activity`
tests passed on `disk_janitor.rs` SHA-256
`01e2774175034e41929cc43c08c735315e9bed1e9dd3d0dc059c37b733309c7d`
and `disk_janitor_tests.rs` SHA-256
`2e6a843afb4c1dc32ca09c9205eff7ff23f1865671c539c79ce0d6940fda4403`.
The host lease must exclude writers and renames until deletion completes. Linux
sticky-root checks now reject foreign-owned scratch entries and report a count;
two focused janitor tests passed, including a real same-owner sticky fixture and
identity and cancellation failures. A separate branch-drift regression passed:
reaping rejects a changed thread branch before removal. The latter ran on
`disk_janitor.rs` SHA-256 `37b9552ea00c3e246d480a938198bd963ad224c2c11b97b3e621f060ca30c2e6`
and `disk_janitor_tests.rs` SHA-256 `df49ff87623ba1946a5195996fd124bffd380bc497f6a3094c81dd8b0d6b04cc`.
The interrupted warning draft preserves typed removal failures and deduplicates
warnings per janitor instance. Its focused test passed on `disk_janitor.rs`
SHA-256 `d7d68d7fd0c02136d514919535075e1971b986e5fc35a0284a3afb072504a240`
and `disk_janitor_tests.rs` SHA-256
`7e60ed0a241f317fef5cf5bb9421b4bba426af425a57280ddc95e1516c613ec5`;
the log is `.jait/artifacts/gateway-rust/janitor-warning/focused.log`. Warning
wording differs from TypeScript, and delivery is delegated to an unwired host.
Foreign-UID integration, alert and notification parity, and live TypeScript
differential remain open; a reap-time ownership change is an error rather than
included in the count. Non-Linux cleanup fails closed. The ledger remains partial.
A runtime review found no production `JanitorAuthority` implementation: the
lease is an unmounted contract and must coordinate actual writers, activation,
renames and Git operations before it can protect active data. Deletion currently
precedes Git authorization, so a later denial can leave partial cleanup. Process
cancellation also needs proof that Git has exited before its lease is released.

## Consent shutdown follow-up — 2026-11-05

`cancel_all` detaches the current indexed queue before running fallible callbacks,
then settles all detached requests despite callback or clock failures. Four focused
`cancel_all_` tests passed on `consent_manager.rs` SHA-256
`9adb27e9ebd07be1fd0154a995056999dc625ad32ab244e4e1768e17e69d3aa0`.
This intentionally changes callback visibility: all requests in that snapshot
are already absent. Later admissions remain outside the snapshot, so the host
must stop admission during shutdown. Finalization is sequential and total work is
unbounded by queue size; integration and client compatibility remain open.
The web client now retains individual approval or rejection requests on non-2xx
responses; its focused reconciliation suite passed 10/10. Errors remain silent and
lost responses require later reconciliation. No native coverage is promoted.
A bounded bulk protocol still needs independent operation cursors, an immutable
queue boundary, bounded retained state, replay and crash handling, and repeated
authorization. The existing client cannot consume partial results safely; neither
the native batch nor a continuation endpoint is mounted.

## Consent follow-up — 2026-11-05

The public consent approval path now checks the deadline under the queue lock,
leaving an expired request for timeout cleanup even if dispatch is delayed. The
focused `public_approval_cannot_claim_expired_request_before_timeout_dispatch`
test passed 1/1 on `consent_manager.rs` SHA-256
`94da2486330eb9218cbb4e13eb8c466c209fb3dd6dc7b69f62354b88d56fbb1f`.
The web bulk-approval client now rejects non-2xx responses and removes only
explicitly confirmed IDs; five focused reconciliation tests passed. A lost
response may leave stale UI until refresh or a WebSocket event. Partial-batch
continuation, authenticated runtime integration, and shutdown cleanup after a
finalization failure remain open. No native coverage is promoted.

## Consent and janitor checkpoint — 2026-11-05

An unmounted consent coordinator joins bounded queue windows to volatile operation
state under a host-supplied authorization lease. Two focused coordinator tests passed after the waiter-settlement change,
including failure and replay handling. Claims occur under the lease; callback finalization occurs after
release. Host acceptance of that boundary, durable replay, supervision, client
compatibility and runtime mounting remain open. Operation ID reuse after cleanup or
restart is a host responsibility. A detached Git supervisor now retains janitor
leases through direct-child cleanup when the caller is dropped; a focused real-child
regression passed 1/1. Runtime shutdown and descendant process handling remain open.
These changes do not promote component coverage or establish production readiness.

## Thread service checkpoint — 2026-11-04

The ledger currently records 320 verified, 48 partial and 2 implemented but
unverified of the original 370 components. Of 13 later additions, 5 are verified
and 8 absent. These are historical ledger classifications, not production readiness.
A read-only audit found 35 reference hashes differ from live source, including 22
classified as verified; these require reconciliation before final verification.
The GitHub app routes entry is partial: the unmounted native candidate has intake
endpoints and retryable webhook failures, but durable service integration and
current route contract evidence remain incomplete. Prior HTTP evidence covers
the earlier reference snapshot.
The disk-janitor entry was moved to partial after live TypeScript gained nested
write-age and sticky-root ownership behavior; native follow-up remains unverified
against the full current contract.
The thread routes entry was corrected from verified to partial because lifecycle and other handlers remain unimplemented. The HTTP subset now has eight passing focused tests, including ownership filtering, deletion rollback and reviewed pagination behavior (`.jait/artifacts/gateway-rust/thread-pagination-activity-focused.log`). The 2,000-row cap and duplicate session parameters still need additional evidence. Turn and provider-subscription fences have focused tests but are not yet wired into a runtime session owner. No component was promoted in this checkpoint. The opt-in thread route mount passed
an unauthenticated-request test; it is not mounted by the application composition
and exposes only the implemented subset. Provider-event mapping passed four focused
unit tests but needs a session owner, dispatch wiring, deletion cleanup and a
TypeScript differential including its UTF-16 boundary. Recovery now cancels queued
team deliveries in a savepoint; authoritative stop-path integration remains open.
A separate pure routing differential passed ten cases; it is not an HTTP route test.
Evidence is in `.jait/artifacts/gateway-rust/thread-mount-focused.log`,
`thread-provider-events-focused.log` and `thread-router-contract-focused.log`,
with hashes in `native-coverage.json`. Replacement, platform, load, recovery,
rollback and activation gates remain open; production remains TypeScript.

## Coverage credit audit — 2026-11-03

A read-only audit of `native-coverage.json` found four entries labeled `verified`
whose own recorded review text and the current source both show the reference
behavior is unported. They are now `partial`, with the missing piece in `remaining`:

- `packages/gateway/src/surfaces/terminal.ts` — the credit verdict stays `partial`, but
  the earlier finding that only test fakes implement `TerminalControl` is stale:
  `src/surfaces/local_terminal.rs` now spawns a real PTY
  (`posix_openpt`/`grantpt`/`unlockpt`, `setsid` + `TIOCSCTTY`), serves `TerminalSurface`
  snapshots with live rows/cols, and `src/runtime/application.rs` mounts
  `TerminalRoutes` with that control on Unix (`NoTerminalControl` remains the
  fail-closed default elsewhere). The real binary reaches that composition:
  `src/main.rs` binds through `Application::bind_with_chat`, so the mounted PTY routes
  serve live traffic, while the bare `Gateway::bind` branch taken only when no chat
  configuration exists intentionally exposes health routes alone. The shell list is
  ported: `available_shells()` mirrors `availableShells()` in the reference
  (`ALLOWED_SHELLS` per platform, `/bin/zsh,/bin/bash,/bin/sh` on macOS and
  `/bin/bash,/bin/zsh,/bin/sh` elsewhere, `where`-probed `pwsh.exe`/`powershell.exe`/
  `cmd.exe` plus the two Git Bash candidates on Windows, labels from the basename with
  `.exe` stripped, Git Bash labeled `bash (Git)`), and `/api/terminals/shells` reports
  those `{shell,label}` entries. It differs in availability probing: Rust checks the
  candidate's executable mode bits instead of shelling out to `which`. Registry-owned
  reservation/ownership already exists in `routes/terminals.rs`, so it is not a gap.
  The spawn spec is ported too: `resolve_spawn_spec` reproduces
  `resolveTerminalSpawnSpec` — direct spawn unless Linux, `/usr/bin/systemd-run`
  present, `JAIT_TERMINAL_ISOLATION != "0"` and either `JAIT_TERMINAL_ISOLATION=1`
  or a service-owned `JAIT_UNIT`; then `--user --scope --quiet --collect
  --unit=jait-terminal-<id>.scope --property=OOMPolicy=kill` plus
  `MemoryHigh=1536M`/`MemoryMax=2G`/`MemorySwapMax=1G` defaults overridden only by
  `JAIT_TERMINAL_MEMORY_HIGH`/`_MAX`/`JAIT_TERMINAL_SWAP_MAX` when they match
  `<digits>` with an optional `K`/`M`/`G`/`T`/`P`/`E` suffix (case-insensitive, value
  trimmed), with the id sanitized to `[A-Za-z0-9_.-]` and truncated to 180
  chars, and the shell placed after `--`. Terminal ids now thread into `spawn_shell`
  so a live terminal receives its own scope name. Still unported: supervised
  process lifetime (scope teardown/ownership tracking after the gateway exits).
  Focused evidence only: `cargo test --lib --
  available_shells_are_allowlisted_and_labeled missing_shell_is_not_reported
  shell_route_reports_labeled_shell_entries missing_program_and_nul_arguments_fail_without_shell_interpretation`
  → 4 passed, 0 failed, and `cargo test --lib --
  isolation_unit_name_is_sanitized_and_bounded
  service_owned_terminal_runs_in_a_bounded_scope
  isolation_stays_on_when_requested_without_a_service_unit
  isolation_can_be_turned_off_or_is_unavailable
  memory_limits_fall_back_to_defaults_for_injected_values
  memory_value_accepts_only_systemd_limits
  pty_runs_command_and_reports_exit_code` → 7 passed, 0 failed; no component credit
  is claimed from either. The spawn-spec tests assert the resolved argument vector
  only — no `systemd-run` process is launched, so the scope is unproven at runtime.
  The shell-list run covers a Node-parity fix in `src/runtime/command.rs`'s
  `inspect_argument`: a NUL
  byte in a rejected argument is now rendered `\x00` like `util.inspect` instead of
  being emitted raw into the error message.
- `packages/gateway/src/pty-broker.mjs` — only the client half is ported
  (`src/pty_broker_client.rs`); no broker server counterpart exists.
- `packages/gateway/src/channels/manager.ts` — routes and contracts exist, but no
  `ChannelHost` implementation, so shouldRespond/parseCommand/notify/deliver/reply
  are unported.
- `packages/gateway/src/voice-assistant/service.ts` — `RealtimeSession` relay effects
  exist, but there is no `VoiceAssistantService` orchestrator.

A second batch re-checked every remaining entry that was `verified` while its own
review text recorded an audit verdict of `PARTIAL` (ten entries). Each was resolved
against live source and all ten are now `partial`. Credit was removed, never added:

- `packages/gateway/bin/install-runtime.mjs` — `GraphifyRuntime` ports exist and
  `GraphifyRunner::new` defaults to `runtime.ensure()`, but the runner's only caller
  is `src/services/code_graph/engine_tests.rs:124`; `src/runtime/*` and `src/main.rs`
  hold no `code_graph` reference, `routes/code_graph.rs` is never merged, and
  `tools/code_graph.rs` takes an opaque `HostPort` with no concrete provider.
- `packages/gateway/src/evaluation/agent-eval.ts` — no `evaluation::` consumer outside
  its own module; only `lib.rs` declares it.
- `packages/gateway/src/index.ts` and `packages/gateway/src/server.ts` —
  `runtime/application.rs:213-217` merges only auth, sessions and chat routes; ws,
  messenger, team-chat, update, email and voice surfaces are unmounted.
- `packages/gateway/src/services/email/index.ts` — `pub mod email;` is declared but no
  `email::router` is mounted anywhere in `src`.
- `packages/gateway/src/surfaces/index.ts` — the original reason is partly stale
  (`RemoteTerminalSurface` and the browser driver now exist), but no
  `TerminalSurface`/`TerminalSurfaceFactory` exists, so parity is still missing.
- `packages/gateway/src/voice/service.ts` — `with_voice(` has zero callers.
- `packages/gateway/src/channels/whatsapp/connector.ts` — `WhatsAppConnector` is built
  only inside `#[tokio::test]` code.
- `packages/gateway/scripts/bundle-web.mjs` and
  `packages/gateway/scripts/copy-shell-integration.mjs` — no Rust bin is invoked by
  `package.json`, CI or deploy; the Node scripts remain the live build path.

A third pass triaged every `verified` entry whose own recorded prose trips a
red-flag matcher (34 advisory hits after the two batches). Only one was a real credit
contradiction and is now `partial`:

- `packages/gateway/src/tools/index.ts` — the review opened with "PARTIAL native port",
  and `src/tools/index.rs` (232 lines) ports only persona
  `agent_id_for_context`/`for_thread` resolution over an injected
  `PersonaThreadLookup`. The `createToolRegistry` barrel and tool-list assembly of the
  757-line TS module are unported (the module doc says so explicitly), `browser.open`
  has no implementation, and `tools/contracts.rs` `REGISTRATIONS` is a declaration
  model, not registry assembly.

The other 33 hits were cleared as non-contradictions, one entry each with its matched
snippet and reason in
`.jait/artifacts/gateway-rust/coverage-audit/verified-credit-downgrade-batch3.json`
(3 + 14 + 1 + 1 + 11 + 3 + 1 = 34):
three name an injected **test double** rather than a stub module —
`evaluation/isolated-gateway-child.ts` (643-line `isolated_gateway_child.rs`) and
`os-control/linux-desktop-driver.ts` (692-line `linux_desktop.rs`) inject a recording
shell/host to assert call order, and `services/email/connection.ts` injects a transport
double ("No network: transport is an injected stub"); fourteen use "partial" as domain
semantics (partial `apply_migrations_through`, partial writes and failed-write partial
effects, partial failures, partial-line streaming, `partialContent`); one uses "stub"
for persisted message stubs (`lib/sub-agent-persistence.ts`) and one "placeholder" for
the fixed placeholder turn messages of `tools/agent-acp-runner.ts`; eleven say
"unported" about a *sibling* component (`routes/git-node-routing`, provider execution,
memory HTTP/tools, terminal host and process execution, session streaming,
`thread-history` replay, surface processes, scheduler jobs, live-view sandbox
integration) so the reviewed file's own scope is unaffected; three are explicit
no-production-activation disclaimers (`services/chat-loops.ts`,
`services/code-graph/graphify-runtime.ts`, `tools/loop-tools.ts`); one is a
declaration-only types file verified for its declared scope (`channels/types.ts`). The
matcher only escalates an explicit recorded `audit verdict` contradiction; prose alone
stays advisory, and `--strict` exits non-zero on advisory hits as well. Running
`audit_verified_labels.py --write-advisory` regenerates `advisory-hits.json` from that
same scope, so the artifact holds the auditor's 34 hits; a wider substring extraction
over `review`/`remaining`/`notes` reports 39, the five extra being path or hedge shapes
the auditor's regex intentionally excludes (`partial-result.json`,
`partial`/`nullish` in compound identifiers).

Recorded ledger after all three batches: **312/370 originals verified, 10 implemented
but unverified, 37 partial, 11 absent**; the thirteen additions remain **5 verified
and 8 absent**, for **317/383 entries verified** overall (down from 328/383 before the
audit). Evidence:
`.jait/artifacts/gateway-rust/coverage-audit/verified-credit-downgrade.json` (batch 1),
`verified-credit-downgrade-batch2.json` (batch 2) and
`verified-credit-downgrade-batch3.json` (batch 3). This audit removes credit only; it
adds no verification and no runtime integration, and it is a source-reachability
review, not a passing gate. The hardened auditor
(`coverage-audit/audit_verified_labels.py`) reports 0 hard contradictions, 0 verified
labels with non-empty `remaining`, and 0 verified labels missing contracts, targets and
`reviewed_at` **together**. That last check is a conjunction (source: the
`verified_without_contract_or_target` filter requires all three to be empty), so it does
not assert that each verified entry carries a review date. Measured per field on the
same ledger: 0 of 317 verified entries lack `contracts`, 0 lack `targets`, and **240
lack a `reviewed_at` stamp** — only 77 verified entries carry one. The ledger's
top-level `reviewed_at` is also null. So
ledger freshness for two-thirds of verified labels rests on `reference_sha256`
fingerprints rather than recorded review dates. The auditor's 34 advisory hits are the
cleared ones above, and `--write-advisory` keeps the JSON artifact in that scope.

## Active integration handoffs — 2026-11-03

Agent-loop multimodal compaction preserves text and substitutes an image marker without exposing image payloads; its focused test passed. The default runtime estimator now uses the serialized wire message and has a passing focused text/multimodal test. The TypeScript-compatible array heuristic counts parts rather than image cost, so it is not a conservative multimodal budget. Only a test runtime implements `AgentRuntime`; live runtime integration remains incomplete. These checks do not change component verification classifications. The default runtime also delegates model-facing tool-result projection and bounding to the canonical serializer; `tools::agent_loop::tests::agent_runtime_defaults_estimate_wire_content` passed its focused projection and size assertions. The loop now uses that serializer for both successful and failed returned results; `tools::agent_loop::tests::failed_tool_result_preserves_projected_data_in_history` passed its focused execution-path check. Executor errors also use the serializer and evidence hook; `tools::agent_loop::tests::thrown_tool_error_uses_model_projection_and_evidence` passed its focused check. The focused `tools::agent_loop::tests::cancellation_during_tool_error_stops_retries_and_projects_result` test also passed. The retry delay starts at 500 ms and checks cancellation during the wait; `tools::agent_loop::tests::tool_retry_wait_stops_when_aborted` passed its focused regression, including the TypeScript-shaped `tool_retry` event before the wait and cancellation result. These checks do not establish full loop parity.

Desktop-host launch configuration now has an internally declared native parser and two passing standalone focused checks; evidence is in `.jait/artifacts/gateway-rust/desktop-host-config/evidence.json`. Lock and secrets candidates remain unregistered, and the host entrypoint, cross-runtime locking and platform integration remain incomplete. The component remains partial.

The recorded classifications below remain unchanged while implementation is in progress. WebSocket and Windows driver repairs passed 18 tests in the isolated `.jait/artifacts/ws-windows-focused` harness. WebSocket authorization, routing, shutdown and client parity remain incomplete; the Windows driver still needs cancellation and platform evidence. Packaging repairs passed four focused tests in `.jait/artifacts/packaging-focused-harness`, covering copy boundaries, a hung probe and smoke scope expiry. Probe descendant cleanup and smoke adapter authorization and cancellation remain open. These results do not establish component verification or runtime integration. Browser process ownership and effect authority, update wiring and agent-loop serialization are still under active implementation. No final frozen-source gate has been run.

## Interrupted-wave integration recovery — 2026-11-03

Recorded ledger at the time of that wave: **327/370 originals verified, 10 implemented but unverified, 22 partial, 11 absent** (superseded by the coverage credit audit at the top of this file, whose three batches record 312 verified / 10 implemented / 37 partial / 11 absent for the originals). The 13 additions remain **5 verified, 8 absent** (383 current entries). These historical verified labels remain subject to source/reference drift review. **No verification credit was added.**

Recovered focused contracts have 58 passing checks across eight targets. Native schema metadata now includes all 52 live Drizzle tables and matches column/default/flag/index metadata after correcting primary-key implicit nullability. Team-chat repairs cover persisted user ownership, null validation, UTF-16 limits and deterministic routed retry behavior. API wire DTOs are declared; consumers still require integration. Native crypto first-use evidence reuses canonical implementations without a shim.

Team-chat service/routes and Matrix runtime are partial; no dispatch/recovery or live Matrix encryption parity is claimed. Local provider-account creation remains unverified on the 0775 checkout ancestors; production guards were preserved. Team goals/context and independent verification now pass live TypeScript comparisons (17 team checks). Telegram is integrated with seven passing focused tests but remains partial for explicit compatibility and lifecycle gaps. Team dispatch and project-search follow-ups continue under separate ownership; later worker edits require new focused evidence.

Evidence and exact scoped hashes: `.jait/artifacts/gateway-rust/recovery-integration/checkpoint.json`, `schema-repair.json`, `.jait/artifacts/gateway-rust/verify-w1/recovery-review.json` and `.jait/artifacts/gateway-rust/team-chat-w2/recovery-evidence.json`. No full native gate, broad differential suite, mutation campaign, coverage recapture or final source freeze was run for this wave. Runtime integration, replacement/platform/load/recovery/rollback/activation remain separate; production remains TypeScript.

## Recovery and reference drift audit — 2026-11-03

A recovery audit found **383 unique ledger entries matching all 383 current
inventory paths**, with no missing original paths. The ledger currently labels
**327/370 originals verified, 9 implemented but unverified, 17 partial and 17
absent**; the thirteen additions are **5 verified and 8 absent**. (Both status
lines in this section are superseded by the coverage credit audit at the top of
this file, which after its three batches records 312 verified / 10 implemented /
37 partial / 11 absent for the originals, i.e. 317/383 overall.)

These are recorded classifications, not a passing final-source gate. Nine
TypeScript reference hashes have drifted since their ledger entries: eight
classified verified and one implemented. Current compatibility for those paths
requires review; changing their fingerprints alone would not resolve drift.
The audit records exact paths and input SHA-256 digests in
`.jait/artifacts/gateway-rust/recovery-ledger-audit-20261103.json`.
It does not assess native source drift or award verification credit.

Implementation remains open. No final candidate has been frozen or validated
by this recovery audit. Native runtime composition, replacement/platform gates
and activation remain separate; production remains TypeScript.

## Contract-evidence promotion across six component families — 2026-11-03

Ninety-eight components carried fresh native contract evidence produced by six
independent execution workers (tools, routes, services, root, data, platform)
plus three coordinated follow-ups. Every claimed test id was re-checked against
the authoritative full contract run before credit was awarded:
`cargo test` over all 234 contract targets in
`.jait/artifacts/gateway-rust/contract-full-run3.log` reported 6225 passed and 45
failed. Only ids that printed `ok` for an existing target file earned credit;
worker claims naming missing targets or missing ids were rejected outright.

Net movement: **241 → 332 verified, 83 → 9 implemented but unverified, 34 → 17
partial, 25 absent** (383 entries, `inventory_total` 383, sorted, no duplicates,
every inventoried path listed). For the 370 originals that is **236 → 327
verified, 9 implemented, 17 partial, 17 absent**; the thirteen newer additions
remain five verified and eight absent, unchanged. Aggregate totals are not
original-370 completion.

Credit was withheld in seven cases where evidence existed but was insufficient:

- Below the three-check bar — `db/sqlite-shim.ts` (1 check), `db/schema.ts`,
  `scripts/smoke-desktop.mjs`, `scripts/smoke-process.mjs` (2 each). Their
  contract targets and paths are recorded, statuses stay `implemented`/`partial`.
- Known uncovered behaviour — `tools/agent-loop.ts` keeps three
  `serialize_messages` divergences from the TypeScript reference (tool-role
  `name` emitted where TS omits it, differing `reasoning_content` gating, empty
  content as `""` rather than `null`; literals in
  `.jait/artifacts/gateway-rust/agent-loop-serialize-divergence.log`);
  `channels/msteams/connector.ts` has activity projection, conversation id,
  HTML stripping and service-URL admission covered but authorised send, token
  acquisition and listener dispatch are not; `lib/network-scan.ts` has
  `merge_entries` MAC precedence and three adjacent checks but no evidence for
  the ARP, sweep, probe, health or topology stages.

Six further components had worker-reported blockers recorded in `remaining`
without promotion. Three previously authorised parity fixes are part of this
evidence base and are not reverted: `network_scan.rs::merge_entries` MAC
precedence aligned to `packages/gateway/src/lib/network-scan.ts:316`,
`tools/mod.rs` declaring `pub mod agent_loop;` (reachability only), and
`integrations/mod.rs` declaring `pub mod msteams;`/`msteams_auth` (enables the
five Teams checks).

Scope limits: the 45 failing contract targets in the full run are pre-existing
porting gaps in other components — the largest is TypeScript migration 76
(`browser_workflows`) landing ahead of its native mirror — and none are in the
evidence files promoted here; they are recorded as blocked/in-flight rather than
patched. This section awards focused test credit only. It is not frozen-source
validation, not a differential or mutation campaign, and not production
readiness: the gateway still runs TypeScript and the platform, replacement,
activation and release gates remain open.

## Inventory growth reconciliation — 2026-11-02

The inventory this ledger tracks grew after the previous reconciliation: it now
enumerates 383 component paths rather than 376. Seven newer additions had landed
in the repository without ledger entries. All seven are recorded as `absent` with
their current source SHA-256, empty `native`/`contracts`/`targets`, and an
explicit no-credit, no-audit-verdict review note: `providers/session-idle.ts`,
`providers/session-process.ts`, `services/screen-share-control.ts`,
`surfaces/browser-cursor.cjs`, `voice-assistant/router.ts`,
`voice-assistant/tier-catalog.ts`, and `voice/wake-candidate.ts`. They carry no
native Rust behaviour, so nothing is promoted.

The ledger now has 383 entries against `inventory_total` 383, sorted by
reference with no duplicates and no unlisted original path. Totals are 241
verified, 83 implemented but unverified, 34 partial, and 25 absent. The 370
originals are unchanged at 236 verified, 83 implemented, 34 partial, and 17
absent; the 13 newer additions are five verified and eight absent.

This is an inventory-parity correction only. It adds no component evidence,
promotes no status, and does not certify any implemented, partial, or absent
component. The gateway remains TypeScript, and the platform, replacement,
activation, and production-readiness gates remain open.

## Coverage inventory reconciliation continuation — 2026-11-02

The coverage ledger now has exact parity with the inventory it tracks: 376
component entries against `inventory_total` 376, covering all 370 original paths
plus the six newer additions, with no original path unlisted. Statuses are 241
verified, 83 implemented but unverified, 34 partial, and 18 absent. For the
originals alone that is 236 verified, 83 implemented, 34 partial, and 17 absent;
the newer additions remain five verified and one absent. "Implemented but
unverified" and "partial" are kept separate from verified credit and none of the
movement below awards verification.

One entry was missing and has been added: `src/tools/browser-handoff.ts`, an
inventory-pending newer addition with no native Rust behaviour. The only native
touchpoint is tool registration metadata in `src/tools/contracts.rs`; it is
recorded as absent rather than credited.

Six focused-evidence hash notes had drifted from their sources. Each affected
module was re-run on current source — `integrations::os_control::index` (2),
`security::index` (5), `tools::agent_tools` (16), `tools::contracts` (16),
`tools::index` (8), and `tools::mcp_bridge` (18) — all passing, and the notes were
re-pinned to live SHA-256 values with the superseded values retained in the text.
No status was promoted. `src/tools/mcp_bridge.rs` had advanced after the audit was
written by a semantically equivalent Clippy-style simplification
(`unwrap_or_else(Default::default)` to `unwrap_or_default()`, one insertion and
four deletions), which is why its live hash differed; all 18 tests pass on the
current content.

A status-agnostic drift check over every pinned hash in the ledger reports zero
drifted sources, and a semantic comparison against the committed baseline shows
only additive changes — populated `targets`/`review` fields, appended evidence
notes, re-pinned hashes, and the one inserted entry — with no entry, status,
`native`, or contract record removed. This reconciliation establishes ledger
consistency and focused module evidence only. It is not frozen-source validation,
does not certify the remaining implemented, partial, and absent components, and
does not change production readiness: the gateway remains TypeScript and the
platform, replacement, and activation gates remain open.

## Application shutdown continuation — 2026-11-02

The opt-in application closes store admission before draining chat. A focused
regression holds an admitted chat turn open, triggers shutdown, then aborts the
application while chat cleanup is pending; it confirms the turn is cancelled,
chat remains closed, and a later drain completes once the turn releases its
lease. The chat cleanup deadline is eight seconds; the server's separate
five-second HTTP drain begins afterward. This does not establish request-bound
host authority, full runtime integration, or component verification.

A read-only ledger audit found 236 historically verified and 87 implemented but
unverified original components, with 47 originals absent; five newer paths have
historical verified entries and one is absent. Seven verified and nine implemented
reference hashes differ from the live sources. These historical statuses require
reconciliation and are not final validation of the current snapshot. The production
gateway remains TypeScript; platform, replacement, and activation gates remain open.

## Store authority cancellation continuation — 2026-11-01

The standalone ClawHub store port now stops waiting for request authority when
its cancellation token fires. The focused `cancelling_port_interrupts_pending_authority`
regression passed. This covers cancellation while authority is pending; it does
not establish request-bound authority or production runtime integration, and
adds no component verification credit.

## Store server lifecycle continuation — 2026-11-01

An opt-in server method retains a store supervisor through serving, closes
admission on shutdown or cancellation, and awaits its drain. A focused test
passed for cancellation of the server future and the specific closed-admission
error, followed by an explicit shutdown call. Retry of a cancelled drain is
covered separately at the supervisor level; this server test does not exercise
an in-flight blocking operation. The host must retain the supervisor to retry a
cancelled drain. Request-bound authority and production runtime composition remain
unwired; this adds no component verification credit.

## ClawHub store composition continuation — 2026-11-01

An opt-in store port now connects the shared registry and bounded blocking lane to
the existing prepare/commit adapter. The host must provide request- and
operation-bound authority; the request cancellation token is passed through both
stages. A focused local test passed for allowed reads, denied identity, pre-cancel,
and closed-lane admission. It does not establish live network, installation,
revocation, or concurrent mutation behavior. No production runtime mounts this
port yet, and no component verification credit is claimed.

## Preview admission continuation — 2026-11-01

The local preview runner now prioritizes cancellation while waiting for launch
authority and rechecks it when approval returns. A focused regression passed for
cancellation during the same poll as an approved grant. Cancellation after that
check still uses the existing supervised process cleanup path; the test does not
establish atomic cancellation against spawning. The preview service and runtime
integration remain incomplete, and this change adds no component verification.

## Packaging adapter continuation — 2026-11-01

The optional `scripts/copy-shell-integration.sh` invokes the native asset copier
from a source checkout, with an explicit gateway root override. It requires Cargo
and a trusted tree that remains stable during copying; the copier does not make
its filesystem checks atomic. The production build remains on the Node script.
A focused fixture comparison against the Node script passed for the checkout
assets; no additional component verification is claimed. The current ledger retains 236/370 historically verified
originals and 87 implemented but unverified, with 47 originals unlisted; seven
verified and nine implemented references have drifted from their recorded hashes.
Five of six newer additions have historical verified entries. These counts do not
establish current-source validation or production readiness.

## Integration continuation — 2026-10-30

The most recent ledger audit records 236 historically verified originals, 87
implemented but unverified, and 47 without entries, plus five historically verified
and one absent newer path. These are not validation of the current source: reference
drift and final evidence remain to be reconciled. Git batch reads are wired through
the existing scoped command authority; focused parser and scoped-worker tests passed.
The 512 KiB output cap leaves large-file compatibility and HTTP route evidence open,
so this work does not earn component credit.
The batch parser also rejects mismatched missing records and malformed object
headers before falling back to individually authorized reads. Four parser tests
and the scoped real-Git batch/fallback test passed on 2026-10-30; this focused
evidence does not resolve the large-file or route compatibility gaps.
Authorized worktree files above 10 MiB now return the reference-sized
placeholder from handle metadata without reading the body; focused oversized-file,
parser and path-boundary tests passed. The authenticated real-Git HTTP fixture
also passed with an oversized untracked file; it uses individually authorized
fallback reads because its command grant denies batch. Revision content trims one
terminal newline, while worktree content preserves it, matching the reference
reader. Reads between 512 KiB and 10 MiB and large revision blobs remain limited
by the existing capture budgets; no large-file differential suite has passed.
Truncated process captures are charged before the individual-limit error; the
focused capture-accounting and scoped batch/fallback tests passed. An over-budget
charge now saturates the aggregate counter and prevents subsequent admissions;
the aggregate-budget regression passed. Focused real-process tests confirm captured
bytes are charged on timeout and cancellation while preserving their error kinds;
a worktree read exceeding 512 KiB is also charged. Partial I/O errors remain
untested. A per-request capture permit now serializes process captures and
worktree reads, including cancellation-aware and deadline-bounded waiting. A
focused concurrent real-process test passed for cancellation while waiting; normal
completion and deadline behavior still need focused evidence. Current handlers already submit
one blocking task per request. Process captures and worktree reads are now capped
by the remaining aggregate allowance under the capture permit; the focused
remaining-budget test passed. Exact-boundary worktree reads fail closed when EOF
has not been established. The TypeScript revision reader emits an
oversized placeholder only when the entire batch fits its 64 MiB capture; if the
batch fails it instead falls back to individual `git show` reads. Metadata alone
therefore cannot select the reference result without accounting for the whole
batch and the existing command authority and resource limits.

The opt-in `scripts/embed-shell-integration.sh` adapter matched the Node generator
in a focused fixture, including current/stale checks; a source-tree check passed
from another working directory.
It is POSIX-only, recompiles on invocation, and is not the gateway production build.
The evaluation handoff transfers capabilities but does not establish exclusive
descendant containment, restart ownership, or authority to clean up. Full frozen
validation, runtime replacement and activation remain open. Production remains
TypeScript.

## Evaluation ownership checkpoint — 2026-10-29

The ledger records **236/370 verified originals**, 87 implemented-but-unverified
originals and 47 absent originals; **5/6 newer paths** are verified (241/376 current).
These are existing ledger states, not newly validated coverage. Evaluation recovery
and descriptor primitives are not wired to a durable parent-child resource handoff;
the child can adopt transferred directory handles, but the parent operation does not yet wire that handoff into its durable ownership lifecycle. Focused recovery and private
directory checks passed, without component credit. Full frozen-source validation,
runtime integration, platform, recovery, rollback and activation remain open;
production remains TypeScript. Evidence and limits: `.jait/artifacts/gateway-rust/chat-loops/evaluation-ownership-20261029.md`.

## Implementation continuation — 2026-10-29

The native Git status flag now includes staged-only changes. The scoped HTTP
fixture stages three files and verifies the flag with an empty working-tree list.
Status now propagates porcelain and required diff failures; the scoped HTTP fixture
checks denied commands and avoids diffs for clean and untracked-only status.
The fixture also checks mixed staged and tracked worktree changes and a failing
worktree diff process. A local diverged upstream fixture checks two ahead and
one behind, and a fixture-authorized failing upstream count process returns HTTP
500. The fixture also confirms the gh availability probe requires a selected
branch. Earlier injected failures were rejected before execution; the corrected
fixture verifies process exits. Full Git service parity remains open.

The native Git status path uses a requested branch only for pull-request lookup;
its checked-out branch and upstream remain independent. The authenticated route
fixture passed for an unborn HEAD with a requested branch.

The native Git status path now preserves whitespace in numstat filenames,
associates rename statistics with the destination, and enumerates untracked
files individually. Focused parser and authenticated route tests passed;
these do not establish Git service parity or award coverage credit. See
`.jait/artifacts/gateway-rust/chat-loops/git-status-20261029.md`.

The project-search directory reader now counts non-UTF-8 names against the global
entry budget and sorts the already-read names when a directory hits its limit.
The focused `non_utf8_names_consume_global_entry_budget` and
`limited_directory_batch_is_sorted` tests passed individually. Selection at the
limit still depends on filesystem enumeration; these tests do not establish
search parity or award component verification. See
`.jait/artifacts/gateway-rust/chat-loops/project-search-budget-20261029.md`.

Focused project-search ignore-rule regressions passed for unmatched brackets and
backslashes, empty and negated empty character classes, and rule-budget handling.
These checks cover the fallback compiler only; the Rust walker and per-file
ripgrep integration still have the gaps in
`src/services/project_search/COMPATIBILITY.md`. They do not verify the original
component or establish runtime replacement readiness. The current search backend
uses bounded per-file subprocesses, not ripgrep traversal. Worker provider failures
reported exhausted credits; parallel implementation is therefore not currently
progressing through those workers. No broad gate or final source freeze has run.

## Integration checkpoint — 2026-10-29

The previously blocked `services::project_search` library test run now compiles
against the owner-aware chat event bus and passes 12 focused tests. This is
implementation evidence only; project-search parity and component verification
remain open. A live ledger audit still reports 236 verified and 87 implemented
originals, with 47 original paths absent; five of six later additions have verified
entries. A subsequent reference audit found seven verified and nine implemented reference
hashes differ from live source; see
`.jait/artifacts/gateway-rust/chat-loops/reference-drift-20261029.json`. These counts are historical ledger statuses, not a
source-bound validation or a production-readiness measure. Restart lifecycle
authority and gateway entrypoint integration remain under active review; broad
validation remains deferred until implementation is integrated. Evidence is recorded in
`.jait/artifacts/gateway-rust/chat-loops/integration-20261029.md`.

## Historical ledger audit — 2026-10-28

The original manifest contains 370 paths; the current inventory records 376,
including six later additions. The live ledger records **236 originals as verified**,
**87 originals as implemented but unverified**, and **47 originals without a
ledger entry** (323/370 originals have a ledger entry; that historical figure counts
entry presence, not verification, and is not the 323 verified originals recorded by
the 2026-11-03 coverage credit audit at the top of this file). Five additions are recorded as verified
and one has no entry. An absent entry does not mean no native code exists. These are
ledger statuses, not a fresh source-bound validation. Seven historically verified
reference hashes no longer match live source: `providers/model-fetchers.ts`,
`routes/screen-share.ts`, `services/computer-control.ts`, `tools/core/todo.ts`,
`tools/prompts/shared-sections.ts`, `tools/repo-proposal-tools.ts`, and
`tools/surface-tools.ts`. Six implemented-but-unverified references also differ:
`routes/voice.ts`, `services/messenger-service.ts`, `tools/browser-tools.ts`,
`tools/computer-tools.ts`, `tools/screen-share-tools.ts`, and `tools/index.ts`.
These differences must be reconciled against the final snapshot; historical
verification is not a fresh validation of the changed sources.

Focused-only evidence never earns `verified`: the new `tools/agent-tools.ts`
(16/16 `tools::agent_tools` tests) and `tools/index.ts` (8/8 `tools::index` tests,
partial port — the `createToolRegistry` barrel is not ported) rows are recorded as
implemented and unverified. Their logs are
`.jait/artifacts/gateway-rust/tools-port/agent-tools.log` and
`.jait/artifacts/gateway-rust/tools-port/tools-index.log`. Remaining originals are
dominated by runtime entry points (`index.ts`, `server.ts`, `ws.ts`), `bin/*.mjs`,
`scripts/*`, `channels/*`, `routes/*`, `surfaces/*` and long-running services.

The isolated gateway focused suite passed 17 tests after cancellation fixes. The
child candidate passed ten mock-host tests covering startup and listener lifetime;
its concrete host, CLI, bounded cleanup and settings parity remain open. A Linux
SQLite authority candidate passed 15 focused child tests, including directory
replacement and WAL writes; it assumes a trusted parent and same-UID processes
and still needs host and lifecycle integration. The shell generator passed focused
tests and common Node diagnostic comparisons. The unregistered Teams candidate
has mock-verifier listener checks and loopback TLS transport checks, including
certificate trust and hostname rejection. Its in-process TLS fixture holds the
listener throughout and uses a fixed test clock; five trust, hostname and validity
scenarios passed in an isolated harness. Consent, credential wiring and Microsoft
interoperability remain unverified. The ClawHub entry point re-exports an existing
canonical client and is not a separate implementation or runtime integration.
The canonical candidate has focused fixes for null search results, empty options,
download errors and cancellation around authorization; 11 Rust tests and eight
stubbed TypeScript assertions passed. Response-shape compatibility and transport
security evidence remain open; see `.jait/artifacts/clawhub-canonical-review/review.md`.
The MCP bridge has 18 passing focused tests after explicit-null, server-name and
opt-in registry lifecycle changes; its transport and runtime integration remain open.
A registered smoke-process candidate passes four Unix focused tests; Node differential,
Windows and desktop caller integration remain open. Neither has verification
credit. Evidence is in `.jait/artifacts/gateway-rust/chat-loops/` as
`mcp-registry-focused-20261028.log` and `smoke-process-signal-focused-20261028.log`.
A transaction adapter uses the existing bounded SQLite worker and passes 21 focused
tests (`sqlite-worker-focused-20261028.log`); Drizzle and runtime integration remain open.
Production build wiring and channel runtime integration remain open. These partial
candidates have no coverage
credit. See
`.jait/artifacts/gateway-rust/chat-loops/continuation-20261027-resumed.md`
for evidence and limitations. Native component coverage, runtime integration and
production readiness are separate. The full frozen-source gate, platform and
replacement checks remain open; production remains TypeScript.

## Native transport and retention integration — 2026-10-27

The registered library passes **62 focused checks** across native email
transport/TLS/MIME (29), retention interruption (14), actual local Git conflict
handling (2), account storage (15) and provider quota storage (2). Account fixtures
now use a project-local descriptor boundary and the canonical traversal; absolute
production opens retain ancestor checks, and tests no longer change process umask.
Retention interruption stays within the active sequential SQLite job and restores
connection policy before rollback. Locked SQLite hooks and direct TLS dependencies
are enabled. The real Git fixture maps two exact HTTPS URLs to disposable local
bare repositories; it establishes merge/index/push semantics, not live HTTPS or
runtime authority. Email worker coordination failed with context compaction
cancellation; its on-disk code was integrated without retrying the provider.

At that checkpoint the tracker had **16 implemented-but-unverified originals** and
**118 other incomplete originals**. Historical verified coverage stays **236/370 originals**
plus **5/6 newer additions (241/376 current)**. No new coverage ledger credit,
broad gate, recapture or final source freeze. Forge HTTP, doctor and a read-only
foundation audit continue in separate workers. Native runtime composition,
compatibility, platforms, load, recovery, rollback and activation remain open;
production remains TypeScript.

Evidence: `.jait/artifacts/gateway-rust/parallel-implementation/continuation-focused-results.json`
and `continuation-integration-review.json`. Scoped Rust/Cargo.toml hashes stayed
unchanged during the run; Cargo.lock settled direct locked dependency metadata.
This focused run is not the required full frozen-source acceptance gate. Older
checkpoints below are historical.

## Search/watch integration checkpoint — 2026-10-27

Native search/watch modules are registered. **17 focused service tests** and
**4 authenticated HTTP route tests** pass. The route now uses bounded search on a
shared filesystem lane, returns relative file/content results and rejects foreign
projects, inherited remote roots and unresolved surface IDs. Watcher event-bus,
surface/remote adapters and actual TypeScript/client contract evidence remain open.

The implementation tracker records **15 implemented-but-unverified originals**
and **119 other incomplete originals**. Historical verified coverage stays
**236/370 originals + 5/6 newer additions (241/376 current)**. Provider, Git forge/PR
and plugin manager/OpenClaw workers continue under separate ownership. Provider
account filesystem race repair remains active; those files are not credited.
No broad gate, ledger recapture or final source freeze has run. Production remains
TypeScript; replacement/platform/load/recovery/rollback/activation gates are open.
Evidence: `.jait/artifacts/gateway-rust/parallel-implementation/project-search-integration-review.json`,
`project-search-integrated-focused.log`, `project-search-route-focused.log` and
`continuation-20261027.md` in the same directory. Older checkpoints are historical.


## Resumed implementation checkpoint — 2026-10-27

Historical coverage remains **236/370 originals** plus **5/6 newer additions**.
Three messenger cancellation/start/stop regression checks pass. Preview runner,
preview process and WhatsApp now compile in the library. After a default-budget
timeout, bounded focused runs passed 8 preview-filter tests and 6 WhatsApp tests.
Temporary 6G/8G scopes exited without changing terminal defaults. Home Assistant's
handoff reports 12 passing focused REST checks; runtime dispatch and client
compatibility remain open. Workers continue project search/watch, provider
orchestration and Git forge/PR services. Full validation remains deferred until
implementation is integrated. Evidence and limits:
`.jait/artifacts/gateway-rust/parallel-implementation/continuation-20261027.md`.
Production remains TypeScript; no activation or release occurred.


## Implementation-first parallel continuation — 2026-10-26

The saved goal now follows parallel implementation → integration → final validation
→ focused failure repair → verified completion. Workers own separate email,
maintenance/retention, and skills/ClawHub modules; the coordinator owns shared
registrations, dependencies and SandboxManager integration. Compilation and focused
checks resolve concrete implementation uncertainty. Full native gates, broad
differential suites, mutation campaigns, coverage recapture and repository checks
are deferred until the remaining implementation is integrated. No broad suite is
rerun merely to refresh a checkpoint.

Historical verified baseline at this 2026-10-26 checkpoint: **236/370 originals
(63.78%, 134 remaining)** plus **5/6 newer additions**, or **241/376 then-current
(64.10%)**. A read-only reference fingerprint audit at that time found zero
drift in those 241 recorded reference sources; the live audit above supersedes it.
This was not a new native validation pass. Implemented-but-unverified work receives no
coverage credit. Per-component state, worker ownership and the initial native
source hashes are recorded separately in
`.jait/artifacts/gateway-rust/parallel-implementation/status.json`.

At this historical checkpoint, **12 original components** were recorded
separately from verified coverage: skills/ClawHub (3), mobile push (1), email (6),
and disk janitor/maintenance (2). Another **122 originals remain incomplete**,
including partial implementations. Strict SQLite scan deadlines in retention,
concrete IMAP/SMTP/MIME adapters, registry XML compatibility and SandboxManager's
host/Windows lifecycle remain implementation gaps. Browser/Linux desktop share
startup ownership/readiness/cleanup; writable mounts require nonzero host UID/GID
and isolated HOME. Six targeted lifecycle checks, three mobile push regression
checks and 12 integrated email checks pass. Worker-only focused evidence and host/
platform limitations are in the individual handoffs. Provider orchestration and
project search/watch are assigned independently. No full gate or ledger recapture
has run during this implementation phase. These focused results do not certify
the current candidate or increase verified coverage.

After all implementation is integrated, freeze the candidate, run required final
validation without editing candidate source, repair failures with focused reruns,
then obtain a passing final gate on the final frozen source. Native component
coverage, runtime integration and production readiness remain separate. Platform,
load/soak/recovery/rollback and activation gates remain open. Production remains
TypeScript. No production activation, release or publication is authorized.

## Sandbox manager supervised browser startup — 2026-10-26 (uncredited)

The canonical native manager now composes admission/image preparation, captured
host inputs, an authorized launch name, one scoped bind-conflict retry and bounded
noVNC/CDP readiness under its supervisor. An owned lease retains cleanup across
failed starts, late completion, caller cancellation and ownership transfer.
Conflict discovery requires explicit candidate removal authority. Writable browser
startup is blocked pending reviewed host UID/GID and writable HOME integration.

Restored validation passes **372 native library tests** (including **12 startup
checks**), **8 actual-TypeScript startup scenarios**, **192 launch comparisons**,
**13 image comparisons**, **66 admission/config comparisons plus 3 overflow checks**
and **24 command/session comparisons**, plus **5 assertion-killed startup
mutations**, formatting, strict library Clippy and artifact checks. The evidence
binds all native sources and reviewed reference/test inputs before and after
validation. Report:
`.jait/artifacts/gateway-rust/sandbox-manager-20261026/browser-start-slice-review.json`;
review: `tests/contract/reviews/native-sandbox-manager-browser-start.md`.

Counts remain **236/370 originals (134 remaining)** plus **5/6 newer additions**,
or **241/376 current components**. SandboxManager earns no component credit.
The historical full241 frozen gate is not refreshed by this partial check.
TCP probes have a native per-attempt deadline; the reference has no socket
deadline. Explicit removal authority, owned cancellation/failure cleanup and
writable-mode rejection are reviewed compatibility decisions requiring direct
caller/platform evidence before replacement.

Concrete scoped engine/build/port allocation/clock/readiness/WSL host adapters,
atomic admission and name ownership, Linux/Windows lifecycle, existing-container
and background routing, storage containment, identity/worktree/direct callers,
real engine/platform and replacement/activation gates remain open. Production
remains TypeScript; no activation, publication, release or agents occurred.

## Sandbox manager browser launch command progress — 2026-10-26 (uncredited)

The canonical native manager constructs browser launch commands from explicit
host-captured ports, gateway and clock samples, reusing authorized project-path
checks. This is command construction only; native browser startup ownership,
port allocation, bind-conflict retry and bounded readiness remain pending.
Restored validation passes **360 library tests**, **192 actual-TypeScript launch
command comparisons**, **13 image comparisons**, **66 admission/config comparisons
plus 3 overflow checks**, **24 command/session comparisons**, four assertion-killed
launch mutations, formatting, strict library Clippy and artifact checks.
Evidence: `.jait/artifacts/gateway-rust/sandbox-manager-20261026/browser-launch-slice-review.json`;
review: `tests/contract/reviews/native-sandbox-manager-browser-launch.md`.
The launch comparisons stop at the engine runner with prerequisites mocked;
they do not prove native image-before-start composition or real engine behavior.

Counts audited unchanged: **236/370 originals (134 remaining)** plus **5/6 newer
additions**, or **241/376 current components**. SandboxManager stays uncredited.
The historical full241 frozen gate is not refreshed by these partial checks.
Concrete scoped host adapters, build/process cancellation, writable-mount host
UID/HOME policy, lifecycle/storage/discovery, engine/platform, direct-caller and
replacement/activation evidence remain open. Production remains TypeScript;
no activation, release, publication or additional agents occurred.

## Sandbox manager browser image progress — 2026-10-26 (uncredited)

The canonical native sandbox manager now composes browser admission and image
inspection with a fixed stdin recipe and separately supplied host build authority.
No ambient build fallback or concrete engine adapter is introduced. Restored
validation passes **358 library tests**, **13 actual-TypeScript image comparisons**,
**66 admission/config comparisons plus 3 overflow checks**, **24 command/session
comparisons**, four assertion-killed native image mutations and one assertion-killed
recipe comparison mutation, formatting, strict library Clippy and artifact checks.
Evidence: `.jait/artifacts/gateway-rust/sandbox-manager-20261026/browser-image-slice-review.json`;
review: `tests/contract/reviews/native-sandbox-manager-browser-image.md`.

Coverage remains **236/370 originals (134 remaining)** plus **5/6 additions**, or
**241/376 current components**. No SandboxManager credit is awarded. The full241
frozen gate below is historical and was not refreshed for this partial slice.
Browser/VM launch, bounded readiness/retry/storage, authorized build-host and
identity/worktree integration, direct callers, real engine/platform, cancellation
and replacement gates remain open. Admission is not consent or an atomic
reservation. The explicit build port has no production adapter; host-context and
resource enforcement still require integration evidence. Production remains
TypeScript; no activation, release or publication occurred.

## Live-view lifecycle checkpoint — 2026-10-26

The full241 frozen gate passes **352 native library tests and 1,958 contract
checks across 171 targets**, formatting and strict Clippy. All **3,752 frozen
source fingerprints** match live at credit review. Coverage is **236/370 originals
(63.78%, 134 remaining)** plus **5/6 newer additions**, or **241/376 current
components (64.10%)**. The original-370 goal remains incomplete.
Evidence: `.jait/artifacts/gateway-rust/runs/live-view-20261026/checkpoints/241-report.json`
and `.jait/artifacts/gateway-rust/agent-messenger-history/live-view-gate-credit-review.json`.

The native live-view lifecycle manager passes **19 focused checks** (15 domain
checks and four shared transport guards), including actual TypeScript admission
and lifecycle comparisons and a real project-owned process/socket fixture.
Three FIFO, cleanup and loopback-bind mutations fail their intended assertions;
restored tests, strict Clippy, formatting and artifact checks pass. Review:
`tests/contract/reviews/native-live-view-manager.md`. Focused evidence is under
`.jait/artifacts/gateway-rust/agent-messenger-history/`.

The native manager remains opt-in with typed process/socket/clock/sandbox ports.
Bounded overload and owned cancellation/cleanup are reviewed compatibility
decisions. Canonical SandboxManager and Docker/browser/media integration remain
unported; platform, client integration, load/soak/recovery/rollback and activation
gates remain open. Production remains TypeScript. This checkpoint text was
updated after validation; subsequent implementation changes require refreshed
focused and frozen validation. Earlier checkpoints are historical.

## Screen-share lifecycle checkpoint — 2026-10-26

The full240 frozen gate passes **352 native library tests and 1,939 contract
checks across 170 targets**, formatting and strict Clippy. All **3,746 frozen
source fingerprints** match live at credit review. Coverage is **235/370 originals
(63.51%, 135 remaining)** plus **5/6 newer additions**, or **240/376 current
components (63.83%)**. The original-370 goal remains incomplete.
Evidence: `.jait/artifacts/gateway-rust/runs/screen-share-20261026/checkpoints/240-report.json`
and `.jait/artifacts/gateway-rust/agent-messenger-history/screen-share-gate-credit-review.json`.
The terminal wrapper reported a timeout after the gate had written its passing
canonical report; a fresh independent comparison confirmed all source hashes.

All eight native authenticated screen-share lifecycle routes and device/session
state pass 14 focused comparisons against actual TypeScript routes and service.
Three deliberate security/ordering mutations fail their assertions. Review:
`tests/contract/reviews/native-screen-share-http.md`. Focused evidence and mutation
results are under `.jait/artifacts/gateway-rust/agent-messenger-history/`.
Capture/recording and WebSocket delivery remain explicit host ports; no native
media backend or WebRTC capability is claimed. Host lifecycle, platform,
load/soak/recovery/rollback and activation gates remain open. Production remains
TypeScript. This text was updated after validation; subsequent migration changes
require refreshed focused and frozen validation. Earlier checkpoints are historical.

## Configured monitor and messenger history checkpoint — 2026-10-26

The combined frozen gate passes **352 native library tests and 1,925 contract
checks across 169 targets**, formatting and strict Clippy. All **3,741 frozen
source fingerprints** match the live checkout at credit review. Coverage is
**234/370 originals (63.24%, 136 remaining)** plus **5/6 newer additions**, or
**239/376 current components (63.56%)**. The original-370 goal remains incomplete.
Evidence: `.jait/artifacts/gateway-rust/runs/messenger-history-gate2/checkpoints/239-report.json`
and `.jait/artifacts/gateway-rust/agent-messenger-history/combined-gate-credit-review.json`.

This checkpoint includes 26 focused chat-loop checks, 25 System One checks and
8 messenger-history checks. Configured monitor model I/O releases the SQL worker
and revalidates authenticated owner/revision before commit. Reviews are in
`tests/contract/reviews/native-chat-loops.md` and `native-messenger-history.md`.
The gate pins Bun 1.4.0 / ICU 78.3 for the timezone corpus. Assessment HTTP error
serialization preserves its typed SQLite missing-table code; all 10 route checks
pass. Earlier runtime failures remain archived under `agent-messenger-history/`.
The six post-snapshot additions remain enumerated separately in the ledger.

This report binds the tested snapshot; this checkpoint text and evidence links
were updated after validation. Subsequent migration changes require new focused
and frozen validation. Host lifecycle, real Megolm interoperability, full client,
platform/load/soak/recovery/rollback and production activation gates remain open.
Production remains TypeScript. Earlier checkpoints are historical.

## Integrated GitHub service checkpoint — 2026-10-26 (236 focused components)

The canonical native GitHub App service earns one original component after
reviewing all 18 public methods and two exports and passing **142 integrated
focused checks**. The combined frozen snapshot passes the existing full235 gate
(**352 library tests, 1,773 contract checks across 164 targets**) plus all five
complete-service targets. All **3,739** source fingerprints match live at credit.
Review: `tests/contract/reviews/native-agent-github-service.md`. Evidence:
`.jait/artifacts/gateway-rust/agent-github-expiry-parser/combined-validation-result.json`
and `credit-review.json` in that directory.

Coverage is **231/370 originals (62.43%, 139 pending)** plus **5/6 newer
additions**, or **236/376 current (62.77%)**. A refreshed full236 gate binding the
updated ledger and review is pending under
`.jait/artifacts/gateway-rust/runs/credited-github-20261026/`.
The earlier full235 evidence remains bound to its historical snapshot.
Historical GitHub gap notes are superseded by the consolidated service review;
external sink supervision, distributed ownership, host transport/lifecycle,
platform/load/soak/recovery/rollback and activation limits remain explicit.
Production remains TypeScript. No production activation or release is authorized.


## Resumed migration checkpoint — 2026-10-26 (235 focused components)

The reviewed OpenCode Go adapter is integrated and earns one original component:
**230/370 originals (62.16%, 140 pending)** plus **5/6 newer additions**, or
**235/376 current components (62.50%)** with reviewed focused contracts.
Its 16 focused checks compare 146 actual-TypeScript scenarios and cover bounded
body reads, cancellation, deadlines and protocol translation. The isolated
frozen/restored candidate passes 352 library tests, strict Clippy, formatting and
eight compiler-fresh fault controls. Integrated focused checks and strict native
Clippy pass; all candidate runtime fingerprints match the live checkout.
Evidence: `.jait/artifacts/gateway-rust/continuation-opencode-go/integration-review.json`.

The combined frozen-source gate passed: **352 library tests and 1,773 contract
checks across 164 targets**. All 3,738 frozen source fingerprints match live at
review. Report: `.jait/artifacts/gateway-rust/runs/resumed-opencode-20261026/checkpoints/235-report.json`.
The previous 234-component full gate remains historical evidence only.
The GitHub expiry candidate remains isolated and uncredited. Full original-370,
platform/load/soak/recovery/rollback and activation gates remain open.
Production remains TypeScript.


## Parallel continuation checkpoint — 2026-10-26 (234 components)

The full frozen-source native gate passes **234/376 current components (62.23%)**:
**229/370 originals (61.89%, 141 pending)** plus **5/6 newer additions**.
The command-output-filter implementation earned one original component after
148 comparisons with the actual TypeScript functions across seven groups,
four shared driver checks, frozen/restored checks and four compiler-fresh fault
controls. It preserves failure context, conservative fallback, UTF-16 slices and
stable grouping; it does not activate a terminal host.

The combined snapshot passes formatting, strict Clippy, **352 native library
tests** and **163 contract targets (1757 passing contract checks)**.
All recorded live runtime/reference/contract hashes and workspace output hashes
match the tested snapshot. Evidence:
`.jait/artifacts/gateway-rust/runs/parallel-20261026/native-progress/report.json` and `.jait/artifacts/gateway-rust/parallel-continuation-20261026/checkpoint-result.json`.

The separate bounded GitHub token-cache slice passes 140 focused checks in each
frozen/restored run, 352 library tests, seven cache tests and three fault controls.
It earns no component credit. It caps dynamic cached payload at 4 MiB and owners
at 256; insertion pruning uses the operation clock sample, while reads resample
freshness under the cache lock. Cache budgets are not process-RSS measurements.
Evidence: `.jait/artifacts/gateway-rust/parallel-github-service/final-evidence-audit.json`.

Next: validate the isolated OpenCode Go adapter and reuse the existing native
JavaScript-date parser for the remaining GitHub expiry compatibility gap.
The original service's focused acceptance is distinct from optional webhook sink
supervision/idempotency, arbitrary direct-DB ABA/distributed ownership, external
browser journeys and production host activation. Those remain explicit host or
replacement limits. Full original-370 completion, platform, load/soak,
recovery/rollback and activation gates remain open. Production remains TypeScript.
Concurrent changes are preserved; earlier checkpoints below are historical.

## Parallel focused progress — 2026-10-26 (234 components)

The ledger now records **229/370 originals (61.89%, 141 pending)** plus **5/6
newer additions**, or **234/376 current components**. Native command-output
filters earned one original component after 148 actual-TypeScript differential
scenarios, seven focused groups, four shared driver checks, frozen/restored
validation and four compiler-fresh fault controls. Strict Clippy, formatting and
artifact checks pass. Evidence:
`.jait/artifacts/gateway-rust/command-output-filters/final-evidence-audit.json`.

The bounded GitHub cache slice passes 140 focused checks in each frozen/restored
run, 352 library tests, seven cache tests and three fault controls, without new
component credit. Read-time freshness is sampled under the cache lock; insertion
cleanup uses the operation clock sample. Its 4 MiB payload/256-owner budgets are
not whole-process RSS limits. Evidence:
`.jait/artifacts/gateway-rust/parallel-github-service/final-evidence-audit.json`.

A full frozen-source **234-component gate is running**, after formatting, strict
Clippy and 352 library tests passed. Its result is not yet claimed. The historical
full233 checkpoint is stale. OpenCode Go and GitHub expiry-parser candidates are
isolated under `.jait/artifacts/gateway-rust/` and uncredited. The actual service
expiry-date compatibility gap remains separate from optional webhook sink
supervision, arbitrary direct-DB ABA/distributed ownership, external browser
journeys and production host activation. All original-370 completion,
platform/load/soak/recovery/rollback/activation gates remain open. Production
remains TypeScript. Earlier entries below are historical checkpoints.

## Uncredited GitHub browser installation handoff — 2026-10-26

The typed browser API now consumes the native authenticated state-bearing
installation URL. An exposed native capability header selects issuance; a
connection GET/reload does not issue state. Install performs a fresh authenticated
POST and validates the GitHub destination and exact state before navigating the
current tab. Errors stay visible. The TypeScript gateway retains its existing
link; authenticated manual installation and callback restrictions remain.
Neither browser storage nor callback replay blobs gain state-bearing URLs.
Review: `tests/contract/reviews/native-agent-github-browser-handoff.md`.

Frozen/restored **171 focused checks**, **345 library tests**, **eight
Chromium fixture cases** per run, web/migration typechecks, strict Clippy,
format/artifact checks, **six behavioral controls** and ten repetitions of the
frozen expiry mailbox test pass. The later test-only mailbox assertion correction
has 28 focused live library checks and ten additional passing repetitions; its
runtime prefix is unchanged. Concurrent GitHub cache work in the live service is
separate and unvalidated by this handoff gate. Browser responses
are scripted and GitHub navigation is locally fulfilled; separate actual native
HTTP contracts verify signed-state callback authority. No external GitHub journey
or production host was activated. Provider registry/environment/job HTTP contracts
were revalidated with the concurrent sources preserved. Totals include repeated
driver self-checks; native-only behavior is not fabricated TypeScript parity.
Evidence: `.jait/artifacts/gateway-rust/agent-github-browser-handoff/partial-result.json`,
its `frozen-source-manifest.json` and `final-evidence-audit.json`.

Coverage remains **228/370 originals (142 pending)**, **5/6 newer additions**,
**233/376 current**; no component credit. Sink lifecycle/idempotency/fencing,
cache App binding/residency, direct credential ABA, cross-process callback
ownership, host deadlines/shutdown, broader expiry parsing and a current full
native gate still block service credit. The historical full233 gate is stale.
Replacement, platform, load/soak, recovery/rollback and activation remain open.
Production remains TypeScript. Earlier entries below are historical checkpoints.

## Uncredited state-bearing GitHub installation issuance — 2026-10-26

The native authenticated installation-url endpoint now issues a fresh challenge
bound atomically to the current App and encrypted-key revision, and constructs
the state-bearing GitHub URL at that authorized boundary. Slug/path admission,
rollback, exact callback replay, credential changes and maintenance-before-HTTP
have actual HTTP evidence. Signed state and URLs stay out of public replay blobs.
Existing authenticated manual installation and callback restrictions remain.
The existing frontend still needs a typed API/browser handoff; no external GitHub
browser journey or production host composition has been activated.
Review: `tests/contract/reviews/native-agent-github-installation-issuance.md`.

Frozen/restored **170 focused checks**, **345 library tests**, strict
Clippy, format/artifact gates and **four behavioral controls** pass. The concurrent
provider-registry URL-error change is preserved and its registry/environment/job
HTTP contracts now pass in both runs. Totals include repeated driver self-checks;
the new endpoint has native-only contracts, not fabricated TypeScript parity.
Evidence: `.jait/artifacts/gateway-rust/agent-github-installation-issuance/partial-result.json`
and its `frozen-source-manifest.json` and `final-evidence-audit.json`.

Coverage remains **228/370 originals (142 pending)**, **5/6 newer additions**,
**233/376 current**; no component credit. Frontend/browser handoff, sink lifecycle/
idempotency/fencing, cache App binding/residency, direct credential ABA, cross-process
callback ownership and broader host deadlines/shutdown still block service credit.
The historical full233 gate is stale. Current full-gate, replacement, supported
platform, load/soak, recovery/rollback and activation limits remain open.
Production remains TypeScript; concurrent work is preserved.

## Uncredited bounded GitHub idle cleanup — 2026-10-26

The canonical native GitHub port now provides an explicit host-owned expiry
runner. It processes at most 256 expired rows per tick through the shared bounded
SQLite worker, clears phase/replay material and preserves credentials, generations
and the last nonce digest. Close/drop cancellation, queued SQL drain, overload
deferral and visible storage failures have focused lifecycle evidence. Construction
alone starts no task; the unmounted candidate and production have not been
activated. Review: `tests/contract/reviews/native-agent-github-expiry.md`.

Frozen/restored **131 focused checks**, **345 library tests**, strict
Clippy, format/artifact gates and **five isolated controls** pass. Evidence:
`.jait/artifacts/gateway-rust/agent-github-expiry/partial-result.json` and its
`frozen-source-manifest.json`. Focused totals include repeated driver self-checks.
Coverage remains **228/370 originals (142 pending)**, **5/6 newer additions**,
**233/376 current**; no component credit. State-bearing installation URL/browser
issuance, sink/cache/ABA/cross-process and broader host/deadline contracts still
block service credit. The historical full233 gate is stale. Current full-gate,
replacement, platform, load/soak, recovery/rollback and activation limits remain
open. Production remains TypeScript; concurrent work is preserved.

The frozen snapshot also includes a concurrent provider-registry URL-error
change. Its frozen/live hashes match; this GitHub slice does not revalidate
provider client comparisons. See
`.jait/artifacts/gateway-rust/agent-github-expiry/concurrent-source-audit.json`.

## Uncredited durable GitHub callback composition — 2026-10-26

The native HTTP callback now uses one compound operation under the canonical
owner lease and persisted challenge authority. Valid setup and authenticated
manual installation retain public responses. Actual HTTP comparisons explicitly
record intentional restrictions: unissued/revoked/expired state denies effects,
exact replay returns public results without another effect, conversion cannot
renew the 15-minute deadline, and ambiguous failures require fresh setup.
Missing/repeated inputs preserve valid challenge authority. Production remains
TypeScript; this candidate is not activated. Review:
`tests/contract/reviews/native-agent-github-compound.md`.

Frozen/restored **131 focused checks**, **338 library tests**, strict
Clippy, format/artifact gates and **six isolated controls** pass. The focused total
includes repeated driver self-checks. Ten compound service checks cover owner
exclusion through both effects, abort/restart uncertainty and stale results from
another port. Real HTTP checks cover replay, exact expiry, clock rollback,
revocation, malformed inputs and authenticated recovery. Source hashes bind the
tested snapshot; current native GitHub runtime equality is audited separately
from docs and the recorded concurrent browser-test-only drift. Whole-repository
equality is not claimed; the live artifact rule check passes.
Evidence: `.jait/artifacts/gateway-rust/agent-github-compound/partial-result.json`.

**No new component credit: 228/370 originals plus 5/6 additions (233/376 current)**.
142 originals and one addition remain. Idle expiry cleanup, state-bearing install
URL/browser integration, webhook sink lifecycle/idempotency/fencing, cache App
binding/residency, direct edits/ABA, cross-process callback lifecycle, host
shutdown/deadlines, broader expiry parsing and a current full native gate remain
open. Historical full233 is stale. Platform/load/soak/recovery/rollback/activation
limits and concurrent work remain preserved. No deployment, publish or release.

## Uncredited durable GitHub challenge store — 2026-10-26

Historical store-only checkpoint; callback integration is recorded above.

Canonical native setup now issues a durable challenge; validated manual saves
and disconnects revoke it in the same immediate SQLite transaction as connection
and encrypted-secret writes. A native-only lazily created table retains owner
generations. It does not change the shared TypeScript schema-version ledger.
The implemented phase API provides a 15-minute absolute TTL, state/App/credential
binding, effect reservations, durable uncertainty before dispatch, atomic local
commit/replay and bounded public replay results. Expiry cleanup is explicit.

**Callback enforcement remains pending.** The HTTP callback and NativeGithubPort
still use the previous sequence; existing actual-client expiry/revocation/replay
gaps remain observable. Idle expiry cleanup is not scheduled. Pure state parsing
is unchanged. Direct credential ABA, host/cross-process callback authority and
external GitHub browser behavior remain unverified. Review:
`tests/contract/reviews/native-agent-github-challenge.md`.

Frozen/restored **117 focused comparisons**, **338 library tests** (including
**20 substantive challenge checks and one child harness**), strict Clippy,
format/artifact gates and **seven isolated controls** pass. Independent SQLite
connections race for one reservation; a child process verifies persisted
uncertainty. Local trigger failures verify atomic credential/replay rollback.
Evidence: `.jait/artifacts/gateway-rust/agent-github-challenge/partial-result.json`.

**No new component credit: 228/370 originals plus 5/6 additions (233/376 current)**.
142 originals and one addition remain. Compound callback integration/cleanup,
sink lifecycle/idempotency/fencing, cache App binding/residency, direct edits/ABA,
host deadlines/shutdown, broader expiry parsing and a current full native gate
remain open; historical full233 is stale. Production remains TypeScript.
Platform/load/soak/recovery/rollback/activation limits and concurrent work remain
preserved. No production activation, deployment, publication, release or agents.

## Uncredited GitHub setup journey contracts — 2026-10-26

Ten new actual-client contracts now carry fresh state issued by authenticated
setup into separate and combined conversion/installation callbacks. Physical
HTTP, real SQLite and encrypted fixture secrets compare valid setup paths,
retry behavior, missing auth and wrong-owner installation. Source mapping also
records that current install URLs omit state; the authenticated installation-ID
form remains the usable fallback. No external GitHub browser journey was tested.

The clients confirm missing TTL/revocation/App binding: older state survives a
newer setup, disconnect and manual replacement, and can convert after one day.
These are baseline gaps, not an approved final policy. The reviewed next contract
uses a persisted challenge with phase reservations, an absolute TTL, App binding,
replay results and explicit recovery for ambiguous remote outcomes. Parsing alone
must not consume authority. This batch changes no native runtime behavior.
Review: `tests/contract/reviews/native-agent-github-setup-journey.md`.

Frozen/restored **117 focused checks**, **317 library tests**, strict
Clippy/format/artifact gates and five native/reference controls pass.
Evidence: `.jait/artifacts/gateway-rust/agent-github-setup-journey/partial-result.json`.
Controls detect nonce reuse, conversion state retention and skipped installation.
Prior webhook admission, callback and SQL handoff/cancellation checks still pass.

**No new component credit: 228/370 originals plus 5/6 additions (233/376 current)**.
142 originals and one addition remain. Persisted challenge and compound callback/
sink fencing are not implemented. Sink lifecycle/idempotency, cache binding/
residency, direct edits/ABA/cross-process, host lifecycle, broader expiry parsing
and a current full native gate remain open. Historical full233 is stale.
Production stays TypeScript; platform/load/soak/recovery/rollback/activation remain
open. No runtime activation, deployment, publication, release or additional agents.

## Uncredited GitHub webhook admission — 2026-10-26

Native webhook admission now rejects non-object JSON and repeated or coalesced
values of the five authority/metadata headers before owner/secret lookup or sink.
Physical HTTP clients compare actual TypeScript routes with the shared native
credential service, real SQLite and encrypted fixture secrets. Valid object
deliveries retain reference behavior. Malformed-input differences are explicit:
TypeScript admits signed scalar/array payloads and joined event/delivery metadata.
Review: `tests/contract/reviews/native-agent-github-webhook-admission.md`.

Frozen/restored validation passes **107 focused checks**, **317
library tests**, strict Clippy/format/artifact gates and five isolated controls.
Evidence: `.jait/artifacts/gateway-rust/agent-github-webhook-admission/partial-result.json`.
Controls catch native object, repeated-header and coalesced-header admission,
plus reference physical-header and object-admission regressions. Prior callback,
signature, owner, rotation and SQL cancellation/admission contracts still pass.

**No new component credit: 228/370 originals plus 5/6 additions (233/376 current)**.
142 originals and one addition remain. State TTL/nonce/App binding and compound
callback/sink fencing, sink lifecycle, cache binding/residency, direct edits/ABA/
cross-process, host deadlines/shutdown, broader expiry parsing and a current full
frozen native gate remain open. Historical full233 is stale. Production remains
TypeScript; platform/load/soak/recovery/rollback/activation gates remain open.

## Uncredited GitHub callback/webhook composition — 2026-10-26

Actual TypeScript routes now compose with the real credential service, SQLite
and encrypted fixture secrets in callback/webhook comparisons. Contracts cover
signed/tampered/replayed state, conversion/attachment, repeated queries, raw-body
signatures, App/installation owner precedence, secret rotation, disconnect and
sink failure. Typed native query rejections are reviewed differences. Both
services currently lack state expiry/nonce consumption; callback operations and
webhook lookup/secret/sink are separate boundaries. These security limits remain
open. Review: `tests/contract/reviews/native-agent-github-callback.md`.

The expanded tests exposed a SQLite admission handoff race: a response could wake
its caller before the job guard was released, making the next sequential call
fail as busy. Job guards now release after work completes and before wakeup.
Queued/started cancellation still retains admission until actual completion.
Frozen/restored validation passes **103 focused checks**, **317
library tests**, strict Clippy/format/artifact gates and five isolated controls.
Evidence: `.jait/artifacts/gateway-rust/agent-github-callback/partial-result.json`.

**No new component credit: 228/370 originals plus 5/6 additions (233/376 current)**.
142 originals and one addition remain. Complete state/sink fencing, changed-App
cache/residency, direct edits/ABA/cross-process behavior, host deadlines/shutdown,
broader expiry forms and a current full frozen native gate remain open.
Historical full233 is stale. Production remains TypeScript; platform, load/soak,
recovery/rollback and activation gates stay open. Concurrent work is preserved.

## Uncredited GitHub runtime payload slice — 2026-10-26

The canonical credential service now validates installation-token response types,
bearer characters and optional metadata before cache admission. Repository tests
preserve omitted counts, reject malformed summaries, and evict cached credentials
on malformed repository success. Actual-TypeScript contracts compare valid
results, persisted effects and optional fields, and observe UTF-16 token prefixes.
Native port clients verify rejection, reminting and shared environment cache reuse.
Deliberate security-preserving differences are documented in
`tests/contract/reviews/native-agent-github-payload.md`.

Frozen and restored validation passes **93 focused checks** and **317
library tests**, strict Clippy, native/contract formatting and artifact checks.
Four independent controls catch credential admission, repository cache eviction,
missing-count omission and reference UTF-16 slicing regressions. Evidence:
`.jait/artifacts/gateway-rust/agent-github-payload/partial-result.json`.

**No new component credit: 228/370 originals plus 5/6 newer additions**; 142
originals and one addition remain pending. Callback/webhook service sequences,
changed-App cache binding, cache bounds, out-of-band edits, ABA/cross-process,
host deadlines/shutdown and broader non-ISO expiry parsing remain open. Current
full native validation is still pending; historical full233 is stale. Production
remains TypeScript. Platform, load/soak, recovery/rollback and activation gates
remain open. Concurrent changes were preserved.

## Uncredited canonical GitHub service port — 2026-10-26

HTTP, tool and environment clients can now share the existing credential service,
cache and bounded database worker through NativeGithubPort. Explicit host
callbacks retain lifecycle, identity and outbound authority. Per-user/agent
operation leases reject conflicts and global overload before effects; independent
owners progress during network waits. SQL jobs retain admission after caller
cancellation until they finish or are popped and skipped.

Actual-TypeScript composition checks exercise manual save, installation, token,
repository test, environment/cache reuse, authenticated owner checks, disconnect,
lifecycle failures and sparse/null/empty/explicit bot metadata. The frozen and
restored candidate passes **89 focused checks**, **317 library tests**,
strict Clippy, native/contract formatting and artifact checks. Four isolated
controls catch owner exclusion, cancelled SQL lease retention, host initialization
and reference bot-fallback regressions. Evidence:
`.jait/artifacts/gateway-rust/agent-github-port/partial-result.json` and
`tests/contract/reviews/native-agent-github-port.md`.

**No new component credit**: **228/370 originals plus 5/6 newer additions**;
**142 originals and one addition** remain pending. Success-payload schema/runtime
semantics, actual-service callback/webhook sequences, changed-App cache behavior,
cache bounds, host lifecycle deadlines/shutdown, out-of-band edits, identical-state
ABA and cross-process limits remain under review. Leases span individual port
operations; compound route sequences are not atomic. The host retains network
policy/streaming/physical cancellation authority. No current full native gate
covers this candidate; historical full233 remains stale. Production remains
TypeScript; platform, load/soak, recovery/rollback and activation gates stay open.

## Uncredited GitHub token and execution-environment slice — 2026-10-26

Token mint/cache, repository connection tests and agent execution environments
now release SQLite before each outbound await through the shared DatabaseWorker.
Post-mint revision checks prevent mixing an old token with newer connection
metadata. Actual-TypeScript comparisons cover the exact expiry/skew boundary,
fallback expiry, cache reuse, manual-save behavior, attach/disconnect eviction,
upstream errors, repository summaries and bot identity. The comparisons exposed
and repaired expiry serialization as a Rust Result object instead of a timestamp.

The frozen candidate passes **80 focused checks**, **316 library tests**,
strict Clippy, native/contract formatting and artifact checks. Four isolated
native/reference controls catch expiry-boundary, cache-eviction and stale-result
regressions; restored checks pass. Client checks cover cancellation, deadlines,
independent database/owner progress and stale success/failure across token/env
and both repository-test waits. Cache identity pairs prevent separator aliasing,
an explicit native compatibility tightening. Manual key saves preserve already
minted tokens as in TypeScript; transient repository failures keep retryable tokens.

Evidence: `.jait/artifacts/gateway-rust/agent-github-token/partial-result.json`
and `tests/contract/reviews/native-agent-github-token.md`. Frozen/live executable
fingerprints match; post-validation documentation changes are recorded separately.

**No new component credit**: **228/370 originals plus 5/6 newer additions** remain
verified; **142 originals and one addition** remain pending. Canonical HTTP/tool/env
service-port composition and sequential operation ownership remain unfinished.
Malformed upstream/runtime edge cases, out-of-band credential/cache coherence,
identical-state ABA and cross-process limits still need review. The host retains
destination/proxy/redirect, streaming and physical I/O cancellation authority.
There is no full native gate for this candidate; the historical 233-component
checkpoint has source drift. Production remains TypeScript; platform/load/soak,
recovery/rollback and activation gates remain open.

## Uncredited GitHub credential verification — 2026-10-26

App and installation verification now use sequential signed requests with bounded
SQLite preparation/completion around each network wait. Actual-TypeScript checks
cover owner isolation, enterprise URLs, sparse metadata, App identity mismatch and
failure/revocation behavior. Native service-client checks exercise cancellation,
per-request deadlines, independent database progress and stale success/failure
rejection at both waits. The stale guard is an explicit compatibility choice;
canonical HTTP/tool integration and operation ownership remain pending, with
identical-state ABA and cross-process limits.

The frozen candidate passes **68 focused checks**, **316 library tests**, strict
Clippy, native/contract formatting and artifact checks. Seven isolated native and
reference controls catch identity, revocation, verification-time and stale-result
regressions; restored focused checks pass. The identity control first failed
through the intended unexpected-request assertion; the validator was corrected to
recognize that specific failure. Concurrent local-deploy changes were preserved
and formatted before the snapshot. Frozen/live runtime fingerprints match.
Evidence: `.jait/artifacts/gateway-rust/agent-github-verification/partial-result.json`
and `tests/contract/reviews/native-agent-github-verification.md`.

**No new component credit**: **228/370 originals plus 5/6 newer additions** remain
verified; **142 originals and one addition** remain pending. Token mint/cache/
invalidation, repository checks, execution environment and canonical service
composition remain unfinished. The host retains destination/proxy/redirect,
streaming and I/O cancellation authority. Earlier malformed upstream schema/runtime
limits remain. There is no full native gate for this candidate; the historical
233-component checkpoint has source drift. Concurrent filesystem/project-transfer
targets were not run here. Production remains TypeScript; platform/load/recovery/
rollback and activation gates remain open.

## Latest completed GitHub HTTP frozen checkpoint — 2026-10-25 (233 components)

The full frozen gate passes **233/376 components (61.97%)**, comprising
**228/370 original targets** and **5/6 newer additions**. **142 originals** and
**1 newer addition** remain pending. GitHub App HTTP now has native authentication,
input/response presentation, callback sequencing and redirect encoding, and raw
webhook HMAC verification over the shared credential-service port. Credential
storage, signed-state implementation and external effects remain host boundaries;
the credential service has no implementation credit from this route.

The gate passes formatting, strict Clippy, native library tests and **162 differential
targets**, with all recorded fingerprints matching the frozen and live sources and
no unrecorded runtime inputs in the final audit. Evidence: `.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/233-report.json` and
`.jait/artifacts/gateway-rust/agent-github-http/completion.json`. Six new isolated
native/reference controls catch signature, agent-boundary and callback-order
regressions; restored HTTP/tool suites pass. The earlier twenty channel/question/
assessment controls retain matching source hashes. See
`.jait/artifacts/gateway-rust/agent-github-http/mutations.json` and
`tests/contract/reviews/native-agent-github-http.md`.

Production remains TypeScript. Configured System One chat-loop monitor service/tool
remain pending. Credential-service integration, supported platforms, load/soak,
recovery/rollback, composition and activation gates remain open; component coverage
and reference-test reconstruction remain separate. No activation, release or
publication is included.


## Earlier reconciled frozen checkpoint — 2026-10-25 (232 components)

The refreshed full frozen gate passes **232/376 components (61.70%)**:
**227/370 original targets** and **5/6 newer additions**. **143 originals** and
**1 newer addition** remain pending. This supersedes earlier live coverage counts:
channel HTTP is now verified, while `services/chat-loops.ts` and `tools/loop-tools.ts`
remain pending after concurrent TypeScript configured System One monitoring changes.
Their native deterministic lifecycle and reference-only monitor specifications do
not establish configured native monitor parity. See
`tests/contract/reviews/native-chat-loops.md`.

Formatting, strict native Clippy, 316 native library tests and 161
differential targets pass with exact live/frozen source fingerprints and unchanged
workspace outputs. Evidence: `.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/232-report.json`; final source audit and count reconciliation:
`.jait/artifacts/gateway-rust/channels-http/completion-reconciled.json`.
All twenty isolated native/reference mutations fail their intended assertions;
the restored channel/question/assessment targets pass (41 checks). Evidence:
`.jait/artifacts/gateway-rust/channels-http/mutations.json`.
Channel review: `tests/contract/reviews/native-channels-http.md`.

Bun runtime compatibility repairs cover argument and URL diagnostics, empty preview
keys, SQLite error codes and empty-result projection metadata. The focused repair
record binds 82 checks to source/log hashes:
`.jait/artifacts/gateway-rust/channels-http/runtime-compatibility-repairs.json`.
Concurrent Ollama redirect and history-read adapter changes were preserved and
validated; the history adapter earns no native component credit.

Production remains TypeScript. Configured chat-loop monitor composition, credential
service integration, supported platforms, load/soak, recovery/rollback, full
replacement and activation gates remain open. Component coverage and reconstructed
reference-test coverage are separate metrics. No production activation or release
is included.


## Earlier frozen native checkpoint — 2026-10-25 (233 components)

The full frozen-source native gate passes **233/376 components (61.97%)**:
**228/370 original targets** plus **5/6 newer additions**. **142 originals** and
**1 newer addition** remain pending (143 total). Formatting, strict Clippy,
316 native library tests and 161 differential targets pass. Frozen sources and
workspace outputs stayed unchanged; all recorded live fingerprints match after
mutation restoration, with no unrecorded native runtime sources. Evidence:
`.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/233-report.json`. Final audit and mutation evidence:
`.jait/artifacts/gateway-rust/consent-http/completion.json` and
`.jait/artifacts/gateway-rust/consent-http/mutations.json`.

This batch adds consent HTTP over the existing native queue: owner/thread checks,
filtered pending/count, permission order, click decisions/reasons, audit records,
notification-only bulk approval, session-wide override/clear and partial failure
ordering. Reserved parameter/method routing matches Fastify, including the
before-fix regression. Eight real-TypeScript loopback comparison groups, one
native authority/lane check and four driver transport checks pass. Fourteen
native/reference mutations produced their intended value-assertion failures;
the restored 13-check suite passes. Review:
`tests/contract/reviews/native-consent-http.md`.

The recovered 232-component ClawHub checkpoint also passes with exact live input
freshness; its eight focused checks and ten caught/restored mutations remain bound
by `tests/contract/reviews/native-store-http.md` and the store artifacts. Tests
approve only synthetic requests and perform no registry installation or live tool
execution. Ownership/audit and installer/registry host composition remains explicit.

Production remains TypeScript. Client/platform, load, recovery/rollback, remaining
native adapters and full replacement/activation gates remain open. Component
coverage does not establish reference-test reconstruction freshness; equal weights
do not estimate remaining effort. No activation, public release or version bump
is included.

## Earlier frozen native checkpoint — 2026-10-25 (232 components)

The recovered full frozen-source gate passes **232/376 components (61.70%)**:
**227/370 original targets** plus **5/6 newer additions**. **143 originals** and
**1 newer addition** remain pending. Formatting, strict Clippy, 316 native library
tests and 160 differential targets pass. Frozen sources stayed unchanged and all
recorded live fingerprints match the recovery audit, with no unrecorded native
runtime inputs. Evidence:
`.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/232-report.json`;
freshness audit: `.jait/artifacts/gateway-rust/store/progress-recovery.json`.

This batch adds ClawHub store HTTP routes, with actual TypeScript comparisons for
query coercion, search/detail enrichment, installed markers, timeout/failure
handling, install/version forwarding and uninstall errors. Ten isolated native/
reference mutations were caught and the restored eight-test target passes.
Review: `tests/contract/reviews/native-store-http.md`. Registry and installation
effects remain explicit host ports; these checks contact no registry and install
no skills. Production remains TypeScript. Platform, load, recovery/rollback,
full replacement and activation gates remain open. Component counts do not
establish reference-test reconstruction freshness or estimate remaining effort.

## Earlier frozen native checkpoint — 2026-10-24 (231 components)

The full frozen-source native gate passes **231/376 components (61.44%)**:
**226/370 original targets** plus **5/6 newer additions**. There are **144 original
components** and **1 newer addition** pending (145 total). Formatting, strict
Clippy, 316 native library tests and 159 differential targets pass. Frozen
sources and workspace outputs stayed unchanged; all recorded live fingerprints
matched, with no unrecorded native runtime sources. Evidence:
`.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/231-report.json`. Final audit:
`.jait/artifacts/gateway-rust/provider-updates/progress-final.json`.

This continuation adds provider-update policy with fixed process/registry requests,
cache and in-flight behavior, native-Claude PATH selection, timer lifecycle and
post-update verification. Sixty-four actual-TypeScript scenarios, two native
lifetime/concurrency checks and four driver checks pass. Fifteen bounded native/
reference mutations produced their intended value-assertion failures; restored
checks and the five existing TypeScript unit tests pass. TimeClip boundaries and
extended years use the shared ECMAScript timestamp helper. Review:
`tests/contract/reviews/native-provider-updates.md`.

The gate also includes the concurrent browser-family policy, prompt and result-
evidence reconciliation. Process, registry, filesystem and scheduler effects
remain explicit authorized host ports. Tests install no software. Client/platform,
load, recovery/rollback and replacement/activation gates remain open. Component
coverage does not establish reference-test reconstruction freshness. Equal weights
do not estimate remaining effort. Production remains TypeScript.

## Earlier frozen native checkpoint — 2026-10-24 (230 components)

The full frozen-source native gate passes **230/376 components (61.17%)**:
**225/370 original targets** plus **5/6 newer additions**. There are **145 original
components** and **1 newer addition** pending (146 total). Formatting, strict
Clippy, 316 native library tests and 158 differential targets pass. Frozen
sources stayed unchanged and every recorded live source fingerprint matched at completion.
Evidence: `.jait/artifacts/gateway-rust/runs/coverage-goal/checkpoints/230-report.json`.

The prior sandbox-process drift is reconciled, including exact forwarding of the
injected runner's invocation and timeout. Four additional native/reference
mutations were caught; the restored target passes. Native provider steering now
preserves deferred FIFO delivery, acknowledgement-owned consumption, rejection
fallback, pause boundaries and disposal without late transcript markers.
Twenty-three actual-TypeScript scenarios, two native task-lifetime checks and
four driver checks pass. All 13 isolated regressions were caught and restored;
the five existing TypeScript steering tests also pass. Review:
`tests/contract/reviews/native-steering-dispatcher.md`. Evidence is under
`.jait/artifacts/coverage-goal/`.

Steering is dispatch policy over an authorized session queue, provider and
supervised scheduler. This grants no full agent-loop, provider-transport or
production-composition credit. Remaining native components, reconstructed-test
parity, client/platform/load/recovery/rollback and replacement gates remain open.
Equal component weights do not estimate remaining effort. Production remains
TypeScript. Later source changes require fresh verification.

## Earlier frozen native checkpoint — 2026-10-24

The full frozen-source native gate passes **229/376 components (60.90%)**:
**225/370 original targets**, plus **4/6 newer additions**. There are **145 original
targets** and **2 newer additions** pending. Formatting, strict Clippy, 316
native library tests and 157 differential targets pass. Frozen sources and
workspace outputs stayed unchanged; every recorded live fingerprint matched at
completion, with no unrecorded native source files. Evidence:
`.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/229-report.json`. Audit:
`.jait/artifacts/gateway-rust/chat-loops/progress-229.json`.

This checkpoint adds sandbox process lifetime policy and thread-review polling.
The sandbox policy passes 24 actual-TypeScript scenarios and eight caught/restored
native mutations. Thread-review synchronization passes 60 actual-TypeScript
scenarios, two native lifetime checks and eleven caught/restored native/TypeScript
mutations. Both use explicit host ports; real process supervision, authorized
Git/forge/node effects and production composition remain integration gates.
Reviews: `tests/contract/reviews/native-sandbox-background-process.md` and
`tests/contract/reviews/native-thread-review-sync.md`.

Production remains TypeScript. Remaining components, platform/resource/recovery,
replacement and activation gates remain open. Equal component weights do not
estimate remaining effort. Current work:
`.jait/artifacts/gateway-rust/chat-loops/current-work.json`.

Thread-title generation reuses the native normalizer and adds provider/API policy.
Actual TypeScript comparisons pass seven title contracts plus four harness checks;
20 TypeScript unit tests and the client title/fallback check pass. All eight
isolated mutations were caught and restored. The review records exact-deadline
and completion-before-send-error fixes, lossless UTF-16 comparisons, narrow
engine-generated TypeError diagnostic normalization and host integration limits:
`tests/contract/reviews/native-thread-title-reconciliation.md`.

This continuation adds the persistent-agent management/inspection factories and
agent GitHub status/instructions/test/token factories. Actual TypeScript
comparisons cover complete consent metadata, owner/identity dispatch, generated
UUIDv7 identities, shared profile validation, shallow patch preservation,
connected-account checks, token environment fields and exact error boundaries.
A prototype-key comparison found and fixed native retention of a field Zod strips.
All 14 isolated deliberate regressions were caught; restored focused targets pass
22 checks. Reviews: `tests/contract/reviews/native-persona-tools.md` and
`tests/contract/reviews/native-agent-github-tools.md`; focused evidence is under
`.jait/artifacts/gateway-rust/chat-loops/`.

These adapters use explicit host service ports. Storage, reporting-line integrity,
credential management, token transport and execution remain their services'
responsibilities. Equal component weights do not estimate remaining effort.
Production remains TypeScript; remaining components and broader platform,
resource/recovery/rollback, replacement and activation gates remain open.

## Previous native checkpoint — 2026-10-24 (223 components)

The full frozen-source native gate passes **223/374 components (59.63%)**:
**219/370 original targets**, plus **4/4 newer inventory additions**. There are
151 original components still pending. The live inventory now has two further
concurrent runtime additions, both pending: **223/376 recorded**. Newer additions
are tracked separately in `.jait/artifacts/gateway-rust/chat-loops/newer-inventory-components.json`.
The original target list is retained at
`.jait/artifacts/gateway-rust/chat-loops/original-370-components.json`.
Evidence: `.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/223-report.json`.
Formatting, strict Clippy, 316 native library tests and 151 contract targets pass.
Frozen sources stayed unchanged; all recorded live fingerprints matched when
this checkpoint was recorded. Subsequent implementation edits require a new gate.

This batch includes native chat loop service/tools and plugin HTTP management,
with actual TypeScript comparisons for lifecycle, ownership, revision checks,
evidence and error precedence, persistence, plugin authentication, dispatch,
configuration merging and failures. Ten isolated mutations were rejected and
restored suites pass. Reviews: `tests/contract/reviews/native-chat-loops.md` and
`tests/contract/reviews/native-plugin-http.md`; focused evidence is under
`.jait/artifacts/gateway-rust/chat-loops/`. The frozen gate includes the concurrent
native context, evidence, provider steering and code-graph work recorded in the
ledger; their component reviews remain authoritative for their limits.

Equal component weights do not estimate remaining effort. Production remains
TypeScript. Remaining adapters and engines, supported-platform validation,
resource/recovery/rollback, full replacement and activation gates remain open.
No production activation, public release or version bump is included.

## Previous native checkpoint — 2026-10-22

The full frozen-source gate passes **209/370 components (56.49%)**, with
formatting, strict Clippy, 303 native library tests and 143 contract targets.
Evidence: `.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/209-report.json`.
The frozen sources stayed unchanged and all recorded live inputs match. The fast
`tooling/progress.mjs` audit reports no drift, missing runtime inputs or issues.

This continuation adds six native source components: assessment tool factories,
workbench tool factories/service/HTTP routes, repository todo/plan tools, and the
network scan tool/cache. Actual TypeScript comparisons cover metadata, dispatch,
ownership, authorization/budget/cancellation, persisted findings and dispositions,
remediation/verification, report aliases, repository task/plan behavior, network
cache identity, SQLite persistence and partial failures. Forty-one deliberate
regressions were caught and restored across this batch and its freshness fixes.
Reviews: `tests/contract/reviews/native-security-workbench.md`,
`native-repo-todo-tools.md`, `native-network-scan-tool.md`, and
`native-session-freshness.md`.

Session forks now discard parent loop state; wait subscriptions preserve shared
event identity, live subscription changes and reset behavior. The capability
catalog matches the current loop capability. These freshness fixes add no
component credit. The prior 203-component registry/team/Messenger checkpoint and
its reviews remain recorded.

An inventory audit added five previously omitted runtime files as **pending**
components: command syntax/wait helpers, terminal execution factory, loop service
and loop tools. Existing test mappings and reference fingerprints were preserved.
The historical 208/365 checkpoint remains valid for its former inventory;
adding inventory entries grants no native or translated-test credit.

**161 components remain.** Equal source-component weights do not estimate effort
or time. Production remains TypeScript. Explicit engine, snapshot, scanner and
transport ports retain their caller's authorization, target/vantage, budget,
cancellation and evidence duties; adapters earn no underlying engine or
production-activation credit. Registry/transport activation, browser chat
lifecycle, remaining engines/adapters, supported-platform, resource, recovery,
rollback and replacement gates remain open. Reference-test reconstruction and
freshness are measured separately. Workspace TypeScript and artifact-path checks
pass; focused/restored/mutation evidence lives under
`.jait/artifacts/gateway-rust/security-workbench/`.

Parallel native implementation beside `packages/gateway`. The default standalone
profile serves `GET /health` (and HEAD). Explicit development activation composes
the account/session APIs and optional model-only chat described below.

## Core workflow integration in progress

The default executable remains health-only. An explicit development opt-in now
composes the migrated account/session APIs with one persistent bounded SQLite
worker and live database-backed health:

```sh
JAIT_RUST_APPLICATION=1 \
JAIT_RUST_DB=/absolute/project/.jait/artifacts/rust-dev/application.sqlite \
JAIT_RUST_PROJECT_ROOT=/absolute/project \
JWT_SECRET='<explicit development signing secret>' \
bun run dev:gateway:rust
```

Use disposable development state for this migration profile. No dotenv or
default host state is discovered. This starts accounts and sessions. Shutdown closes the shared worker; storage
failures return unhealthy readiness. The production service remains TypeScript.

Model-only development chat additionally requires `JAIT_RUST_CHAT=1`, an explicit
`JAIT_RUST_CHAT_BASE_URL` and `JAIT_RUST_CHAT_MODEL`, with optional
`JAIT_RUST_CHAT_API_KEY`. It discovers no credentials or host configuration.
The candidate provides consuming POST SSE, bounded persistent turn history and UI
message projection, cancellation, and a separate owned-session event subscription
with durable IDs and Last-Event-ID replay. Its configured factory advertises no
tools. Existing TypeScript history needs an explicit importer before native model
execution can use it. The main browser protocol/detached-POST lifecycle, full tool
registry, WebSocket control plane and frontend hosting remain separate work.
See `tests/contract/reviews/native-chat-http.md` for the exact limits.

Core slices are checked with targeted Rust contracts:

```sh
node tests/contract/run.mjs test --test gateway_rust_application --test gateway_rust_remote_provider --test gateway_rust_process_runner
node --test packages/gateway-rust/tooling/progress.test.mjs
node packages/gateway-rust/tooling/progress.mjs --output .jait/artifacts/gateway-rust/progress.json
```

The remote CLI provider adapter requires an explicitly supplied control-plane
transport; it does not discover or authorize a connected node. The process runner
requires explicit argv/environment and caller authorization; it is not itself a
sandbox or exposed terminal tool. These partial slices do not earn whole-component
credit until their implementation, review and source-bound validation gates pass.
The fast progress command reads inventories and checkpoint fingerprints without
compiling or running the migration suite. It reports implementation and reference
test parity separately and marks stale or missing evidence.

## Foundation and construction plan

The [architecture decision](../../docs/gateway-rust-architecture.md) fixes the core
stack, module ownership, performance targets and implementation sequence. The
workspace builds one modular native process with Tokio, Axum/Tower, Serde and
rusqlite. The domain directories are declared in `src/lib.rs`; reserved modules
contain documentation, not migrated behavior. Server lifecycle lives under
`runtime/`, and `runtime::blocking::BlockingLane` provides bounded admission for
database/CPU adapters. Auth handlers use a dedicated SQLite worker with a bounded
queue and a separate password-derivation lane.

Release builds use thin LTO and one codegen unit, with unwinding retained. Run
`bun run build:gateway:rust --release` for performance measurements; debug builds
are not the performance baseline. Targets in the architecture decision still
need matched-workload measurements. Directory creation earns no parity credit.

From the repository root (Rust 1.98+, Node for development tooling):

```sh
bun run dev:gateway:rust
# http://127.0.0.1:8220/health
JAIT_RUST_PORT=0 bun run dev:gateway:rust
bun run build:gateway:rust
bun run test:gateway:rust
```

The compiled `.jait/artifacts/gateway-rust-target/debug/jait-gateway` runs without
Node, Bun, or PATH. The reference tests require Bun to execute the real TypeScript
functions. Build output stays under `.jait/artifacts/`; dependencies are locked
and compilation is bounded to two jobs.

Composed application (`JAIT_RUST_APPLICATION=1`) options:

- `JAIT_WEB_DIR=/abs/path/to/apps/web/dist` serves the built web UI on the gateway
  port with an SPA fallback; unclaimed `/api`, `/health` and `/ws` paths stay JSON 404s.
- `JAIT_RUST_ALLOW_NON_LOOPBACK=1` allows `JAIT_RUST_HOST` to be a non-loopback
  address. Default is off and the bind stays loopback-only.

## Verified components

The historical 141-component frozen-source checkpoint covers 141 of the then-364 gateway
source components in `tests/contract/coverage.json`: **38.74% focused native component
coverage**. The current report records whether that snapshot still matches live sources. Components have equal weight; this percentage measures neither effort
remaining nor readiness to replace production.

- Health responses: exact schema, provider branches, counts and null/omitted
  fields; uptime alone is normalized. Tokio/Axum own sockets, signals and bounded
  graceful shutdown. Loopback is enforced at configuration and bind boundaries.
- UUIDv7: deterministic timestamp/entropy compatibility and random ID checks.
- State/database paths: explicit precedence, test-mode default-path refusal and
  ECMAScript whitespace semantics.
- SQLite connection/migrations: bundled SQLite, WAL/NORMAL/foreign keys,
  migration tracking and repairs. All 76 current-definition schema prefixes are
  compared with TypeScript; populated workspace/project and repository
  migrations, failed migrations, backups and TypeScript reopen are exercised.
- HTTP authentication primitives: HS256 signature verification, session claims,
  purpose separation, expiry/not-before, public path allowlist, bearer/cookie
  precedence and 401 responses. The crypto provider verifies the original compact
  signing input; JOSE parsing retains the reference's critical-header and
  base64url behavior.
- Ownership: identical 404 responses for missing, unowned and foreign resources.
- User repository: Node-compatible scrypt hashes, owner invitations, user lookup,
  settings and nullable patches, explicit selection, internal binding and owned
  archive cleanup. Rust-created credentials reopen in TypeScript. Internal
  binding needs route authorization before exposure.

- Account HTTP routes: actual Fastify/native HTTP comparisons for registration,
  login/refresh/logout cookies, single-use invitations, settings/tool locks,
  environment status, archived cleanup, session binding and origin/deleted-user
  denials. Explicit database and secret configuration is required.
- Preview grants: one-hour resource-scoped HS256 tokens with session-token
  separation, expiry, claim/header boundaries and empty-key rejection.
- Outbound URL policy: protocol/host allowlists, localhost and IPv4/IPv6 private
  address checks. This preserves the syntactic reference guard; DNS resolution,
  redirects and connection pinning remain transport work.
- Trust state and node credentials: memory/SQLite modes, progression and reverts,
  persistence/reopen, failed trust writes, ownership, SHA256-only credential
  storage and revocation.
- Session/project JSON state: isolated reads, upserts and deletes, malformed
  legacy values and exact project UI-state migration behavior.
- Node capability persistence: deny-by-default registration, explicit grants,
  partial failures, permission audit records and transactional forgetting.
- Thread selection defaults: inherited provider/model/runtime/effort, optional
  stores, shape validation and omitted-value behavior.
- Execution timeouts: finite defaults/caps, input coercion, environment settings,
  fractional rounding and clamp warnings. Terminal execution remains unported.

- Session repository: nullable legacy records, scoped lists/updates, activity and
  viewed acknowledgements, project moves, selection/error metadata, immutable
  forks with live snapshots, and rollback when copying fails.
- Project repository: directory lookup/adoption, ancestor-preserving pages, search,
  cycle/depth validation, inherited roots/instructions, repository links and
  subtree lifecycle effects, including SQLite partial failures.
- Audit storage and JSON ceilings: persisted action lookup and nullable fields,
  exact JSON ordering, progressive depth/width/byte limits, circular/shared
  objects, BigInt/undefined conversion and Unicode boundaries.
- Lifecycle hooks: ordered and identity-deduplicated handlers, live subscription
  changes, nested emission, error propagation and bootstrap file loading.
  File-reading hooks require a blocking worker; scheduled jobs remain unported.

- Repository registration: owner/path deduplication, exact path identity, nullable
  patches, forge URL compatibility and recovery from failed inserts.
- Repository todos and plans: completion/reopen history, provenance and limits,
  durable task JSON, task patches and malformed legacy JSON handling.

- Thread replay construction: bounded messages/checkpoints, original-task
  retention, tool/todo context, UTF-16 boundaries and source errors.
- Immutable asset cache: real HTTP comparisons, exact path/type filtering,
  conditional request fallthrough, LRU/byte ceilings and bounded file reads.
  `Gateway::with_static_asset_cache` mounts it explicitly; full frontend serving
  and its fallback/auth integration remain unported.

- Memory storage and BM25 ranking: scope/provenance/expiry preservation,
  exact tokens, document statistics, and numeric score comparisons.
- Memory engine: scoped source/content replacement, expiry, BM25 relevance cutoff,
  freshness ties, durable pre-compaction fact extraction, and daily/curated Markdown
  logs, including storage/log failures and their persisted effects. Provider
  injection and memory HTTP/tools remain unported. Freshness compatibility currently
  covers ISO timestamps/date-only values; implementation-specific legacy date
  formats remain a limitation.
- Shared control access: owned sessions/threads, explicit surface owners and
  session fallback, pending consent, and distinct owned default execution sessions.
  Device registration retains connection time, capability order and stable ties.
- Worktree metadata: registered common Git directory mounts are read-only; forged
  backlinks, unregistered metadata, colon paths and symlink markers are rejected.
- Terminal helpers: retained output offsets, full bounded command slices, partial
  line recovery, completion-marker trimming and shell-prompt recognition. Remote
  Git-node selection preserves explicit/local/platform precedence. Process/PTY
  execution remains unported.
- LLM headers: per-configuration Go conversation identity and explicit session
  precedence, with UUID layout checks. Provider execution remains unported.
- Persisted tool calls: exact raw JSON retention, progressive byte compaction,
  optional metadata, Unicode byte limits and metadata-only fallback. Focused
  contracts cover finite-number, well-formed Unicode JSON; JavaScript overflow
  numbers and unpaired-surrogate parsing remain compatibility limits.

Storage and security are library boundaries with disposable integration tests.
**Standalone startup still opens no database and reads no credentials.**
The auth adapter can be mounted through `Gateway::bind_authenticated` with explicit
storage and credentials. Session HTTP APIs, providers, tools, scheduler, frontend
serving, WebSocket and SSE remain unported.

The `test:gateway:rust` command checks format, strict native Clippy, native unit
tests and all thirty credited contract targets, then records source hashes before/after execution.
All inventoried gateway and shared sources are fingerprinted to bind indirect
dependencies as well. Reviewed component reference drift fails the check. Reports are saved to
`.jait/artifacts/gateway-rust/native-progress/report.json`; failed or changing-source
runs receive zero verified credit in that report. A source manifest and passing
contracts are focused evidence, not proof that every branch has been covered.

## Reference defect found during migration

Malformed password digest hex could decode to an empty buffer in the TypeScript
repository, authenticating a corrupt stored credential via a zero-byte comparison.
Both implementations now require a complete 64-byte hex digest. Existing valid
hashes retain their format, including uppercase hex compatibility.

The original TypeScript regression produced four failures before the fix and eight
passes afterward; `gateway_rust_users` also failed before that reference correction
and passes afterward. See `packages/gateway/src/services/users-password.test.ts`.
Evidence is under `.jait/artifacts/gateway-rust/password-before.log` and
`password-after.log`. No live accounts or stored credentials were altered.

## Continuation and replacement gates

Next: integrate the owned session/project HTTP APIs with audit and lifecycle
hooks, then complete transport/observability and streaming as domain slices. Bounded database/CPU
work and account HTTP adapters are in place.
Keep every route inventoried and validate its actual TypeScript behavior before
granting component credit.

The [migration plan](../../docs/gateway-rust-migration.md) retains full-suite,
authorization, recovery, platform, memory/resource and rollback gates. Historical
released-schema recovery and supported-platform builds remain unverified. The
current tests establish Linux focused compatibility. Production startup and the
installed gateway have not been switched over.

## Completion target

The requested target is **all inventoried native components (currently 370/370, 100%)**.
The source-bound report and its live-source match flag are authoritative.
The earlier 55/361 checkpoint described below is historical; the completion target remains open.
The source-bound report covers formatting, strict Clippy, seven native tests and
345 contract-test executions across thirty targets (including repeated driver checks). Focused cases expand into multiple
requests and value matrices; they do not establish full application parity.

The former auth HTTP timeout was fixture teardown: all responses were consumed,
but Bun retained connections after rejecting a request before reading its body.
The adapter now closes fixture-owned HTTP connections before awaiting Fastify
shutdown. The same failing test passes without increasing its ten-second budget.
The preview empty-key regression also fails before the correction and passes
afterward. Evidence is under `.jait/artifacts/gateway-rust/`.

The latest batch also records fail-then-pass regressions for null legacy session
columns and error truncation at a UTF-16 boundary. Evidence is in
`.jait/artifacts/gateway-rust/sessions-nullable-before.log`,
`sessions-nullable-after.log`, and `sessions-unicode-before.log`; the passing
session suite and full validation log are in the same artifact directory.

The latest continuation retains an intermittent listener-release assertion failure.
Twenty focused repetitions and a subsequent full gate passed; its root cause is
unconfirmed. The assertion is retained with bind diagnostics, and an additional
lifecycle test holds a client open through shutdown. The initial Python socket
experiment used different socket options and does not establish a Rust runtime
fault. Evidence: `.jait/artifacts/gateway-rust/listener-reproduction/`.


The current continuation adds native question/secret request lifecycles,
completion-notification state, notification broadcast/sink dispatch, usage
aggregation and refresh caching, and the user.ask tool adapter. The three new
suites pass 34 tests (including repeated subprocess transport checks). Eight
reversible mutations fail their intended assertions and restored sources pass.
Usage-cache force behavior follows the latest reference: after a 30-second
cooldown, manual refresh bypasses failure backoff. Loader starts preserve run
order while pending I/O overlaps. Reviews are in
`tests/contract/reviews/native-input.md`, `native-feedback.md` and
`native-user-ask.md`; the authoritative passing checkpoint is
`.jait/artifacts/gateway-rust/checkpoints/55-report.json`.


## Latest continuation

The source-bound native gate targets 78/361 components (21.61%). New contracts
cover context token estimation, provider todo normalization, provider snapshots,
Linux OpenCode credential storage, user-question HTTP, hook HTTP and the execution
guard. See reviews native-context.md, native-provider-helpers.md,
native-question-http.md and native-execution-guard.md in tests/contract/reviews.
The canonical report and unchanged-source hashes are stored under
.jait/artifacts/gateway-rust/native-progress. The 181/361 milestone is still open.

Trust-management HTTP now has a bounded native storage worker with a persistent
cache, including retained state after failed writes and external SQLite changes.
Its focused review is native-trust-http.md. The next source-bound gate targets
79/361 components (21.88%); reports remain authoritative for actual verification.

Encrypted user-secret storage (`user-secrets.ts`) and the secret-request/storage
routes (`secrets.ts`) are now native. AES-256-GCM matches node:crypto's key
derivation and base64 layout; cross-implementation decrypt round-trips pass in both
directions. The latest source-bound gate verifies **81/361 components (22.44%)**.
See tests/contract/reviews/native-secrets.md; reports remain authoritative.


Assistant profile storage and HTTP, computer-control leases, the process-wide
assessment execution lock, transient swarm mailboxes and inline raster/CID image
handling now have native implementations. Exact TypeScript comparisons and seven
restored mutations pass. The source-bound gate verifies **87/361 (24.10%)** with
unchanged sources; checkpoint: .jait/artifacts/gateway-rust/checkpoints/87-report.json.
The requested **181/361 (50.14%)** milestone remains open.


## Calendar and runtime safety continuation — 2026-10-19

The frozen-source gate passes at **113/361 (31.30%)**. This batch adds the native
calendar account service and calendar tools, sandbox owner identity/liveness, and
the disk-space watchdog. Reviews in `tests/contract/reviews/native-calendar-service.md`,
`native-calendar-tools.md`, `native-sandbox-owner.md`, and `native-disk-watchdog.md`
document exact boundaries. The four new targets pass 36 test executions, including
repeated subprocess-driver checks; eleven restored mutations fail their intended
assertions. Native OAuth futures now finish form encoding before awaiting I/O,
allowing the calendar tools to use the shared executor. Native Clippy, the four
TypeScript adapters and artifact-path checks pass.

The target is now all **361 components**, with 248 remaining in the reviewed
ledger. `.jait/artifacts/gateway-rust/remaining-native-components.json` enumerates
them without deleting or shrinking source requirements. Production startup,
full client parity, supported-platform, resource and rollback gates remain open.
Use `native-progress/report.json` to distinguish a passing frozen snapshot from
matching live-source evidence; concurrent edits can invalidate freshness.


## Calendar HTTP and provider registry continuation — 2026-10-19

The current source-bound gate passes at **116/361 (32.13%)**, with matching live
source fingerprints. This continuation adds the opt-in calendar HTTP adapter,
provider registration/ownership/lifecycle, and MCP reference/configuration helpers.
The three new targets pass 27 test executions (including repeated subprocess
transport checks); six restored mutations catch owner, snapshot-limit, HTML-escape,
namespace and unregister failures. Reviews: native-calendar-http.md and
native-provider-registry.md under tests/contract/reviews.

The same failing assertions now pass for two reproduced mismatches: invalid event
limits returned two events instead of none, and empty terminal-output ranges
returned the preceding partial line instead of empty output. Evidence is under
.jait/artifacts/gateway-rust/{calendar-limit-before,calendar-http-after,terminal-empty-before,terminal-empty-after}.log.
The terminal reference change was reviewed and its ledger fingerprint refreshed
only after the native comparison passed. The session HTTP candidate remains
uncredited.

The 100% goal remains open, with **245 components remaining**. See
.jait/artifacts/gateway-rust/remaining-native-components.json and
.jait/artifacts/gateway-rust/next-provider-slice.json. Production startup and
cutover readiness remain separate.

## Explicit native text-chat application

The candidate account/session application can now mount authenticated chat SSE
when `JAIT_RUST_CHAT=1` is set alongside `JAIT_RUST_APPLICATION=1`. Supply an
absolute `JAIT_RUST_DB`, absolute `JAIT_RUST_PROJECT_ROOT`, nonblank `JWT_SECRET`,
explicit `JAIT_RUST_CHAT_BASE_URL` (OpenAI-compatible API prefix) and
`JAIT_RUST_CHAT_MODEL`. `JAIT_RUST_CHAT_API_KEY` is optional for keyless local
models and never falls back to ambient OpenAI credentials or dotenv files.
Invalid configuration fails before opening the database. Use an explicitly
chosen development database, for example under the repository's
`.jait/artifacts/gateway-rust/` directory. This opt-in does not deploy or replace
the running gateway.

Authenticated routes:

- `POST /api/chat`: `{ "sessionId": "<owned-active-session>", "content": "Hello" }`;
  aliases `session_id` and `message` are accepted. Consume the response body as
  SSE `data:` JSON until `done` or `error`. A disconnected consumer cancels its
  turn and retains bounded partial text.
- `POST /api/chat/cancel`: `{ "sessionId": "<owned-active-session>" }`; also
  `POST /api/sessions/<id>/cancel`.
- `GET /api/sessions/<id>/messages?limit=50&before=2`: bounded UI message window;
  `before` is the exclusive visible message index. Omit it for the latest page.

The executable's configured factory exposes text chat. Typed injected factories
can compose the separately tested consent/tool adapters; enabling a general
terminal still requires the registry, sandbox and scoped execution integration.
Request fields cannot select URLs, credentials, tools, roots or access modes.
Unknown fields are rejected.

Native turn records materialize compatible user/assistant rows in the existing
`messages` table in the same transaction, preserving tool-result correlation,
segments and thinking. The native event log remains authoritative for model
replay. Existing TypeScript-only conversation rows are readable but require an
explicit importer before Rust may continue their model history. No schema
migration is introduced. Native and foreign history are never silently mixed.
Message pages enforce raw and serialized byte limits before returning data.

This is a consuming POST-SSE API, compatible with the API-client streaming path.
The main browser chat currently cancels its POST response after acceptance and
listens through a separate subscription. That browser lifecycle, live trajectory
subscription/replay, rich request selectors, attachments, platform/resource gates
and production cutover remain separate work. Review:
`tests/contract/reviews/native-chat-http.md`.

Git status integration: branch-configured remote selection and origin fallback passed the scoped authenticated HTTP fixture. PR lookup and worktree remote fallback remain incomplete; this is focused evidence, not Git component verification. See `.jait/artifacts/gateway-rust/chat-loops/git-status-20261029.md`.

Git PR status: scoped fixture CLI regression passed for explicit head and GitHub owner/repository arguments, non-GitHub lookup without repository selector, and merged/default-open projections. The fixture checks arguments and cannot access the network. Token fallback, broader remote parsing and real CLI behavior remain unverified; no component credit.

Git status provider classification has focused local parser evidence for Azure DevOps and selected other host/path forms in `.jait/artifacts/gateway-rust/chat-loops/git-status-20261029.md`. This does not verify the Git component or token fallback.

Code-graph runner checkpoint: a cancelled build now stops before runtime setup,
and cancellation observed after setup or version probing stops later extraction.
The focused `cancelled_graph_build_does_not_start_runtime_or_extraction` Rust
unit test passed (1 test, offline locked Cargo). Setup or version probing already
in progress is not interrupted by these checks; the supervised extraction executor
still receives the original cancellation signal. This is an intentional earlier
cancellation admission than the TypeScript reference and is not component parity
or verification credit; client compatibility and end-to-end integration remain
open. The live ledger still records 236 historically verified and 87 implemented
original paths, with 47 absent; reference drift affects seven verified and nine
implemented entries. Production activation and frozen-source validation remain open.

Code-graph ownership integration checkpoint: the HTTP backend can now receive an
active-project lookup backed by the application's bounded SQLite worker. It
rejects an empty owner before the project service's unscoped query fallback. The
focused `worker_project_adapter_limits_results_to_active_owner` Rust unit test
passed (1 test, offline locked Cargo), covering another owner, archived state and
empty identity. The adapter is not yet mounted in the development application: the
graph index store now offers a bounded-worker-backed constructor, while its legacy
constructor still uses a synchronous connection. The focused
`worker_backed_index_storage_is_owner_scoped` test passed (1 test, offline locked
Cargo), covering owner isolation and worker shutdown. Runtime composition and an
authorized effect executor remain necessary; no native component verification
credit is claimed for this partial integration.

Code-graph active builds now use structured owner/root keys, preventing distinct
pairs containing delimiters from sharing a build. The focused
`distinct_owner_and_root_pairs_do_not_share_builds` test passed (1 test, offline
locked Cargo). This does not authorize runtime mounting: the output-directory
scheme previously mapped an absent owner and the literal owner `system` to the same
directory; the v2 change and remaining authority limits are described below.
Resolve these boundaries with a compatibility plan before exposing graph effects.
No component verification credit is claimed.

Code-graph path migration review: TypeScript uses the same `system` fallback,
while owner-scoped database rows retain `graphPath` independently. A new hash
alone therefore cannot establish which owner created an existing shared file.
Before mounting, use a versioned, unambiguous encoding for every new owner/root
pair, and require reindexing for ambiguous legacy paths rather than copying or
attributing their contents. Review how unambiguous legacy paths are accepted and
obtain client compatibility evidence before enabling a migration. Validate both
build-returned and stored paths under explicitly authorized roots, including
symlink and replacement races; GraphRAG currently derives a write directory from
the stored path, so a lexical prefix check alone is insufficient. These are pending
requirements, not implemented safeguards or a production migration.

New native code-graph builds now use a `v2` output namespace with tagged,
length-delimited owner and root inputs; empty owners follow the database's absent
owner semantics. This separates new absent-owner builds from the literal `system`
owner. Graph reads, GraphRAG preparation and build results now reject paths other
than the two expected graph filenames in the current owner/root v2 namespace;
legacy rows require reindexing and are not silently migrated. This lexical check
is not symlink-safe and does not establish filesystem authority against replacement
races. This intentionally differs from TypeScript output paths; client compatibility
evidence and reviewed filesystem authority are required before mounting. No native
component verification credit is claimed.

The opt-in ClawHub store port now signals request cancellation when an admitted
port future is abandoned; normal completion leaves the shared request token
unchanged. The focused `abandoned_port_cancels_request_during_authority` test
passed. This covers abandonment during authority acquisition, not atomic
cancellation of a running blocking mutation. Runtime wiring and effect-boundary
and concurrent mutation evidence remain outstanding; no coverage credit added.

ClawHub uninstall cancellation continuation (2026-11-01): the native store rechecks cancellation after final uninstall authorization and before rename. The focused `uninstall_denial_and_abandonment_preserve_installed_files` test passed with a local installed-skill fixture, denied effect authority, and a request abandoned during final authorization. Cancellation and rename remain non-atomic; this does not establish mutation parity, shared runtime registry ownership, request-authority composition, or production mounting. No component verification credit is awarded.

The opt-in ClawHub shared store now exposes a bounded-lane, point-in-time registry snapshot for discovery. The host must authorize discovery, and a snapshot is not authority for later file access. Runtime ownership, request-scoped discovery authorization, safe file reads, and supervised shutdown remain to be composed; this does not establish runtime integration or component verification.

A focused `committed_uninstall_updates_later_discovery_snapshot` test confirms that a successful shared-store uninstall is visible in a subsequent discovery snapshot and that an earlier snapshot remains unchanged. This is point-in-time registry evidence only: the runtime still needs request-authorized discovery, safe file reads, and lifecycle ownership. `BlockingLane::close` rejects new work but does not wait for running closures, so shutdown must also supervise their completion before releasing dependent resources.

## Release validation continuation — 2026-11-03

The release audit found 12 verified ledger entries whose TypeScript reference
fingerprints have drifted. `bun run test:gateway:rust --full-contracts` therefore
stops before execution; fingerprints were not refreshed without parity review.
The full contract suite is also invoked directly for diagnostic evidence. Strict
Clippy currently fails, including unused agent-loop imports and existing style
findings. These failures remain Rust migration work; this release keeps the
TypeScript production gateway and claims no new native readiness or coverage.
Release validation logs are under `.jait/artifacts/release-rust-*.log`.

Native integration continuation (2026-11-03): the WebSocket candidate now has an
injectable, fail-closed session and resource authorizer, with scoped delivery
rechecked before writes; its isolated harness reported 14 tests passing. A real
canonical resource authorizer, terminal ownership, snapshots and broader contract
parity remain outstanding. Browser bridge focused tests reported 17 passing, but
there is no supervised production browser driver or end-to-end DNS, redirect,
consent and screenshot authority. Update staging focused tests reported three
passing; candidate execution lacks an OS sandbox and activation is unavailable.
None of these focused results awards component verification credit.

Desktop-host lock review is recorded in
`.jait/artifacts/gateway-rust/desktop-host-review/cross-runtime-lock.md`. The
candidate Linux flock does not coordinate with the TypeScript PID-file protocol;
the native host must not be composed or run alongside it until shared locking,
authorized state-directory handling and platform requirements are resolved.

Agent-loop provider retry continuation (2026-11-03): rate-limit and transient
transport retry waits now use the bounded cancellation-aware wait. The focused
`provider_retry_wait_stops_when_aborted` test passed for both paths, confirming
that cancellation during the first wait prevents a second provider request; the
existing `rate_limit_is_retried_with_provider_retry_after` test also passed.
This does not establish complete agent-loop parity or live runtime integration,
and adds no component verification credit.

Provider retry observer parity: the native loop now emits the TypeScript `steering` notices for transient transport retries and for rate limiting from the second attempt, using the TypeScript message text and linear transport delays. The TypeScript chat route forwards these notices and `jait-provider.ts` maps them to activity. Focused Rust tests `provider_retry_observer_matches_typescript_notices` and `rate_limit_is_retried_with_provider_retry_after` passed. This is observer-level evidence only; live runtime integration and component verification remain open.

Update staging argument hardening: the shared npm install argument builder in
`src/update/safe_update.rs` now includes `--ignore-scripts`, matching the
supervisor contract that already stated lifecycle scripts must not run during
staging. The focused `update_arguments_reject_injection` test asserts the flag
and the staged prefix and passed (1 passed, 0 failed). A capable host supervisor
and activation wiring are still absent, so the update runtime remains
partial and no component verification credit is awarded.

Mobile update-check parity: `src/routes/update.rs` previously covered three of
the four TypeScript update endpoints; `/api/mobile-update/check` was missing. The
route is now served, `Release` carries `assets`, `UpdateBackend::latest_release`
reads GitHub `releases/latest` through the existing fixed-URL plumbing, and the
pure `mobile_update_payload` helper mirrors the TypeScript selection rules:
unsigned `.apk` assets are excluded, an `android` asset is preferred, a first
`wear` asset supplies `wearDownloadUrl`/`wearAssetName`, the `v` tag prefix is
stripped, and `hasUpdate` requires a non-empty current and latest version, a
preferred asset and a strictly newer version. The 502 body uses the TypeScript
`Failed to check for updates` text. Focused tests
`mobile_payload_prefers_android_apk_and_skips_unsigned_builds` and
`mobile_payload_reports_no_update_without_a_newer_signed_apk` pass, and the
whole update module run (`cargo test --lib update::`, build 27.81s) is 8 passed,
0 failed, 1870 filtered. One deliberate deviation: the native helper trims the
release tag before stripping `v`, while TypeScript does not. This is
endpoint-shape evidence from GitHub plumbing plus pure-function tests only; no
live GitHub request, no update activation wiring and no mobile delivery path were
exercised, so the update component remains partial with no verification credit.

Route-level coverage was added afterwards.
`router_serves_authenticated_mobile_update_check` builds the real `UpdateRoutes`
router against a temporary SQLite database with a fake `UpdateBackend`, then
asserts that the route is registered, that an anonymous
`GET /api/mobile-update/check?currentVersion=0.9.0` returns 401, that the same
request with a signed Bearer token returns 200, and that the payload reflects the
backend release (`currentVersion` 0.9.0, `latestVersion` 1.0.0, `hasUpdate` true,
signed APK asset and a wear asset). The focused run is 1 passed, 0 failed, 1878
filtered with a 1m31s test build; it needed a `tower` dev-dependency for the
`oneshot` router call. None of this issues a live GitHub request, wires update
activation or delivers a mobile build, so the update component stays partial and
no verification credit is awarded. The coverage ledger entry for
`packages/gateway/src/routes/update.ts` was corrected from `absent` to `partial`
to match the shipped four-endpoint implementation; verified coverage is unchanged
at 317 of 383.

Stale ledger corrections (2026-11-03): four inventory rows were still recorded as
`absent` although native modules exist. They are now recorded as
`implemented` — implemented but unverified — because each module is declared,
unit-tested and never constructed by runtime composition:

- `packages/gateway/src/ws.ts` → `src/ws.rs` (handshake, frame codec,
  fragmentation, envelope projection, hub subscriptions, authority
  revocation/rebinding, blocked-write interruption; 15 inline tests). No
  `/ws` upgrade route, no `WsHub::new` call outside the module, and the default
  token verifier denies every token.
- `packages/gateway/src/surfaces/remote-terminal.ts` →
  `src/surfaces/remote_terminal.rs` (Surface implementation over the control
  plane with prompt waiting and output relay; 10 inline tests including the
  prompt-waiter leak regression). Never referenced outside its own module.
- `packages/gateway/src/surfaces/browser.ts` → `src/surfaces/browser.rs`,
  `src/surfaces/browser_effect_runtime.rs`, `src/surfaces/playwright_bridge.rs`
  (driver trait, inspection/snapshot/diagnostics projections, effect-authority
  and supervisor seams; 22 inline tests in `browser.rs`, 5 in the effect runtime
  and 17 in the Playwright bridge). No registry entry and no construction
  from routes, runtime or tools, so activation stays disabled.
- `packages/gateway/src/os-control/windows-driver.ts` →
  `src/os_control/windows_driver.rs` (dockur driver models, structured errors,
  `SshTransport`/`DockerInspector` seams; 9 inline tests). Declared in
  `os_control/mod.rs` but built by no runtime factory.

Evidence and per-file gaps are recorded in
`.jait/artifacts/gateway-rust/coverage-audit/stale-absent-reclassification.json`.
Ledger totals are now 317 verified / 38 partial / 14 implemented / 14 absent of
383; nothing new was verified, and no component earns credit from a status
correction. The coverage audit script still reports zero verified entries with a
non-empty `remaining` and zero verified entries lacking contracts, targets or
`reviewed_at`.

Thread lifecycle evidence update (2026-11-04): the focused HTTP suite passed 10 tests including the activity cap and duplicate session parameters; the latter currently returns a generic 500 instead of the SQL details seen in a synthetic Fastify/Drizzle reproduction. A provider session identity check passed two focused tests, and a standalone thread event owner passed three integration tests. These are partial building blocks: real provider subscription, authorized runtime ownership, cancellation and join, deletion cleanup and event dispatch remain unwired. Split-surrogate checkpoint readback matches Bun, but stored SQLite bytes differ. No component was promoted or production readiness established.

2026-11-04 — Bound lifecycle integration: the local ThreadEventOwner now combines turn fencing with an opaque provider-session lease, persisted identity checking and transactional event mapping. Focused lifecycle integration passed 4/4 (.jait/artifacts/gateway-rust/thread-bound-lifecycle-focused.log; sha256 53cb9836093e7d0bb382b6db239a9545517480feba54dcdde0be96b3015ce8d7); bound subscription cleanup passed 1/1 (.jait/artifacts/gateway-rust/thread-bound-subscription-focused.log; sha256 ec0872d8b1759e1ae6731986888d6f5a2076c42b43223aa0ac2917b4d7b8c57f). Source and test hashes are recorded in native-coverage.json. This is not runtime integration: no native CliProviderAdapter implementation or remote transport was found, and authorized provider ownership, stop/interrupt, cancellation, join, delete cleanup and broadcast remain open. Actual TypeScript route probe confirms duplicate sessionId status 500; the inspected web client ignores the differing response body. Actual TypeScript checkpoint probe confirms split-surrogate raw SQLite bytes differ and native String reads may reject reference-written bytes. No component promoted. Ledger counts remain originals 325 verified / 43 partial / 2 implemented; additions 5 verified / 8 absent. Full frozen validation remains deferred.

2026-11-04 — Malformed thread SQLite TEXT read repair: thread and activity row mapping now decodes the reproduced Bun split-surrogate bytes with replacement characters. Focused Bun comparison and route mapping each passed 1/1; logs and source fingerprints are recorded in native-coverage.json. The test compares bytes transferred between in-memory databases, not a shared database; arbitrary malformed sequences and Rust raw-write parity remain open. The threads component remains partial, and provider runtime ownership, cancellation, join and cleanup remain unwired.

2026-11-04 — Candidate thread turn persistence: focused tests passed 2/2 for transactional owner/provider-session checks, bounds, corrupt or missing history and failed-insert rollback. Source, test and log fingerprints are recorded in native-coverage.json. Tests include the source directly against a fixture schema; no production module, table migration, history provisioning or provider integration exists. Supervised cancellation, admission, effects and cleanup remain open; no component was promoted.

2026-11-04 — UTF-8 SQLite checkpoint byte repair: split-surrogate summaries now preserve the Bun-compatible raw TEXT bytes and decoded readback. An always-run fixture and an explicitly selected Bun 1.3.10 differential each passed 1/1; logs and source hashes are recorded in native-coverage.json. The differential is ignored by default because it requires Bun. UTF-16 SQLite databases reject split-surrogate updates without modifying the row; arbitrary malformed bytes and other Bun/platform versions remain unverified. This supersedes the earlier raw-byte mismatch for the tested UTF-8 case only. Thread service and runtime integration remain partial; no component was promoted.

2026-11-04 — Candidate turn history schema: the unregistered store now includes transactional schema installation, identity/deletion cleanup and completeness checks. The worker reported 6/6 focused fixture tests; the source and test hashes and the worker evidence limitation are in native-coverage.json. No complete history can be inferred from existing TypeScript activity, so installation provisions no history heads. Provider composition, migration registration, session ownership, cancellation and deletion remain unwired; no component was promoted.

2026-11-04 — Thread provider integration review: the session turn manager and Jait provider currently require the concrete chat store. The candidate thread store is not registered; its schema installation is not part of the shared migration plan, and the existing migration coordinator does not wrap the entire plan in one transaction. Legacy activity cannot establish a complete provider transcript. A supervised store contract, safe history provisioning and exclusive writer ownership are prerequisites to connecting it; this review adds no component or runtime integration credit.

2026-11-04 supervised-store continuation: the candidate session manager now accepts an owned, authority-checking store with distinct chat and thread admission keys. Its focused manager suite passed 8/8; source and log hashes are recorded under the partial thread route in `native-coverage.json`. The thread store used there is a fixture: production provider composition, complete-history provisioning, cancellation/join, subscriptions and deletion cleanup remain unintegrated. The live thread route has changed since its recorded HTTP test snapshots, so those historical results do not verify the current source. No component was promoted.

On 2026-11-04 the candidate `JaitProvider::send_turn` was generalized to the supervised `SessionTurnStore` interface, retaining the existing manager identity checks and consent executor. Focused provider orchestration (4/4) and manager (8/8) checks are recorded with source and log hashes in `native-coverage.json` under the partial threads route. These checks do not demonstrate a live thread-backed provider turn, complete history provisioning, or runtime integration, and do not change component coverage or production readiness.

2026-11-04 admission and migration design review: TypeScript creates an idle thread before a separate provider start, so complete new native histories require a creation-time provenance marker and atomic later binding; existing activity does not prove complete history. The proposed transaction, writer fencing and focused acceptance cases are documented in `.jait/artifacts/gateway-rust/atomic-thread-admission-design.md` (SHA-256 `95a399505855961520300e26b5f946ac5676f9d8394ab168e1ed320a7d3e69a0`). This is design evidence only. TypeScript currently uses shared migration IDs 76 and 77 while the Rust plan ends at 75; reserving either ID for a native schema would collide. Atomic schema and marker installation, legacy-writer fencing, authenticated provider ownership and cleanup remain required before integration. No component was promoted and final frozen-source validation remains deferred.

2026-11-04 fresh admission candidate: an isolated, unregistered SQLite primitive creates an idle row with a provenance marker and atomically consumes it when binding a provider session and creating an empty history head. Five fixture tests passed, including identity and legacy rejection, rollback and competing starts; source, test and log hashes are recorded in `native-coverage.json`. The fixture does not establish production schema compatibility, authenticated admission, post-commit writer fencing or provider lifecycle integration. No component was promoted.

2026-11-04 provider shutdown drain: the provider waits for its private session manager's admitted storage work after active sessions settle. A focused regression holds detached storage past the ten-second cleanup deadline, checks that shutdown reports failure, then releases storage and checks that a later shutdown succeeds (1/1; `.jait/artifacts/gateway-rust/provider-shutdown/drain-deadline.log`, SHA-256 `65ae0fa3e9886c1becde093b1e2fdf55ddb488ac6174bb30066ff89d743754c0`). The test constructs the active-turn boundary directly; it does not establish full provider or thread runtime integration. The thread schema installer remains an isolated candidate requiring migration coordination and legacy-writer fencing. No component was promoted.

2026-11-04 candidate thread history integrity: capacity checks and appends now reject gaps even if the head count was changed to match the surviving rows. The focused fixture `gapped_history_with_matching_count_rejects_capacity_and_append` passed (1/1; `.jait/artifacts/gateway-rust/thread-turn-gapped-history.log`, SHA-256 `6bf19b6a9753cdddf1b3e57a600dcfedb2c7fbfdee547ffe4ac0a8df8646866b`; store SHA-256 `da527478db25d455551c128c50653b05b0dbfe1ef8fdb2dc55c0200de8e7aa52`; test SHA-256 `75034886f8367989fa647abba2c5ef01a222af57b87e7f9e6f973bb4a02cb91e`). The store remains unwired; this check does not fence concurrent legacy writers or provider effects. Inventory audit found 370 original paths (325 recorded verified, 43 partial, 2 implemented but unverified), plus 13 newer paths (5 recorded verified, 8 absent). Thirty-five recorded reference hashes differ from live sources, including 25 original paths recorded as verified; these are reconciliation flags, not refreshed verification. No component was promoted.

The isolated atomic admission experiment now revokes a fresh marker on thread
replacement and on activity insert, update, or deletion, including an activity
moved between thread IDs. With SQLite recursive triggers disabled, the focused
fixture suite passed all 6 tests, including replacement and change-then-restore:
`.jait/artifacts/gateway-rust/atomic-admission-replacement.log` (SHA-256
`673bf8f601a6343932e5ac84162901e4aca309e64b4a896de36453f617ce0dbf`).
The tested admission source SHA-256 is
`92d67134c61e516b74a0d7634a84a8ef4e51e76d2b02ae3e17b2cb9f73a7d1a5` and test source
SHA-256 is `b4f4e35b517628239790772cb7823cc94cf72ece1722dd5fa6c1c5b3d186126b`.
This fixture does not establish post-admission writer fencing, authenticated
runtime ownership, migration compatibility, or safety of already-started effects.
No component coverage is promoted by this evidence.

A separate, unwired revocation experiment detects conflicting thread and activity
writes after a history head exists, including SQLite replacement, moved activity,
transaction rollback and attempted readmission. Six fixture tests passed; see
`.jait/artifacts/gateway-rust/thread-revocation/candidate-tests.log` (SHA-256
`76d9c6d2b6e020ce001f7e7d8d45069dd42d69f9034f3a6a90a9d922acc6c096`).
The candidate source SHA-256 is
`6d35848cb26a84675d7a279c72399955dc2700d5130ff9a7c7f70c69a727e89e`; test source
SHA-256 is `c44a0cc6501d73f952dca19759dc50f1c4e24d577a2bd57f05e800b2115963e2`.
Its head triggers cause the existing strict v1 installer retry to fail, as a
focused test confirms. Do not install the candidate on a v1 database; a reviewed
versioned migration is required. The experiment also does not fence in-flight
provider effects or prevent a privileged writer from changing its schema or
markers. It revokes on benign updates and is not production integration.

A read-only sample of reference drift found substantive decision error and
cancellation changes, and later database migration and schema changes including
migration 77. Existing Rust decision logic has corresponding pieces, but focused
comparison against the live TypeScript contract is still required. Recorded
database reference hashes also precede the current Git baseline, so the full
drift needs reconciliation. These findings do not change coverage status.

The admission experiment subsequently added an atomic pre-creation check for
orphan activities, heads and events, and revokes freshness for the existing
activity identity on an update that replaces another activity. Seven fixture
tests passed, including rejection of an orphan activity; evidence is
`.jait/artifacts/gateway-rust/atomic-admission-orphan.log` (SHA-256
`e55d6ef0bfa2fa7fad05baa38b058003d98e1ff428a88caca2a48e8c3f1e88d6`),
with admission source SHA-256 `4bed521f01d8953b98b054d882221c2be40cace761b0e4e90b553ab28582a420`
and test SHA-256 `86cc2c57e4181277c35d83dc82fa93c76674c80e0c7d3ad025118f8731cc416e`.
The earlier six-test evidence describes an earlier source snapshot, not this one.
This is still isolated and does not establish runtime ownership or fence effects.

A source-level decision contract comparison found potential differences in the
error returned for null questions or non-string IDs, and in whether an unconfigured
service is reported before invalid state. These observations need focused
cross-runtime checks and a compatibility decision before updating coverage evidence.

An isolated coordinated v1-to-revocation upgrade experiment verifies the real
v1 installer before upgrading, uses a savepoint, and checks the exact upgraded
owned schema and v1 marker on retry. Five focused fixture tests passed, including
installation, retry, schema tampering and rollback; see
`.jait/artifacts/gateway-rust/thread-revocation/upgrade-tests.log` (SHA-256
`882ce02d3d5e728ee4c28eeb2404160409c0cac949d55a551993496527e74cec`).
The tested upgrade source SHA-256 is
`8e944227954e6321ee56bd584a20a7b2fa4545480d94eadbc02cf8950db85be5` and
test SHA-256 is `6cbf220fb7ba75670d33bbb22b6abf76952309c221006fe9a9d7150b94f917c9`.
The revocation candidate source has since received a comment-only change; its
current SHA-256 is `488c5ffc2a4025db4e8ab76bc846a896db4369a7656c3c3fa18a3d51c1678dea`.
The original v1 verifier still rejects an upgraded database; startup coordination,
concurrent migrations, legacy coexistence, runtime ownership and effect fencing
remain unproved. The experiment is not wired into startup or production.

The coordinated upgrade fixture now includes two-connection contention and
legacy startup checks. Seven tests passed in
`.jait/artifacts/gateway-rust/thread-revocation/upgrade-contention-tests.log`
(SHA-256 `1a6ce8525e75df3a216be82d2a660b34ac97b17d84b2dc2053da74882b6bacb8`),
using upgrade source SHA-256 `8e944227954e6321ee56bd584a20a7b2fa4545480d94eadbc02cf8950db85be5`
and test source SHA-256 `f29bf6917d553f141eb292e5b538e727dee17634e6b4c9988ac5fae7668133d7`.
A held legacy write prevents the upgrade without leaving partial objects; the
old installer rejects the committed upgraded schema. These are shared-memory
SQLite fixtures, not evidence of process startup coordination or WAL behavior.

Before runtime integration, a migration protocol must coordinate old and new
starters and writers, and fail closed if any participant cannot honor the
schema and ownership protocol. The current store checks owner and session in
its database transactions but does not consult the isolated revocation candidate.
A future effect authority must be constructed from authenticated server state,
bound to the current owner, session, turn and action, and rechecked at the
actual effect boundary with cancellation and consent. A prior database check
cannot retract an effect already issued to an external system; draining,
cancellation and ambiguous outcomes require explicit handling. These are
integration requirements, not guarantees provided by the fixture experiments.

A focused live TypeScript comparison confirmed malformed question and missing
state error precedence and pre-aborted cancellation. The Rust decision tool now
matches those selected cases; its three focused tests passed. TypeScript output
is `.jait/artifacts/gateway-rust/decision-drift/typescript-malformed.jsonl`
(SHA-256 `15d93b8c707012f2cf262848625ae7407bd2c2bd52711a4085eb2c970c362e70`),
and the Rust log is `.jait/artifacts/gateway-rust/decision-drift/rust-focused.log`
(SHA-256 `d1a6a1559422934dcbf66a325070bd86455897aad54ac70cae375d3d3ce33396`).
The tested Rust source SHA-256 is `bb17c1ef7b33b83f919614338498c67a9d51840f86f60fe93fd1ffcbee5adfc9`;
the TypeScript tool and service hashes are respectively
`eecb5e7e5d3d97f787e5a3953dcdc27301a1e459fa6dd4a25073bc2242ebc239` and
`2f0e2c69ade681b2eef1205db853bf88c2a47c46ecec11f809d25fa2b9520884`.
These selected cases do not establish complete structured-error parity and do
not promote component coverage.

The native migration plan now includes the live TypeScript migrations 76
(`browser_workflows`) and 77 (`github_intake_observation`). A source comparison
matched their names and all nine SQL statements. An in-memory upgrade from a
recorded version 75 passed, including retry, existing row preservation, table
creation and both new unique constraints. The focused Cargo log is
`.jait/artifacts/gateway-rust/migration-76-77/focused.log` (SHA-256
`9c0807af7b4f0760c4105cd824103aea6ad192f44fc5c9ff96256fa14432a1af`);
the tested plan SHA-256 is `9de78666704144508944f78aa711a14c6c7e58eeed304ee42c5a9b1b081a19b3`,
the test SHA-256 is `d3167282854e47314dfef876ad8414f9c5ff0c59a42a35f5f786bda1c6d7f009`,
and the compared TypeScript source SHA-256 is
`7292f264b29566edbe8dae1862fef4a93ba4b9d349a25ad7f86b94cb6158943d`.
This focused upgrade does not establish full database drift parity or startup
coordination, and no component coverage is promoted by it.

The migration and schema ledger entries have been downgraded from verified to
partial because their recorded TypeScript reference hashes predate live source
changes. The storage contract now allows prefixes 0 through 77 and expects the
current schema version 77; the expanded full prefix differential has not been
run. The historical 0 through 75 result remains evidence for its earlier source
snapshot, not verification of the current declarations or migration plan.
The focused migration failure and idempotent repair contract passed at version
77 (1 test; `.jait/artifacts/gateway-rust/migration-76-77/contract-repair-focused.log`,
SHA-256 `e25b05910d0a19c1f276ff9e8ac06a501005745d0a077f907d2389cfa3d2d41e`).
The contract test source SHA-256 is `f03da04cb7b408e2a6fe370bd5998d4e792bd8f90f195f9c2876af6960a5e194`;
the updated TypeScript driver SHA-256 is
`1a2c0595f084f87ad0ef38cf7942656cfc622fefce81c3b54c25c4b6c8feb3db`.


A focused live Drizzle metadata comparison for the four browser workflow and
GitHub intake tables passed (1 test, 2026-11-04). It compares column and index
metadata against the Rust declarations and checks that all four exist on both
sides. The evidence log is `.jait/artifacts/gateway-rust/migration-76-77/schema-new-tables-focused.log`
(SHA-256 `af5bd3dc813daf1b8a5757597e2c8a640a42c6deef4952f133d44ccfbb7259e5`).
The test SHA-256 is `b353c7b9d16cb8f0dea67924453f6caf240a2aa942a279f014b811db5f2c8076`,
Rust schema SHA-256 is `6faa8e93d0006b4ddcf5f430e88a113f87397a6853c2fc4ae779cf0beebe84c6`,
and TypeScript schema SHA-256 is `c68ec502ec21191dd5f2deeeded69145c23fe65e8b55eb8a107b6a7eedc60fa6`.
This narrow result does not verify the complete schema or migration component;
the full differential remains deferred until integration.


The channel manager draft is now compiled as an internal module, but has no
live runtime callers. Its inbound empty-message check, command parser and consent
parser use JavaScript whitespace semantics; the focused command-parser regression
passed 1/1. Evidence: `.jait/artifacts/gateway-rust/channel-manager/command-whitespace-focused.log`
(SHA-256 `c98b8a8d645db80f268b2bf0163cac4aa287f149d335e66c0751154d80ad088c`);
the draft SHA-256 is `ab9c4a31dc5fc362ac085dbf5d34fe64669549855a304da5099a80f3e20972f6`
and module declaration SHA-256 is `cfb91c765eb9e269dd8d0fce14e4bed00c797b7f14f8a89bbbf02c0e2e5846f6`.
The manager remains partial: authority, consent, connector lifecycle, runtime
composition and complete compatibility require review and integration.


The internal session-bound consent claim now rejects requests after their
monotonic timer deadline even if timer dispatch is delayed. The focused
single-thread runtime regression passed 1/1: it blocks timer dispatch until
after the deadline, confirms the claim is refused, and observes timeout
settlement. Evidence: `.jait/artifacts/gateway-rust/channel-manager/consent-deadline-focused.log`
(SHA-256 `6d8df9a84d8a3a7525377a3d0076c4e04ce903762fd1d0260eaf38afdbf414e3`);
`src/security/consent_manager.rs` SHA-256 is `bb54963ca20c17b0092bc2cb9112b8b398927edfd15b3826630b537b11ccb0b6`
and `src/channels/consent_claim_tests.rs` SHA-256 is `3469e90caa134926be6e2dc1634d3bb3e1efed0f1048d507be8e28d01b5236b0`.
This deliberately fails closed when the timer is late, unlike TypeScript's
queue-presence decision; client compatibility evidence is still required before
runtime adoption. The internal claim does not authenticate the caller or
synchronize authority revocation, and the channel manager remains unintegrated.


Route snapshots now bind to the registry that created them. A focused
consent-claim regression passed 1/1: matching session, target and generation
in a second registry cannot claim the first registry's pending decision; the
local snapshot still succeeds. Evidence: `.jait/artifacts/gateway-rust/channel-manager/consent-registry-focused.log`
(SHA-256 `128949ae3c933e9c1f30161a1c545944809f1ca1f7072166d80dab6c7c94ac8b`).
Route source SHA-256 is `9bcd4ac798be165c7e3804a4c13191973b22accf8c5e1b866293ea6158d4bc08`;
updated claim test source SHA-256 is `009522b439f407db7ca53d072265b19f00f12223ad0e8990960406de929ae342`
(superseding the earlier test-file fingerprint). This internal guard is not
authentication, revocation synchronization or runtime integration; coverage
status remains partial.


2026-11-04 — Consent event delivery now reconciles a resolved event against
the owning manager before forwarding it, refusing provisional, missing or
mismatched decisions. The focused provisional-claim test passed 1/1
(`.jait/artifacts/gateway-rust/channel-manager/consent-provisional-focused.log`,
SHA-256 `aca7b51c18980b6a15d56e0bce80d06916ea57e32189b7e2f27bd38eb2e50748`);
the ownership and recovery tests passed 6/6
(`.jait/artifacts/gateway-rust/channel-manager/consent-owned-route-focused.log`,
SHA-256 `48413761814e9dbf8a4875e85b821d64c27955005d466cdb74455bc98f95e419`).
Route source SHA-256 is `e5e16d037e70139bbff76e014c4119c3044a1a4bf6ca4e525c4daddc24e3f98e`
and the revised claim-test source is `c9a9937ea805aaab697a920fc79f3fe0eef68638730ebf9c3c5c5d5757400bea`.
This is an internal API and ordering change: retry/wakeup behavior and client
compatibility still need integration review. The consent HTTP component is now
partial pending current-source contract evidence. Original inventory: 322
recorded verified, 46 partial, 2 implemented but unverified; 13 newer paths
remain separate (5 recorded verified, 8 absent). Runtime integration and final
frozen-source gates remain outstanding. No verification credit was promoted.

Consent finalization recovery update: the internal decision finalizer now emits `SnapshotRequired` after decrementing the in-flight transition count, on success as well as failure. Session claims no longer emit the earlier premature notification. Regular decisions therefore gain a recovery notification after their provisional resolved event; this is a deliberate internal ordering change requiring client compatibility evidence and retry integration before runtime use. Other concurrent transitions can still keep recovery closed, and failed transitions remain unrecoverable. No runtime parity or component verification is claimed.

Focused actual-crate checks passed: `regular_decision_wakes_recovery_after_finalization` (1/1; log `.jait/artifacts/gateway-rust/channel-manager/consent-finalization-wakeup-focused.log`, SHA-256 `587782322a8262d24f7636a0e5c3e2144f2ee43cfd0c7a141f8e6f7328864bb3`) and `provisional_resolved_event_requires_finalization_before_delivery` (1/1; log `.jait/artifacts/gateway-rust/channel-manager/consent-provisional-wakeup-focused.log`, SHA-256 `f5e85bd2093eefd1351906e20b4c0d8f49b6b87e7a64c704ee02cdc3aca240`). Tested consent manager source SHA-256 `620f2bef0c2c20d16b533a6a6653c1a1775514ee29f7a9e8918ebdc6bdd75d4a`; channel test source `a19f679785aaf2457f7993c2df711fe62926d811d2c09b2eea15d14e29db3a91`. Route source after a documentation-only update is `408696da927aeebd6d5090451b989b2874b4310ecce6409532ced003e7b2ddb3`. These hashes supersede the earlier hashes for these files.

Client recovery ordering evidence (2026-11-04): `apps/web/src/lib/pending-approvals.test.ts` exercises an older `consent.required` replayed after a resolved event and empty snapshot: it recreates stale pending state until a subsequent snapshot. The focused Vitest file passed 4/4; log `.jait/artifacts/gateway-rust/channel-manager/client-recovery-order-focused.log` SHA-256 `4c97dbc1c0d52166b432f955fe147869377e3acbc3edcd36df0bc4ab0606de55`; test source SHA-256 `6ee64a5824d603f11b8199cfd56802cf7988f88344fcfdd598a88943e6331ccd`. Separately, inspection of `apps/web/src/components/consent/action-card.tsx` (SHA-256 `8d3d1817678675ce3130163d0bddf78da52ee8b45581322afc9b173569ee4326`) shows it handles required and resolved events but not pending snapshots; it refreshes via HTTP on connection. This is evidence of a compatibility constraint, not an end-to-end recovery validation: runtime integration must serialize recovery and suppress stale replay, and account for the action card before adoption. No component coverage is promoted.

Internal stale-required guard (2026-11-04): `filter_owned_event` now reconciles owned required events and requires a matching pending ID and session; a resolved, missing, or in-flight transition triggers recovery instead of replaying a stale requirement. Focused actual-crate test `live_events_recheck_ownership_and_fail_closed` passed 1/1, covering pending delivery, stale rejection, and ownership checks. Source SHA-256 `04f5191e11de1272bbf614bfdbf7bcf8a6ad9596f5e4206c24b5acde25cdcb1a`; log `.jait/artifacts/gateway-rust/channel-manager/consent-stale-required-focused.log` SHA-256 `74eb85469a7a7fa0c8ae1b6244027074bc9deda3ec9c443c245e3b26b8ec3fb1`. This internal filter has no runtime caller; a state change can occur after its check, so serialized recovery/delivery, action-card compatibility, and authenticated authority remain required. This is an intentional ordering/recovery change and is not evidence of end-to-end compatibility. No coverage credit promoted.


Consent payload check (2026-11-04): the internal owned-event filter now compares the entire queued required payload with the current pending request, requesting recovery on mismatch. The focused `live_events_recheck_ownership_and_fail_closed` regression passed 1/1 with an altered summary, valid pending delivery, stale rejection and ownership checks. Tested route SHA-256 `731808fb3fe4ab2e0fc8cfcd511be381f2aae737e5bbaaff227ce273b1a6f72a`; log `.jait/artifacts/gateway-rust/channel-manager/consent-payload-focused.log` SHA-256 `716c03b9651af26a9da55ca0b09f752c852ee0278735dce88dd9dc9f696f5d8e`. This internal helper has no runtime caller; the separate check-to-delivery and ownership-revocation races remain open, as do client compatibility, serialized recovery and authenticated integration. No coverage credit promoted.

Consent authority and persistence checkpoint (2026-11-04): the current ledger
records 322 verified, 46 partial, and 2 implemented but unverified original
components; the 13 newer inventory entries are tracked separately (5 verified,
8 absent). These counts are component evidence, not runtime integration or
production readiness. Live-source drift remains to be reconciled.

The internal HTTP consent route still observes ownership separately from its
mutation. Diagnostics reproduce revocation between observation and mutation
(`.jait/artifacts/gateway-rust/channel-manager/consent-revocation-diagnostic.log`
and `consent-revocation-clear-diagnostic.log`). Override transitions now reject
concurrent or reentrant operations on one manager, persist enables before making
them effective, and return persistence errors to the route. A failed clear removes
the live override but can still reappear after restart; the caller receives an
error and durable repair remains necessary. Coordination across independent
manager instances sharing a store is not established. This changes failure and
contention behavior and requires client compatibility and host integration evidence.
Earlier controlled-store logs document the pre-change ordering defect and the
still-open durable-clear failure. The batch-claim and finalization helpers have no
runtime callers. Host-backed revocation, durable failure recovery, serialized
recovery and client compatibility remain required before adoption. TypeScript
remains production; no component verification credit is promoted here. Focused actual-crate tests `concurrent_override_transition_is_rejected_and_can_be_retried`, `failed_override_clear_can_reappear_after_restart`, and `persistence_failures_do_not_override_in_memory_consent` each passed 1/1. The latter two confirm error handling and the remaining restart defect; they do not establish durable recovery. Additional actual-crate focused tests `reentrant_override_persistence_is_rejected_without_deadlock` and `failed_override_enable_does_not_approve_pending_requests` passed 1/1 each. The first exercises a reentrant store callback; the second calls the internal route method and checks that a failed write leaves the request pending with no approval audit. It does not exercise authenticated HTTP. Tested manager SHA-256 `7c5eee6519c596b2c566e4756ef35edd57fda108988c05eefb8b94ba382e427f`; route SHA-256 `89adc0055dbe8467cdcc957fdb5582b6bde343463b23dbff50831014e8fec85b`. `ControlAccess::session` exposes an ownership lookup, not a lease synchronized with revocation; the native consent route has no production runtime construction in the current source.

Consent clear retry check (2026-11-04): focused actual-crate test `failed_override_clear_can_be_retried_after_storage_recovers` passed 1/1. With a controlled store, a failed clear disables the live manager but leaves the durable value enabled; an explicit retry after storage recovers clears the durable value and a newly constructed manager loads it disabled. This does not close the unsafe restart window before retry, coordinate separate managers, or supply host-backed revocation. Tested manager SHA-256 `f0d9fe8b19f4149b7b1409c15ad76b770a89abb9bb90a60ee9f8f69c89378025`; the earlier manager hash above identifies the earlier test snapshot. No component coverage credit was promoted.

Consent clear retry guard (2026-11-04): the manager now remembers a failed clear in memory and rejects a subsequent enable for that session until the clear is retried successfully. The actual-crate `failed_override_clear_can_be_retried_after_storage_recovers` test passed 1/1, including rejection before and after store recovery, successful retry, disabled state on reconstruction, and a later explicit enable. Tested manager SHA-256 `052e495897e0b5fe25404beb57d262216d8854614bf26ce6f108e7f8604d3567`. This is an intentional error/ordering change requiring client compatibility evidence. The pending-clear marker is in memory only; it does not protect restart before retry or coordinate independently constructed managers. Host-backed ownership, durable recovery, authenticated integration, and final validation remain open; no component coverage credit was promoted.

Consent shared-authority diagnostic (2026-11-04): `independent_manager_retains_override_after_successful_clear_diagnostic` passed 1/1 against manager SHA-256 `28bc25d60ad42878dda3634a1d5305aae1b6a4c591bb52cf3fd9e5cca3335721`. It demonstrates that, even after a successful store clear, a separately constructed manager retains its previously hydrated enabled override. This diagnostic confirms a defect; it does not establish shared authority or grant coverage credit. A durable failed-clear record cannot be guaranteed when all writes to that store fail; restart safety needs a fail-closed recovery policy or independent reliable authority, with compatibility evidence.

Shared override authority (2026-11-04): an opt-in `SharedOverrideAuthority` shares override state and rejects overlapping transitions for managers supplied the same authority. It starts with no restored approvals, so even an enabled row left by a failed clear is not activated on authority reconstruction; fresh enable is required. This is an intentional recovery compatibility change requiring client evidence. The legacy constructor still hydrates independently and can bypass this authority; the host does not yet enforce a single authority or synchronize ownership revocation, and the consent route remains unmounted. Do not treat this API as production integration or component coverage evidence.

Shared-authority concurrency evidence (2026-11-04): `shared_authority_rejects_cross_manager_overlap_and_reentry` passed 1/1 against manager SHA-256 `dcde082c7aea5f6216ceab640f09128aa3a071466bac98e2b68372e020777786`. With two participating managers, a persistence callback reentering a clear and a concurrent clear both fail while enable is in flight; a subsequent clear succeeds. This does not establish host ownership synchronization, independently constructed authority coordination, or authenticated runtime integration.

Ownership lease claim adapter (2026-11-04): `claim_owned_consent` prepares the clock before acquiring a host-supplied ownership lease, claims only the matching session under that lease, and releases it before claim finalization. `owned_claim_requires_host_lease_and_releases_before_callback` passed 1/1 with a mock host, covering unauthorized and revoked users and callback lock release. Tested source SHA-256: control_access.rs `6c715c4d7a7300008f40497a2c1b09c75af5faec884b85aee53366e8df312f45`; consent_manager.rs `e960b1363662656fef08bffdeb12958d58e88280d33a546d53fcdb04c7f418a6`. This internal adapter is not wired to a host or route: its contract requires every ownership revocation to synchronize on the same lease. It does not secure bulk approvals or overrides and confers no component coverage credit.

Batch lease adapter (2026-11-04): `claim_owned_consent_batch` applies the same host lease to bounded, session-scoped claims and releases it before finalization. `owned_batch_claim_requires_lease_and_releases_before_callbacks` passed 1/1 with a mock host, covering denied and revoked ownership, the limit, session isolation, and callback lock release. Tested source SHA-256: control_access.rs `48510db1a41f9e46945526347167a4a24fe52e436d249b6ddd20e6228a6d571a`; consent_manager.rs `4c856fb0429f2cc884e83df8d674920ac186af9e0fd29aed4aee2d24a26450c6`. This internal adapter is not wired to a host or route, does not secure override operations, and does not establish synchronization with real host revocations. No coverage credit is claimed.



The focused actual-crate test `shared_override_authority_fails_closed_on_restart_and_coordinates_managers` passed 1/1 on manager SHA-256 `3c4bf6740ef15fe9c0d2ba6510012dc536670ebba539ccd6748f7ee8f7f88624`. It checks two participating managers, successful clear, failed clear, rejected re-enable, and fresh authority construction with an enabled stored row. It does not cover host ownership, mixed legacy constructors, cross-process coordination, or authenticated runtime behavior.

SQLite ownership lease (2026-11-04): `SqliteConsentOwnership` acquires an immediate SQLite transaction before checking the session owner, allowing the internal single and batch claim adapters to hold a database write reservation through the claim. `sqlite_ownership_lease_serializes_other_connection_revocation` passed 1/1 on control_access.rs SHA-256 `81ed39b256229f14dbb100e709139419fe9eaf01270e667d2e34146c`: a second connection could not change ownership while leased, then succeeded after release, and the prior owner was rejected. This test uses shared in-memory SQLite; the authority is not wired to the runtime or authenticated routes, and only protects ownership writers using the same SQLite database. Persistence and callbacks must run after release. Override operations, shared override authority enforcement, restart/client compatibility, and integration remain open; no component coverage credit is claimed.

Thread ownership lease fallback (2026-11-04): the internal SQLite consent lease checks both `sessions` and `agent_threads` under the same immediate transaction, matching `ControlAccess::session`'s ownership fallback when both tables and all revocations use that database. `cargo test --manifest-path packages/gateway-rust/Cargo.toml --lib sqlite_ownership_tests` passed 2/2, including a two-connection thread revocation test and a colliding session ID with another owner. Tested `control_access.rs` SHA-256 `80877b237ca1b0c9e2d08e9c212c760e8dbb53583ec3108a6572afe3315ce924`. This is an unmounted primitive tested with shared in-memory SQLite; it does not establish real host authority, authenticated routing, override synchronization, or client compatibility. No component coverage is promoted.

Supervised single consent decision candidate (2026-11-04): an internal adapter reserves a blocking lane before dispatching an ownership-leased claim to a supplied `DatabaseWorker`; it prepares the clock and finalizes the claim outside the database worker and transaction. Its admitted blocking work continues after the caller disconnects. Focused actual-crate test `supervised_claim_releases_sqlite_before_callback_and_survives_disconnect` passed 1/1 using a real worker and shared in-memory SQLite: a foreign user was denied, a callback changed ownership on a second connection, the decision completed after caller cancellation, and the former owner was denied afterward. Tested `control_access.rs` SHA-256 `843c9abbaccb1731011fc385bca273e725075f37ac9eff53f488da012e92bee9`. This candidate is unmounted and does not authenticate, provide audit or persistence, implement batch decisions, test the real application host, or synchronize overrides. Both ownership tables and all revocations must use the supplied worker's database. No component coverage is promoted.

Independent audit found that shared override authority starts empty on restart while persisted enables remain; TypeScript or a default Rust manager could restore a stale enable on rollback. Client mutation error handling and effect-boundary revocation also require compatibility work before route activation. The host must drain admitted consent work before closing its database and enforce one authority throughout its executor and routes.

Supervised admission regression (2026-11-04): `supervised_claim_rejects_overload_and_shutdown_before_claim` passed 1/1 on `control_access.rs` SHA-256 `70acaf1b0d471dd806efff936ba997d674da7e048752a15c32a28ca9165ece36`. A full lane, stopped database worker, and closed lane each returned an error with the consent request still pending. This does not test cancellation while a database job is queued: once lane admission occurs, the detached operation may still claim after caller cancellation. The host must drain that lane before database shutdown; callbacks must not synchronously drain their own lane. Batch claim limits bound claims, not queue traversal under the SQLite lease. Revocation after claim does not revoke the eventual callback. Persistence errors, effect authority, compatibility and runtime integration remain unresolved; no coverage credit is claimed.

Leased batch interim bounds (2026-11-04): the internal batch claim rejects limits above 128 and rejects when the global pending queue exceeds 4096 before making any claims. This caps the number of `Vec` entries traversed and shifted under the lease; it is not a wall-clock or payload-size bound. `leased_batch_limits_reject_without_claiming` and `owned_batch_claim_requires_lease_and_releases_before_callbacks` each passed 1/1 on consent_manager.rs SHA-256 `6668e740614eee50eeea984e072d72f74d838a08663b0610ec4f96384d033c20` and control_access.rs SHA-256 `70acaf1b0d471dd806efff936ba997d674da7e048752a15c32a28ca9165ece36`. A large queue in any session can deny batch claims for all sessions; indexed per-session storage and client overload/retry compatibility remain necessary before mounting. The single-claim path still performs a global scan and shift. No coverage is promoted.

Bulk consent compatibility review (2026-11-04): the TypeScript session bulk route enables future session-wide approval and returns the IDs it approved; its notification bulk route approves current pending requests without enabling that override (`packages/gateway/src/routes/consent.ts`). The web consent queue removes every request for the session when the response contains no request IDs (`apps/web/src/components/consent/action-card.tsx`). A bounded partial or empty response cannot be substituted safely without defining continuation, error and reconciliation behavior and updating/testing that client. These are source observations, not end-to-end compatibility evidence; the native candidate remains unmounted and no coverage is promoted.

Indexed consent pending candidate (2026-11-04): pending requests now use sequence-ordered storage with ID and per-session indexes, replacing the global Vec scan and shifts on individual claims and removals. The internal leased batch scans at most 128 entries from the selected session and retains a cursor over expired entries; an exhausted scan with no claim returns a retry-required error, and a batch can be partial. Focused actual-crate `batch_claim` tests passed 3/3 and `indexed_` tests passed 2/2, covering global/session order, cancellation and timeout removal, session isolation, and retry past expired entries to a live request. A documentation-only edit followed the tests; current `consent_manager.rs` SHA-256 is `d8a70dd959662d7eebf634ca0810f7556f4b2b07e33efb18218ad711e1014f87`. The scan bounds entries, not payload bytes, lock waits or execution time. Partial/retry semantics and the web client's empty-ID behavior need an explicit compatible protocol and client tests; authenticated host authority, persistence and effect-boundary revocation remain unresolved. This is an unmounted candidate; no original component coverage is promoted.


Current inventory reconciliation (2026-11-05): `native-coverage.json` records 319 verified, 49 partial, and 2 implemented but unverified among the original 370 paths. The 13 newer paths remain separate: 5 recorded verified, 7 implemented but unverified, and 1 deliberately unported.
No original path is unported. These are ledger statuses, not a fresh source-bound validation; existing fingerprints and runtime integration require reconciliation. The preview HTTP route remains partial: a typed history route draft exists but lacks a mounted host and complete live contract evidence. The interrupted janitor and preview workers did not produce a completed result; their work remains subject to review, and no additional verification is claimed. Final frozen-source validation, platform and replacement gates remain open; production remains TypeScript.

Portability wave for seven previously absent newer paths (2026-11-05): native ports now
exist for `voice/wake-candidate.ts` → `src/voice/wake_candidate.rs`,
`voice-assistant/router.ts` → `src/voice_assistant/router.rs`,
`voice-assistant/tier-catalog.ts` → `src/voice_assistant/tier_catalog.rs`,
`providers/session-idle.ts` → `src/providers/session_idle.rs`,
`providers/session-process.ts` → `src/providers/session_process.rs`,
`services/screen-share-control.ts` → `src/services/screen_share_control.rs` and
`tools/browser-handoff.ts` → `src/tools/browser_handoff.rs`. Focused actual-crate runs
reported no failures: 22, 21, 26, 9, 13, 39 and 19 tests respectively (evidence
`.jait/artifacts/gateway-rust/preview-history/ports-focused-batch.log` and
`browser-handoff-focused-4.log`). None of these modules is referenced by a contract
target, a route mount or the application composition, and `browser_handoff` still needs a
supervised Playwright transport before it can relinquish or resume a live session, so all
seven remain implemented but unverified and no component credit is claimed.
`surfaces/browser-cursor.cjs` stays unported: it is page-context cursor rendering (DOM
mutation, pointer capture, `requestAnimationFrame`) with no server-side analogue, so any
native claim would require both the missing browser transport and a client-side effect
surface. `src/providers/session_idle.rs` and `src/providers/session_process.rs` reuse the
existing `Clock`, `text` and jait-models helpers rather than duplicating them.


Preview history route slice (2026-11-05): the interrupted worker’s typed history adapter dispatches back/forward through the explicit backend. Focused actual-crate `history_route_validates_and_enforces_session_ownership` passed 1/1, covering authenticated ownership, both directions, invalid and extra fields, and response shape. Evidence: `.jait/artifacts/gateway-rust/preview-history/route-focused.log` (SHA-256 `268000dfb1e43f6bfe9be38db02ce04a4c4896e9bb7a7459bcaf575a5a8031db`); tested route SHA-256 `4e9e7ce8d17940c2a2cde86374cf38df3d783fc9a409bfb0cfc978f7494437da`, test source `b72dcce101918f9b610f1c6a63fa3e62525c322a5c8ffd28666ea325c951982d`. The host is unmounted; the later history-error slice below adds a classified message path, while generic failure behavior, missing-browser, cancellation and live-client contract evidence remain open. The route stays partial; no coverage is promoted.


Preview history error slice (2026-11-05): the unmounted adapter can return a
host-approved history error message with HTTP 400; other operations do not expose
that message, and serialized error bodies are bounded. The actual-crate focused
`history_error_messages_are_scoped_and_bounded` test passed 1/1. Evidence:
`.jait/artifacts/gateway-rust/preview-history/history-error-focused.log` SHA-256
`798f38d742c61bd6620dad199cd9346ee8f1d6dd3f635918f3d36b77620994a2`,
`preview.rs` SHA-256 `360f32bf4697460c4ad770e218abae25210027866051ee598f0bf99a573ab4e2`,
and `preview_tests.rs` SHA-256 `19b3e257aff75a8a26283ddedc10f3511f09b0833d4d06569884363c8af15b47`.
This is an explicit host classification, not full TypeScript parity: the host
must prevent sensitive diagnostics from reaching the owner, and generic errors,
missing-browser behavior, live integration and cancellation still require contract
evidence. The adapter remains unmounted and the coverage ledger stays partial.

Preview response bound (2026-11-05): successful preview responses now apply the
2 MiB limit to the serialized JSON envelope as well as its value. The focused
`successful_response_limit_includes_json_envelope` actual-crate regression passed
1/1 at the exact boundary and one byte above it. Evidence:
`.jait/artifacts/gateway-rust/preview-history/response-envelope-focused.log`
SHA-256 `dcf6a3c90b1dc8586fdad43696678f86ce7932be9d2b9902c203dd44e511a17c`;
tested `preview.rs` SHA-256 `79ca74faa90a5c29bfc0148dfe20af23ab519b8ed6183e5a1f981ac2c3ef717e`
and `preview_tests.rs` SHA-256 `3226c3a9a6e9b9dad8e9fdfd8b26477675e33fdccfd6fa89dbbac44582e7ac13`.
This deliberate response bound is not evidence of live host integration or full
TypeScript compatibility; the component remains partial and unmounted.

Preview navigation errors (2026-11-05): the unmounted adapter now accepts
host-approved, operation-specific navigate and reload messages, rejects them for
other operations, bounds their serialized responses, and uses the corresponding
TypeScript generic failure wording. The actual-crate focused navigation regression
passed 1/1 and the history error regression passed 1/1 after sharing the serializer.
Evidence: `.jait/artifacts/gateway-rust/preview-history/navigation-errors-focused.log`
SHA-256 `e7006bae78813a9fd818eabedc618709c7fd44e6c2398afdc8ff9ee6accb4a4b` and
`history-error-after-refactor.log` SHA-256 `c4dd8aa54ef63950493dd5e0a46e425334f5962eeb129bc8ec517a5e5eec6a2a`;
tested route SHA-256 `2925ecf21b565aa52417c5b123c51d169ea915a552e272e11f45c0eaed537e27`,
test source `dbade0bb2ca923aad486caead25ed76485e0ea60de223c2c2343256abcdcc973`.
The host must classify safe messages and enforce effect authority and cancellation;
no live host integration or coverage promotion is claimed.

Preview cancellation boundary (2026-11-05): the focused actual-crate test
`dropped_request_drops_host_future_and_releases_route_permit` passed 1/1. It
confirms that request abort drops the backend future and releases the route's
permit; it does not demonstrate cleanup of independently spawned effects. A host
must supervise those effects and retain its own capacity until cleanup is confirmed.
The existing host draft is unregistered and requires a supervisor and authorized
runtime integration. Evidence: `.jait/artifacts/gateway-rust/preview-history/drop-lifecycle-focused.log`
SHA-256 `e4b028535cd781dd40a759a3ac20d93d1a2dee0bb0f8aa2fe1bc2833024b445d`;
tested route SHA-256 `649cc1f3047a08362da1a3c7b0b1a0d0b6724d71d866d3f957d3067bc372034b`,
test source `9808c069abd13a724eb5cd4f335db809a7cb5e0ecaa88d7889b5876535492420`.
This is boundary evidence, not completed cancellation integration or component verification.

Preview process stop retry (2026-11-05): the registered process lease now retains
an unconfirmed cleanup error after consuming its task handle, so a repeated stop
cannot report success on that basis. The focused actual-crate regression
`failed_stop_remains_unconfirmed_on_retry` passed 1/1. Evidence:
`.jait/artifacts/gateway-rust/preview-history/stop-retry-focused.log` SHA-256
`bf7cf66a4ee5566821bddd08c300f988b47d6952da970ad5ede780a197dcd5e4`;
tested source `preview_process.rs` SHA-256
`97f31c6e1079fc7191efc23a002b08eecad52b0261c0383552dc6426064321f0`.
The test exercises an error-returning task, not real process cleanup, host
supervision, or runtime integration. The component remains partial.

Preview process cancellation evidence (2026-11-05): the Linux-only focused
`stop_reaps_real_process_before_releasing_pool_capacity` test passed 1/1. A
constructed lease cancels an actual local child, observes the direct child reaped,
and runs another command through the same single-slot pool. Log:
`.jait/artifacts/gateway-rust/preview-history/real-stop-focused.log` SHA-256
`ebba00c44d77f95559bdd78e1dceba48ae754f0a6a149ec273a170a21ad42ae6`;
tested `preview_process.rs` SHA-256
`b340cb271eb0b62117ab3a904cd0f604f7aa78438fcbed1cf7bd414529d2b9e0`.
This does not establish descendant cleanup, authorized launch or live host
supervision; preview remains partial and unmounted.

Process-group signal handling (2026-11-05): cancellation and timeout now report
signal errors other than an already absent group after awaiting the direct child.
The Linux `stop_reaps_real_process_before_releasing_pool_capacity` regression
passed 1/1 against process runner SHA-256
`6c212df3476890e435d793de6f28ff2e20459753d052991f0e1c42e8e97878ad` and
preview process SHA-256 `b340cb271eb0b62117ab3a904cd0f604f7aa78438fcbed1cf7bd414529d2b9e0`.
Log `.jait/artifacts/gateway-rust/preview-history/group-signal-focused.log` has
SHA-256 `a941e2eef3421aaac6b8ed7bb0314a24a873c08d1bbbb56bcc08accf4a3c46cc`.
This covers successful signalling and direct-child reaping, not an injected signal
failure, escaped descendants, authorized launch, or host integration. No component
is promoted on this evidence.

Cleanup error boundary (2026-11-05): the actual-crate focused test
`cancellation_reaps_child_before_reporting_group_signal_failure` passed 1/1,
using an injected EPERM result and a real direct child. It checks that the child
is reaped before that error is returned by the shared cancellation cleanup helper.
The tested runner SHA-256 is
`e2470cc8089ea88ddc0aaa477887110169dba9b69cf232d5b9e6265d861cb885`;
`.jait/artifacts/gateway-rust/preview-history/group-error-focused.log` SHA-256 is
`21cb4f8a19622aa31fc5ebdb53d6074ff77c4ccba87b0ccfc1a902da4f2f96af`.
This injection does not exercise an actual failed group signal or demonstrate
cleanup of descendants. Authorized launch and preview host integration remain open.
No component is promoted on this evidence.

A Linux focused process-pool regression, `cancellation_signals_a_descendant_in_the_owned_group`, passed 1/1 on `src/execution/process_runner.rs` SHA-256 `ce6b859708d67aa793e94213bf0b6bb4719215eddc7baec96db8619e921626ce`; evidence: `.jait/artifacts/gateway-rust/preview-history/group-descendant-focused.log` SHA-256 `56540c106d5d6b73d44653ccb6faa2b2eb905ab9f5ad1a26ba484b604f683999`. It observes one ordinary descendant absent or zombie after cancellation, not its reaping, escaped descendants, host authority or runtime integration. No component receives verification credit from this isolated regression.

On cancellation or timeout, a process-group signal failure now closes the shared
process pool to further admission immediately; a direct-child wait failure also
closes it. This intentionally trades availability for avoiding new work after
unconfirmed cleanup; an owner must replace the closed pool after resolving the
underlying condition. The focused actual-crate test
`cancellation_reaps_child_before_reporting_group_signal_failure` passed 1/1
on `src/execution/process_runner.rs` SHA-256
`8449e7b3ea9ef827b08ae7211f616aac9c6a89630b869e9e304e27bc8114fbcb`;
`.jait/artifacts/gateway-rust/preview-history/group-fail-closed-focused.log`
SHA-256 `c716dc31bba7b6a569c9c4c9976974d6018c3ca8ee3658afd367157921dc70c8`.
The signalling failure is injected, not an observed kernel failure. This does
not prove cleanup after an aborted future, on other error paths, or for escaped
descendants; preview host supervision and client compatibility evidence remain
open. No component is promoted by this focused test.

The process runner now also calls the fail-closed cleanup boundary after an
I/O completion error while retaining that original error for its caller. The
existing injected-EPERM cleanup test passed 1/1 against source SHA-256
`b42c096c2b84ff40723f85be6439884bb37bad5d77c124cffd67d8041d1de7fe`;
its log is `.jait/artifacts/gateway-rust/preview-history/stream-error-cleanup-focused.log`.
This test exercises the shared boundary, not the I/O-error branch itself.
Aborted-future supervision, escaped descendants, client compatibility and
preview host integration remain unresolved; no coverage is promoted.

The process pool now closes admissions if a running execution future is dropped before its cleanup boundary completes. This deliberately sacrifices pool availability because asynchronous reaping and group cleanup cannot be confirmed from a drop handler; already admitted work is unaffected. Linux focused test `aborting_running_process_closes_pool_admissions` passed (1/1), observing a real direct child disappear and rejecting subsequent permit acquisition. Tested `src/execution/process_runner.rs` SHA-256 `47025abbcecce3dc50e93965ac84aab12b2aa6f403a8f6aa7a639898341622d6`; evidence `.jait/artifacts/gateway-rust/preview-history/abort-pool-focused.log` SHA-256 `8c872285d45f98ebc201fd011a23cf53d78447b11ff877648cd0bc5d98d2d07e`. This does not establish cleanup of escaped descendants, compatibility with all callers, or supervised preview host integration; the I/O-error branch remains without direct focused evidence. No coverage component is promoted on this evidence.

The process runner now explicitly signals the owned Unix process group on normal completion before disarming its fail-closed guard. A signal error is returned and closes pool admissions; a successful signal or ESRCH consumes the group guard to avoid a second signal on drop. Focused actual-crate checks on Linux passed: ordinary descendant cancellation (`.jait/artifacts/gateway-rust/preview-history/success-group-focused.log`, SHA-256 `42996772bcef02187f41f2b77b07352b38b87e8ee25e227e12b0b4f6d29be217`) and preview stop followed by a successful pool command (`.jait/artifacts/gateway-rust/preview-history/success-pool-focused.log`, SHA-256 `94fb5b865c5b653419e2d43b94194b0004528d6c9ad47220e8c4cc4969a75f48`). Tested `src/execution/process_runner.rs` SHA-256 `ffd75697dfb9477789e99c83e771bf50630e23d023f82e6abdff15f4cf1a11d2`. These checks do not directly inject normal-completion signalling failures or prove descendant reaping, escaped-process cleanup, or preview host integration; the permanent pool closure remains an availability and compatibility tradeoff requiring further evidence. No component coverage is promoted by these checks.

A failed Unix group signal now consumes the saved numeric ID so `Drop` cannot retry it after the leader may have been reaped. The focused `failed_group_signal_is_not_retried_after_ownership_is_consumed` test passed with an injected EPERM; see `.jait/artifacts/gateway-rust/preview-history/group-no-retry-focused.log`. This sacrifices a best-effort retry and does not prove cleanup; pool admissions remain closed on the failure path. It does not address the first-signal identity race below.

Process-group identity remains an unresolved safety constraint: the concurrent completion future can reap the direct child while output streams remain open. Normal completion, cancellation, timeout, I/O failure, and dropping the future may subsequently signal the saved numeric process-group ID. If the group disappears and that ID is reused, the signal can target an unrelated group. Any repair must retain stable group ownership through signalling and account for reaping on every path; merely moving the normal-completion signal does not resolve the other paths. The current focused tests do not establish protection against that race. A stable ownership/supervision mechanism and compatibility review are required before relying on this path for production integration; group signalling also does not contain descendants that leave the group.

Linux focused test `waitid_wnowait_observes_exit_without_reaping_leader` passed (1/1): `waitid(WNOWAIT)` observed a real child exit and Tokio subsequently reaped its successful status. Tested `src/execution/process_runner.rs` SHA-256 `e42652881cdac4278174484c55a08d181f90a5abb57d12ead73d4aa841158635`; log `.jait/artifacts/gateway-rust/preview-history/waitid-wnowait-focused.log` SHA-256 `0c7e873b12461eefa924ca8a1e447d75417d97ca5c10e1bbca4710536629c0cd`. This is isolated feasibility evidence, not a runner fix: exclusive reaping, future-drop supervision, platform behavior, group identity through signalling, escaped descendants, and compatibility remain unresolved. No component is promoted.

A separate Linux desktop-packaging runtime probe in `src/packaging/package_desktop.rs` also observes a child with `waitid(WNOWAIT)` and later signals its numeric group ID. This relies on exclusive child reaping: another reaper or an auto-reap disposition can invalidate that assumption, and the error path returns through a drop guard that can still signal the saved ID. The source inspection found no other explicit `waitpid` calls in this crate, but does not establish process-wide or dependency-wide exclusivity. The probe needs its own ownership and error-path review; the process-runner feasibility test is not evidence that the probe is safe.

The Linux desktop runtime probe now treats `waitid` returning `ECHILD` as lost
child ownership and skips signalling the saved process and process-group IDs
on guard drop. The focused `externally_reaped_probe_disarms_stale_identifiers`
regression uses a real competing `waitpid` reaper; its output is recorded in
`.jait/artifacts/gateway-rust/preview-history/desktop-echild-focused.log`.
This covers the observed `ECHILD` path only: a competing reaper after a
successful observation, other error paths, escaped descendants, and stable
ownership in the process runner remain unresolved. It does not establish
component verification or runtime replacement readiness.
The focused regression completed successfully (1 passed, 0 failed); the log
SHA-256 is `84237d8f17146bc6dad4f1e2efa356eeb5b4b204f7b3219b787f2e558e0c75ed`.
The live source SHA-256 after a comment-only clarification made during the
compilation is `35e7ad1ed8901b8675fb78ad58bff5c991198cd9e36359c6bb6c7bcf65adb9ce`;
this is not a frozen-source validation fingerprint.

The Linux desktop probe now returns a process-group signal error after observing
exit and records the attempt before cleanup, preventing a group retry from its
drop guard. `probe_group_signal_error_is_returned_and_not_retried` passed with
an injected EPERM (1/1); see `.jait/artifacts/gateway-rust/preview-history/desktop-group-error-focused.log`.
This tests the helper boundary, not an actual kernel signal failure or the full
probe branch. First-signal identity, competing reaper races, direct-child cleanup,
and escaped descendants remain unresolved; no component credit is awarded.

Desktop probe cleanup also has an unresolved availability hazard: `ProbeGuard::drop`
ignores the direct-child `kill()` result and then calls blocking `wait()` without a
separate deadline. If signalling fails and the child remains alive, the stated probe
timeout does not bound return time. A lifecycle repair must handle failed signalling,
reaping and ownership together; skipping the wait alone would leave cleanup unconfirmed.
This finding is from source inspection, not an injected-failure test or a verified fix.

The Unix desktop runtime probe now yields to its outer deadline and child-state
checks when a nonblocking read is interrupted. The focused actual-crate
`interrupted_probe_read_yields_and_can_resume` test passed (1/1); its injected
reader demonstrates yielding and subsequent progress, not end-to-end signal or
timeout behavior. Evidence: `.jait/artifacts/gateway-rust/preview-history/desktop-interrupted-read-focused.log`
(SHA-256 `e8ca8c6020130f0060e98f70ff595f2170ba00fef0c278cc9a00b623e93af524`);
`package_desktop.rs` SHA-256 at this check was
`94175f515ce482947a467cd7b927450049bb3518e1d40bdcda57d6c60542ab6e`.
This does not resolve blocking cleanup after a failed kill, competing reapers,
or process-group identity. No component verification credit is awarded.

Desktop probe ownership update: after a successful direct-child wait (or a non-Linux `try_wait` reporting exit), the guard now records that the child has been reaped and avoids subsequent cleanup using its saved identifiers. Linux focused tests `externally_reaped_probe_disarms_stale_identifiers` and `packaging_probe_cleans_descendant_holding_stdout` each passed (1/1); logs are `.jait/artifacts/gateway-rust/preview-history/desktop-reaped-guard-focused.log` (SHA-256 `724da2b54ee9c2a58102bb3d5f94d237dab1f35d77b9a5ce011bd7c83b4fc72b`) and `desktop-reaped-success-focused.log` (SHA-256 `03e99ee119545a5c8d595bd46b0821f0d6f7ce735c38ff0d8ce0f0df5a8dacc3`). The source SHA-256 at this check was `a4825899065fc0608e26d16e60c7553fe75abfe623914fcf156c8c5f1a35fe01`. These tests do not directly inject an identifier reuse or demonstrate exclusive reaping. Competing-reaper races before signaling and potentially blocking cleanup after a failed kill remain unresolved; no component verification credit is claimed.

The Linux desktop probe now treats an interrupted `waitid` observation as
pending, returning to the loop for its deadline check. The focused actual-crate
`interrupted_probe_observation_yields_without_losing_ownership` test passed
(1/1), exercising injected EINTR and ECHILD classification; it does not inject
an actual interrupted system call or prove the end-to-end timeout. Evidence:
`.jait/artifacts/gateway-rust/preview-history/desktop-interrupted-observation-focused.log`
(SHA-256 `82c7df7c38a949ded77a8f49196293def8e694a0e6bd829bd4740f5dd62df2e4`);
source SHA-256 at this check was
`f17963d77455e34a7f125eab7cb4dd9c8373145ff34bd6c01f58319c08d75a8b`.
Competing reapers, stable group identity and potentially blocking failed-kill
cleanup remain unresolved. No component verification credit is claimed.

The desktop probe now disarms its saved child identifiers if `wait` or
`try_wait` reports `ECHILD`. The Linux actual-crate focused test
`probe_wait_echild_disarms_stale_identifiers` passed (1/1) after a real
competing `waitpid`; evidence is
`.jait/artifacts/gateway-rust/preview-history/desktop-wait-echild-focused.log`
(SHA-256 `78a215e3d4065270bdcc45f0d05a1c7a29dd5073a68e614b34a7e409364424b0`),
with source SHA-256 `aafb0170e26d8cd03dadd9ae4c666e2f5b5e774b794c68540345c25bbeee1d8b`.
This does not establish stable ownership before the first group signal or
bounded cleanup after a failed kill; the non-Linux branch has not been tested.
The focused result does not promote a component or constitute a frozen gate.

Two process-runner cleanup regressions now have Unix configuration guards:
`failed_group_signal_is_not_retried_after_ownership_is_consumed` depends on
Unix-only `OwnedGroup`, and `cancellation_reaps_child_before_reporting_group_signal_failure`
spawns `/bin/sleep`. The first focused Linux actual-crate test passed (1/1):
`.jait/artifacts/gateway-rust/preview-history/group-unix-cfg-focused.log`
(SHA-256 `38b3fa90c7222e07555e521fc916efc7a31d72a125eff48cda5586be3aa37fa6`),
with process runner source SHA-256
`8a620f36e2f56b8ff1ff9302845cd063471cba31c21d30c972ba502557b14777`.
This guards these test definitions only; a Windows build was not run and
process ownership and supervised cleanup remain unresolved. No component
verification credit is claimed.

Process-runner cancellation now bounds the direct-child reap wait to two seconds.
If the wait errors or expires, admissions close and an error is returned; the
child's eventual cleanup remains unconfirmed. The Linux actual-crate focused
`cleanup_wait_timeout_closes_admissions` test passed (1/1), exercising the
bounded wait against a live child and checking closed admissions. Evidence:
`.jait/artifacts/gateway-rust/preview-history/cleanup-wait-timeout-focused.log`
(SHA-256 `2590944cca282a1cb79937de78a7ccd704300610758da7752ae3611419ee747e`);
process-runner source SHA-256
`5697afb0bba3273b395a8f3a90a623bfaca35997591526a4230f2b617d93cd67`.
This does not prove failed-signal end-to-end behavior, stable process-group
identity, supervised cleanup, Windows behavior, or preview host integration.
No component verification credit is claimed.

The process-runner cleanup helper now permits focused injection of direct-child
termination failure. The Linux actual-crate
`failed_signals_do_not_block_cleanup_indefinitely` test passed (1/1) with group
and child signal failures injected against a live child: cleanup returned a
timeout error and closed admissions; the test then killed and reaped the child.
Evidence: `.jait/artifacts/gateway-rust/preview-history/cleanup-failed-signals-focused.log`
(SHA-256 `a18e239bbaefe97220c08584f1158990bf12e567487565a89ebf7eef4f7a5fe5`);
process-runner source SHA-256
`c19af79e3cc6138f3957d2acc364540a4c10e626fd140005500efa4f1cfc2c7a`.
This exercises the cleanup helper, not actual kernel signal failures or the
entire cancellation path. Stable group identity and supervised eventual cleanup
remain unresolved, Windows was not tested, and no component is promoted.

Competing-reaper audit: the lockfile selects Tokio 1.53.3. Its local
`src/process/mod.rs` retains `kill_on_drop` after a failed child wait and its
Unix child kill path delegates to `std::process::Child::kill`. Thus clearing
only the runner's saved group ID after an `ECHILD` result would leave a
separate drop-time kill attempt; it is not a complete ownership fix. Inspected
Tokio process module SHA-256
`43beb73d468354cab1818b0043a9adafb37764b3b883b34455815ac2b4ec0cd8` and
Unix process module SHA-256
`6c084b4a1821ee5cb6008226c39df65a88ca7615c6b5b114102fa6627fd4250b`.
This is source inspection, not a demonstrated PID reuse or a repair. Process
ownership and supervised cleanup remain unresolved; preview remains unmounted.

Process-runner `ECHILD` handling now discards the saved Unix group identifier,
closes admissions, and returns without explicitly signalling the group or direct
child when the joined operation reports that error. The focused Linux actual-crate
`competing_reaper_error_discards_group_and_closes_admissions` test passed (1/1),
checking injected error classification and the group guard; it does not run a
competing reaper or exercise the whole cancellation path. Tested source SHA-256
`8638e93312c8529456721b178ffb0280ed1bf2cfc780e9fb6757516cc0bc3b72`;
log `.jait/artifacts/gateway-rust/preview-history/runner-echild-guard-focused.log`
SHA-256 `db9612c8bdaf0599c0e5e9fcea0791010ec37cb77928b4e6d0f46218aa398e4d`.
Tokio's armed child drop guard can still attempt a signal after this return;
competing-reaper races before observing the error, stable identity, and supervised
cleanup remain unresolved. No component is promoted and preview stays unmounted.

Linux focused test `externally_reaped_child_discards_runner_group` passed (1/1):
a real `waitpid` reaped a spawned direct child, Tokio's subsequent wait returned
`ECHILD`, and the runner's guard discarded the group ID and closed admissions.
The test disables Tokio kill-on-drop to avoid signalling a potentially reused PID;
it exercises the guard directly, not the full runner cancellation path. Tested
source SHA-256 `084baddc5f30bae4cba02cfd71f5365f2052432fdfb6c0d76bd81e2fc9fbc137`;
log `.jait/artifacts/gateway-rust/preview-history/runner-real-echild-focused.log`
SHA-256 `767bf281aacc4c15bfd57aa3f04317288b73bc92cc7bc2db5b686c07adb6da1b`.
This does not fix the production drop guard, races before the error is observed,
process-group identity, or supervised cleanup. No component is promoted.

The partial messenger service now prefers a string Matrix attachment `filename`
over the body, including an empty filename; non-string filenames fall back to the
body or `Attachment`. Focused Linux actual-crate test
`attachment_filename_takes_precedence_over_message_body` passed (1/1), covering
those cases. Native source SHA-256
`08984fde8da53acc7eeefd3eb25db2225fcf7300c092c25c9cc0ce66dffbcc43`,
reference SHA-256 `99bf5ed41bfb574c1fb987992b91e8b038e77bdd24cc46212fde913915c8eb58`,
and log `.jait/artifacts/gateway-rust/preview-history/messenger-attachment-filename-focused.log`
SHA-256 `f2d19507ee863b09e174480815697db1804d79d13603e0af7008307b8b986b15`.
The component stays partial: status-room and topic behavior, non-scalar body
coercion and full runtime/contract evidence remain open. No verification credit
is awarded by this focused test.

Joined Matrix sync now creates an initial room cache entry, merges state and
state-bearing timeline events by type and state key, and updates or removes the
summary topic. Linux actual-crate focused test
`joined_sync_creates_room_and_updates_topic_from_state` passed (1/1): it covers
creation, replacement by timeline state, and removal for a non-string topic.
Tested native source SHA-256 `c606b4f8b798f78798641c0274d6e1b5beb0438f6db680b1fa48baddbc77e535`;
log `.jait/artifacts/gateway-rust/preview-history/messenger-sync-topic-focused.log`
SHA-256 `cf9142db3ab4b99885c19de1dbd641ff902500cee20c6dd96c285999b4c9d7b3`.
The UTF-16 512-unit limit drops a character when the boundary splits a surrogate
pair, unlike JavaScript's lone-surrogate slice; this remains a compatibility gap.
Other sync and status handling, full contract evidence, and runtime integration
remain incomplete. No component is promoted.

Joined-room sync now retains the first string `timeline.prev_batch` token for
history pagination and does not replace an existing token on later syncs. The
Linux actual-crate focused test `joined_sync_preserves_initial_history_token`
passed (1/1), including a misleading top-level token. Tested source SHA-256
`b345d78a46b30e130a7dafcb9dbcbca50c564709e7b8ad29bfb5d3ea75e216a3`;
log `.jait/artifacts/gateway-rust/preview-history/messenger-sync-history-token-focused.log`
SHA-256 `aa7c62eca7424a561889934b9e5e4e421c0e0c01592eeba7edd652641e027214`.
This covers token initialization, not full pagination or malformed-token parity.
The messenger component remains partial; no verification credit is awarded.

Joined sync now ignores timeline events with missing or empty IDs, replaces
existing IDs in place, and removes a target named by a redaction. The Linux
actual-crate focused test `joined_sync_upserts_identified_events_and_applies_redactions`
passed (1/1), exercising content-based redaction. Tested native source SHA-256
`6a62a4529507eb02ac42b64cb7a382e29e12decf2361070844a457dbc61cfcea`; log
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-event-upsert-focused.log`
SHA-256 `ed1870a7bfba8c22e7d9fca16ef50b86252c8d14d7d12061e89d4fe30e4f0aa7`.
Other event-limit and redaction edge cases still need
comparison, and the full messenger contract and runtime integration remain
open. This focused test does not promote the component.

Joined-room sync now retains already-redacted timeline entries in the cache and
trims after processing the batch. The Linux focused regression
`joined_sync_trims_after_redaction_and_keeps_redacted_events` passed (1/1):
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-retention-focused-rerun.log`.
The initial test had an incorrect expected count and failed before correction.
Cancellation and temporary batch-size bounds, raw versus decrypted redaction,
and the remaining messenger contract require review; this is not component
verification.

Joined sync now uses the incoming event ID to locate an existing cache entry and
its incoming type and redaction target to decide removal, while storing the
decryption result. Linux focused test
`joined_sync_uses_incoming_identity_and_redaction_before_decryption` passed
(1/1); evidence is `.jait/artifacts/gateway-rust/preview-history/messenger-sync-raw-identity-focused.log`
(SHA-256 `83de82a733b21745e14afb7843117fce15717a8f4d1240fea57f7cad2cd07743`).
The tested Rust source SHA-256 is
`a5bd29448cd4df8d4aba83264cf3f83fba09acb9f1aaa7900ed22828c1ea8015`.
Malformed event coercion, cancellation and temporary batch-size bounds, other
messenger behavior, and runtime integration remain open; this does not verify
the component.

Joined sync now trims the retained event cache when a partially processed sync
future is dropped. Linux focused tests passed for cancellation (1/1) and the
existing completed-batch redaction/retention case (1/1). The tested source
SHA-256 is `a9380bb968773edd6afbd53a3d906200dea1573dfe750fd26f957a5b7c4b1629`; logs are
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-cancel-retention-focused-rerun.log` (SHA-256 `597ce1bca7a11a12f3f62ba086d21966b57276489137889aaaeae34d07c8304f`) and
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-retention-guard-focused.log` (SHA-256 `894dd64e2365748d4fc8a10a1c7e79abf8e518793f8c6aae597e652061545740`).
The cache can still temporarily exceed the limit while a batch is pending;
concurrent sync and other cancellation semantics remain unverified. This is
partial implementation evidence and does not verify the messenger component.

2026-11-05 — The partial messenger sync loop now stops applying a batch when
its cancellation signal fires during decryption. The focused Linux regression
`abort_during_sync_decryption_stops_remaining_batch` passed 1/1; the log is
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-abort-batch-focused.log`
(SHA-256 `e85f3be855afdb728fee22e242e08818217325c44519fdeeed9d4e48a45c2123`).
Tested messenger source SHA-256 `74f28b2c23f7467bdb49007ac5d71857954e192dfed782b8749dd452f36b361d`.
This is partial cancellation evidence; concurrent synchronization, other lifecycle
behavior and full component and runtime verification remain open.

2026-11-05 — Joined-room sync now updates unread counts and marked-unread
account data, including nullish count defaults and JavaScript truthiness. The
focused Linux test `joined_sync_updates_unread_summary_with_js_semantics` passed
1/1. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-unread-focused-rerun.log`
(SHA-256 `cc0f7d682ea81349ee73a9ce40fc2e533b71ea30fc4c5a13ed00a6019d612e2e`).
Tested messenger source SHA-256 `a8a2f54e0a4363559f14002ad98652695dc80728b76bfcd48a181e85e57d370e`.
The initial exact filter selected zero tests; the corrected run supplied the evidence.
Messenger remains partial, with full contract and runtime integration unverified.

2026-11-05 — `m.direct` account data now replaces the direct-room map without
clearing presence collected in the same sync. The focused Linux regression
`sync_direct_replaces_mapping_without_clearing_presence` passed 1/1. Evidence:
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-direct-focused.log`
(SHA-256 `76947f1d85a12fd5e89c555af731274807256051d63aa535aca26ade54872687`);
tested source SHA-256 `3fcce32142b0b3fe4b118f01d363722f0a140529146f4d9352bb5b3f990df98a`.
Duplicate-room object ordering and peer integration remain unverified. The messenger component and runtime integration remain partial.

2026-11-05 — Sync now processes room sections in JSON order, creates invite
rooms, retains known leave rooms, and skips unknown leave rooms. The focused
`sync_membership_preserves_section_order_and_known_leaves` regression passed 1/1.
Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-membership-focused.log`
(SHA-256 `04705686201b6e7611a100421002137158a688027916a6ff4231e799cedafc53`);
tested source SHA-256 `b692c997da4dd6860632af74e1c062b73cd2a9e39587ec13a91f14555ab120f5`.
Other summary fields, full sync parity and runtime integration remain incomplete;
this is partial evidence.

2026-11-05 — Room sync derives the preview and timestamp from the latest
projected message, with invitation and empty-room fallbacks. Focused Linux tests
`sync_room_preview_tracks_messages_and_invites` and
`abort_during_leave_decryption_stops_remaining_batch` each passed 1/1. Logs:
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-preview-focused.log`
(SHA-256 `df95d10a45c9172b9833069a4b9669beb4f58a2774a40bf0cf6682f0ae93c1b1`) and
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-leave-cancel-focused.log`
(SHA-256 `4c25d5b3fe09294761b52fcd56a08f9ff5a9b0783f6d9466a843566ed628ca8d`);
tested source SHA-256 `79e80999daec32d752de128327824059ea1f449d24ffdeb294bb22a7fe1c3c7e`.
This does not establish full summary, cancellation, or messenger component parity.

2026-11-05 — Room sync derives the encryption flag from retained
`m.room.encryption` state. The focused `sync_summary_detects_retained_encryption_state`
regression passed 1/1. Evidence:
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-encryption-focused.log`
(SHA-256 `2e1ec2e39d19c7c760258368d72200dbe00f899efd32fe8c705f450b404fd485`);
tested source SHA-256 `56b85cae7c6b31657ae27fe5226a43b9c32e48a7754913835c6ed5b318e92255`.
This is partial evidence; name, peer, receipt, and other sync parity remain incomplete.

2026-11-05 — Sync merges incoming `m.read` receipts into retained room state.
The focused `sync_receipts_merge_readers_and_replace_updates` regression passed
1/1. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-receipts-focused.log`
(SHA-256 `f6ef92d63a23b0b1384e9c72f8769e4268a03b3b9d38c2401468d3bcd47c1c5a`);
tested source SHA-256 `4eb02973853ce523ec07662c93bbe60c38240a9bda1b737a029a6a57b05644e3`.
This is partial evidence; receipt edge cases, room summary parity, cancellation
and messenger runtime integration remain incomplete.


2026-11-05 — Room sync derives names from retained explicit room name or
the first other member display name, with nullish fallback to the room ID.
The focused `sync_summary_name_uses_state_and_nullish_fallbacks` regression
passed 1/1, including empty and array values. Evidence:
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-name-focused.log`
(SHA-256 `dc4d606639061633a7cc372c056f7094b0d27e802f7eaa1892c0b1d150997e02`);
tested source SHA-256 `887a57870eac98955a9f8cf702be529c50894a3754d421af54fd939ad9e27506`.
This is partial evidence: JavaScript number formatting and UTF-16 boundaries
need further parity review, as do peer, receipt and runtime integration.

2026-11-05 — Room sync derives an active direct peer and chooses a valid Matrix
peer or room avatar, clearing stale values after membership changes. The focused
`sync_peer_and_avatar_follow_active_membership` actual-crate regression passed
1/1; evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-peer-avatar-focused.log`.
Tested source SHA-256 `b7f01c1ec9b2bd645f5a353aa2668eaf965bb1ccd1fc80c0c25da04a43a40b52`.
This is partial evidence, not messenger component verification. Numeric and
UTF-16 conversion edges, receipt semantics, runtime integration, and final
frozen validation remain open.

2026-11-05 — Room sync derives bridge service and network labels from retained
Matrix bridge state. The focused `sync_bridge_labels_follow_retained_state`
actual-crate regression passed 1/1. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-bridge-focused.log`
(SHA-256 `626c2fb5ef2729e076388cdd249510c82ce0bda4c0ad87a241e6107258c8ce95`); tested source SHA-256 `190c3f151f9ec29fc5866b5977042dc26400073d3c9bab274b55db9c5b3a6614`. This is partial
evidence; status summaries, numeric and UTF-16 edge cases, runtime integration
and final frozen validation remain incomplete.

2026-11-05 — Room sync classifies status rooms from their name or topic and
clears stale status while preserving other room kinds. The focused
`sync_status_room_classification_follows_name_and_topic` actual-crate test
passed 1/1. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-status-focused.log`
(SHA-256 `4bb0e87bba8f3f886bd23aa7b154a7c81b07b8e9adc582dacb0712432ca5ae24`);
tested source SHA-256 `b74bdf25befa8bbaff604eb0cdfd40f7db39a6365af7588b50459cbb96760ec5`.
This is partial evidence; messenger parity, runtime integration, and final frozen
validation remain incomplete.

2026-11-05 — Receipt reader names now use JavaScript-style conversion and UTF-16
length for complete Unicode characters. The focused `sync_receipt_reader_names_use_js_conversion_and_utf16_length`
actual-crate test passed 1/1. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-receipt-reader-name-focused.log`
(SHA-256 `809c0f314c1903188413ef20380aad6af836e06d89846c8a04da324866f209d0`);
tested source SHA-256 `c9d3103928f7032f43d942dcf04addd51fc4fb4f8baed09e5c37b26007778d02`.
This is partial evidence, not component verification. JavaScript numeric formatting
and a truncation boundary splitting a surrogate pair remain parity limitations.

2026-11-05 — Array-valued `m.read` receipts now merge index-keyed readers.
The focused `sync_array_receipts_spread_indices_and_merge_updates` actual-crate
test passed 1/1. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-array-receipts-focused.log`
(SHA-256 `38df3e44f31bb963101ee255f206fb52b3b6b12d483c55a8da4dfdc68ab90dbc`);
tested source SHA-256 `d3a8c886da31c47b35c541f8a4704e2be671dfa1803927a946dc52245a2976b6`.
This is partial evidence, not component verification. JavaScript numeric-key
ordering and other malformed receipt cases remain open.

2026-11-05 — Receipt projection now follows JavaScript property enumeration for
numeric keys at event and reader levels. The focused actual-crate test
`receipt_projection_uses_js_property_order_at_both_levels` passed 1/1. Evidence:
`.jait/artifacts/gateway-rust/preview-history/messenger-receipt-order-focused.log`
(SHA-256 `96cb5a58286a46a7857cbab8e14ccaae51b84917df2976692a559d280b5981b9`);
tested source SHA-256 `1c7f7db18a71abd49d235d90f3c87cf6fffe7e40092c68aa62ec9e5787d469b8`.
This is partial evidence, not component verification. Malformed receipt cases
and non-index key insertion order when parsing incoming JSON remain open.

2026-11-05 — String-valued `m.read` receipts now spread UTF-16 index keys
while preserving other readers. The focused actual-crate test
`sync_string_receipts_spread_utf16_indices` passed 1/1. Evidence: `.jait/artifacts/gateway-rust/preview-history/messenger-sync-string-receipts-focused.log`
(SHA-256 `4a4f58699d3eec4b31398ac149e96442cac8e1d137c6f26ce0c53ce1743c3143`); tested source SHA-256 `681ee58db731fc46447be4b7441103b6ca3c0c4675c3710f699c7db415db2799`.
This is partial evidence, not component verification. Outer malformed receipt
content and end-to-end input ordering still need review.

2026-11-05 — Array-valued receipt content now uses array indices as event IDs
and merges subsequent readers. The focused actual-crate test
`sync_array_receipt_content_uses_event_indices` passed 1/1. Evidence:
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-array-content-focused.log`
(SHA-256 `9f473c03d5edfb3760d34d49a6a8507da6b039b54c7e0de4189a6efdb0ed4e6f`);
tested source SHA-256 `edfb840ad892e0249effe97d5d8304bda4650f2a8377fa52694ff4f671cd1668`.
This is partial evidence; other malformed content, input ordering, runtime
integration and component verification remain open.

2026-11-05 — String-valued outer receipt content now enumerates UTF-16
event indices while preserving existing readers. The focused actual-crate test
`sync_string_receipt_content_uses_utf16_event_indices` passed 1/1. Evidence:
`.jait/artifacts/gateway-rust/preview-history/messenger-sync-string-content-focused.log`
(SHA-256 `421f72d03dd173aef40b8933dbe63ed4bba5e5c7f0584aae2ab7101ede96062e`);
tested source SHA-256 `52988f0adc068388d1f70d57cfe65e875f6660852ba3c63580876e4a922b176f`.
This is partial evidence; null error propagation, input ordering, runtime
integration and component verification remain open.

2026-11-05 — A point-in-time audit of the existing ledger found 320 verified,
4 implemented and 46 partial original components, and 5 verified, 7 implemented
and 1 absent newer component. Of 35 reference files whose live hashes differed
from the ledger, 21 were marked verified. These are historical ledger labels,
not evidence of parity with current reference source. Reconcile the drift and
rerun the applicable contracts before final verification. Evidence:
`.jait/artifacts/gateway-rust/preview-history/reference-drift-audit-20261105.json`
(SHA-256 `ab7f67bfc1048ca0e0b78a11fd43e85b074364b348bb826e50dba6e09def0536`).
This audit does not recapture coverage or establish runtime or production readiness.

2026-11-05 — GitHub forge token validation now uses the scoped session and
command authority; a focused test passed for enterprise host, token environment,
success, sanitized failure and cancellation. Forge HTTP identity parsing rejects
nested and other malformed IDs; its focused scalar-validation test passed. The
forge-auth route and secret persistence remain deferred, and generic login errors
and malformed-ID rejection are intentional compatibility differences requiring
review. These tests do not establish component or live-provider parity. Evidence
and source hashes are recorded in `native-coverage.json`.

ACP stdout frame bound (2026-11-05): the provisional native transport rejects
newline-delimited frames exceeding 4 MiB before JSON decoding and closes pending
requests. Focused test `oversized_stdout_frame_closes_pending_requests` passed
(1/1; terminal execution `01a1ad54-10ac-7e0a-8284-98ce3d7ce84b`). This is an
intentional overload behavior change requiring provider/client compatibility
validation before runtime integration. Stderr retains a 16 KiB prefix per line
and drains the remainder; cancellation interrupts an unfinished read. The focused
`cargo test --lib stderr` selection passed 6/6 (2026-11-05; evidence
`5d8e7ae3f6edcfa7a5cd1054dfcde8d76e947253b50d1079abaf0937d335f94b`).
Invalid UTF-8 diagnostics use replacement decoding so subsequent lines continue;
the focused `invalid_utf8_stderr_does_not_stop_following_diagnostics` test passed
(1/1; execution `01a1adc3-fc18-76a9-b652-ad8a8b4b34d5`). Diagnostic
truncation also requires provider/client compatibility validation. Descendant teardown, multi-turn attribution and approval compatibility remain
open. This focused evidence does not promote component verification or establish
production readiness.
