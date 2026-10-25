# Native Rust gateway

## Current reconciled frozen checkpoint — 2026-10-25 (232 components)

The refreshed full frozen gate passes **232/376 components (61.70%)**:
**227/370 original targets** and **5/6 newer additions**. **143 originals** and
**1 newer addition** remain pending. This supersedes earlier live coverage counts:
channel HTTP is now verified, while `services/chat-loops.ts` and `tools/loop-tools.ts`
remain pending after concurrent TypeScript configured System One monitoring changes.
Their native deterministic lifecycle and reference-only monitor specifications do
not establish configured native monitor parity. See
`tests/contract/reviews/native-chat-loops.md`.

Formatting, strict native Clippy, 316 native library tests and 161
differential targets passed against the recorded frozen inputs. The final audit
found an unrecorded CommonJS dependency (`surfaces/browser-cursor.cjs`); current
source freshness is pending a new full gate after runtime-input enumeration repair.
Workspace outputs stayed unchanged. Evidence: `.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/232-report.json`; final source audit and count reconciliation:
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


For migration work, start with the [migration plan](../../docs/gateway-rust-migration.md#agent-entrypoint-and-architecture-improvements)
and [session ownership and concurrency guidance](../../docs/gateway-rust-architecture.md#session-ownership-and-concurrency).
The architecture guide records current foundations, proposed improvements,
priorities, official references and required race/cancellation/overload checks.
The [capacity roadmap](../../docs/gateway-rust-capacity.md) targets thousands of
concurrent sessions and eventually more than 10,000 where resources allow. The
500-session profile is an early milestone; later stages require their own measured
load/soak evidence. It records current limits and proposed checks; no capacity pass
for these targets is claimed.
Proposals earn no component credit; verify live source freshness before reporting
any checkpoint below as current.

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
