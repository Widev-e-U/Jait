# Gateway migration to Rust

## Latest frozen native checkpoint — 2026-10-23

The full frozen-source native gate passes **212/370 components (57.30%)**
in the recorded inventory, with formatting, strict Clippy, 303 native library
tests and 145 contract targets. Evidence:
`.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/212-report.json`.
Frozen sources stayed unchanged. **This snapshot does not certify the current
workspace:** concurrent context-budget/evidence changes modified live inputs
and added runtime files. The fast `tooling/progress.mjs` audit records both
the changed inputs and unrecorded runtime paths. Reconcile those additions
and rerun the source-bound gate before claiming current-workspace parity.

This continuation adds native shell syntax validation, command-yield timing
policy and the terminal execution inspection/cancellation adapter. Their
sources still match the passing snapshot. Actual TypeScript comparisons cover
199 timing cases, parse-only shell behavior, startup environment/flags,
malformed executable/path errors, byte/time limits, UTF-16 diagnostics, metadata
and dispatch. Actual native monitor checks retain session ownership, partial
output and cancellation history. Seven isolated mutations failed their intended
assertions; restored suites pass. Workspace TypeScript and artifact-path checks
passed before the concurrent edits. Review:
`tests/contract/reviews/native-terminal-helpers.md`; detailed evidence:
`.jait/artifacts/gateway-rust/terminal-helpers/`.

The recorded inventory has **158 pending components**, plus newly added runtime
files awaiting inventory reconciliation. Equal component weights do not estimate
remaining effort. Production remains TypeScript. Loop service/tools, terminal
integration, remaining adapters and platform/resource/recovery/replacement gates
remain open. No production activation or version bump is included.

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

Status: parallel Rust implementation and reference-test reconstruction. The initial standalone native gateway is in `packages/gateway-rust`; production remains the TypeScript gateway.

## Native implementation checkpoint — 2026-10-18

The source-bound native gate passes **48 / 361 components (13.30%)**.
This supersedes the earlier 8-component checkpoint. Equal-weight source-component
coverage is separate from reconstructed test declarations, implementation effort,
and production replacement readiness.

The latest batch adds native list-preview helpers, `session.search` and
`chat.traces` tool adapters using the native history services. It also fixes
session metadata key ordering and inherited legacy project UI-state migration.
Existing state services were consolidated in `services/json_state.rs`; they
receive no duplicate component credit. The native session HTTP adapter and title
normalizer are implemented and tested, but remain an **uncredited candidate**
until their documented compatibility gaps are resolved.

`RUST_TEST_THREADS=2 bun run test:gateway:rust` passes format, strict native
Clippy, native library tests and 27 differential contract targets.
The gate recorded 318 passing test executions
(including repeated shared transport-helper tests), with no failed or ignored
required tests and unchanged source fingerprints. Workspace TypeScript checks
and artifact-path checks passed. The manifest is
`packages/gateway-rust/native-coverage.json`; source-bound results are in
`.jait/artifacts/gateway-rust/native-progress/report.json`.

Review and limits: `tests/contract/reviews/native-session-ui.md`. Eight mutations
caught ownership, preview-budget, state-migration, metadata-order and title-race
failures; restored implementations passed. The inherited-project-state
regression failed before the fix and passed afterward. The 76-prefix storage
comparison now bounds reference fixture generation to eight prefixes per driver
call, retaining every assertion and the ten-second per-call deadline.

The standalone binary entry point remains unchanged. Session HTTP routes require
explicit opt-in; live chat, device/WebSocket transport and title generation use
explicit adapters. Production remains the TypeScript gateway. The 181/361 native
milestone and full replacement, platform, resource and rollback gates remain
open; no production cutover or TypeScript removal has occurred.

## Scope and completion

Replace all Jait-owned TypeScript/JavaScript gateway runtime orchestration with a native Rust gateway. TypeScript web/mobile/API clients remain supported through compatible versioned HTTP, WebSocket, SSE and tool schemas. External engines, browsers and agent executables remain separately declared dependencies; retaining a Jait TypeScript worker/bridge does not satisfy completion. Run the Rust gateway with Node/Bun absent to prove that boundary.

The Rust acceptance suite in `tests/contract` currently passes 93/93 managed HTTP/restart scenarios and 395/395 TypeScript internal-reference scenarios. The full translated suite also runs through a Rust evidence runner that rejects missing/duplicate results, records skipped tests separately and fingerprints sources before and after execution. Passing execution alone does not establish reviewed assertion parity.

The previous reviewed checkpoint included 2,748 active declarations, one retained Messenger regression declaration and 359 runtime source requirements. The inventory audit is consistent; the removed Messenger test remains executable from its archived source and cannot disappear from the prerequisite gate. That checkpoint credited 116 declarations, including eight UUID declarations added in the latest batch and the earlier 34 across 82 assertion sites, with independent checks of original test bodies and repeated assertions. The latest utility batch adds 41 boundary cases and 13 source-mutation checks, verifies command-timeout source coverage, and adds eight reviewed UUID mappings, and leaves 2,991 declaration/source requirements pending. Current batch results and the strict pending count are recorded in `.jait/artifacts/rust-boundary-contracts/summary.md`; the command-timeout source review is in `tests/contract/reviews/command-timeout.md`.

The 2026-10-17 test parity checkpoint credits 186 additional declarations after individual assertion and variant review plus a fresh, source-bound TypeScript-backend run. The current Rust audit reports **302 / 2,755 verified declarations (10.96%)**, with 2,812 declaration/source requirements still pending and no inventory drift. The translated profile passed 3,040 cases, failed none and skipped 50; internal and managed profiles passed 395/395 and 93/93. Review proposals and the supplemental matcher regression are under `.jait/artifacts/parity-ten-percent/`; the applied mapping is `tests/contract/fragments/parity-ten-percent-reviewed.json`. One model-fetcher declaration remains uncredited because its original empty-header call expectation needs a separate post-fix review. This checkpoint measures reconstructed test declarations only; no Rust gateway runtime implementation has been ported.

R00–R08 remain incomplete. Next work is reviewed assertion/variant coverage for the remaining declarations, explicit branch coverage for runtime sources, resolution of skipped integration gates, mutation checks and supported-platform evidence. A Rust migration is complete only when every inventoried component has passing unit/protocol/integration/acceptance evidence, full client parity, supported-platform results, measured memory gains and a verified backup/rollback path. Disabled or skipped required integrations remain unresolved.

## Continuation checkpoint — 2026-10-17

R00–R08 remain open. The continuation repairs assertion semantics, conditional platform gates, result parsing and descendant cleanup; adds an owned argv/restart adapter with disposable home/config/temp and Git boundaries; introduces a pending interface candidate inventory with a Rust drift auditor; and adds real loopback SSE lifecycle and versioned SQLite recovery tests. Reviews under `tests/contract/reviews/` state their exact limits.

Local execution observed 3,034 translated-target passes with 50 retained source/environment skips, 9/9 explicit Docker integrations and 33/33 Chromium integrations. The recovery corpus executes all 76 current-definition migration prefixes, and the active-stream scenario verifies incremental UTF-8, tool order, durable event replay, cancellation and restart. These checks do not establish complete branch, interface, populated-domain or platform parity. Eleven CLI registrations with 34 original literal assertions are reviewed proposals; no new parity credit is applied without fresh matching evidence.

Concurrent Messenger changes invalidated the global source-bound report. A private source checkpoint was prepared for independent validation, with a static component-coverage gate under bounded-memory review. Continuation threads subsequently stopped because their configured provider workspace exhausted credits; validation and gate stabilization remain unfinished. Current progress, active thread ownership and frozen-source provenance are saved under `.jait/artifacts/rust-continuation/`. The earlier inventory totals above are historical until reviewed recapture; do not use them as a current readiness verdict. Platform runner choice and executed macOS/Windows evidence remain unresolved. No R09 implementation port has begun.

## Reviewed parity continuation — 2026-10-17

The 2026-10-17 source-bound audit credited **2,124 / 2,761 declarations (76.93%)**,
including the retained regression declaration. This supersedes the historical
10.96% checkpoint above. The current batch adds 156 reviewed declarations with
574 live comparisons and 1,148 agreeing Vitest/Rust pass/counterexample verdicts.
A conservative lexical reachability check distinguishes unused shared helper
assertions from missing reachable assertions; its scope and limits are recorded
in `tests/contract/reviews/unused-assertion-helpers.md`.

Fresh validation passes 3,040 translated cases (zero failures, 50 retained skips),
395 internal contracts, 93 managed scenarios, all 9 selected Docker integrations,
and all 33 selected Chromium integrations. The independent consent, tenant/crash
recovery, active-stream and migration-corpus targets pass 18 tests. The normal
source-bound inventory audit passes; strict parity intentionally fails with
**996 pending requirements: 637 declarations and 359 runtime-source coverage
requirements**. The interface inventory separately reports source drift for
`packages/gateway/src/routes/messenger.ts`; it has not been recaptured or granted
behavioral parity. Platform and remaining integration evidence still need review.

The applied mapping is `tests/contract/fragments/parity-resume-reviewed.json`.
Current reports, comparison artifacts and the ranked remaining declaration list
are under `.jait/artifacts/parity-resume/`. This is progress on the Rust-owned
reference test prerequisite. R00–R08 remain open and no R09 gateway implementation
port has begun.

## Reviewed parity continuation — 2026-10-18

The refreshed inventory audit credits **2,486 / 2,776 declarations (89.55%)**,
including the retained regression declaration. This batch applies 353 reviewed
translations and 14 manually reviewed helper declarations. Five historical
reviews for changed declarations are preserved as superseded records in
`parity-safety-reviewed.json`; their new source-bound reviews replace them.

Execution evidence is bound to the isolated source checkpoint under
`.jait/artifacts/parity-continue/source-checkpoint/`. The complete translated
profile passes 3,059 checks with zero failures and 50 retained skips. The internal
profile passes 395 scenarios, and managed acceptance and independent contracts
pass. The 353 reviewed declarations have 1,445 observed comparisons and 2,890
agreeing Vitest/Rust baseline and opposing-counterexample verdicts. Original
retry failures remain in the evidence. This checkpoint avoids concurrent native
gateway source edits invalidating execution; it does not certify freshness of
the changing live gateway implementation.

The ordinary inventory audit passes after recapture. Strict parity still fails
with **650 requirements: 290 declarations and 360 runtime-source coverage
requirements**. Newly added password tests are included in the denominator.
Parameterized variants, assertion mismatches and explicit environment skips
remain pending until individually reviewed. The corrected review index finds
all 3,093 generated registrations, including raw-string and parameterized forms;
registration presence grants no equivalence credit. R00–R08 remain open.

Reviewed mappings are in `parity-continue-reviewed.json` and
`parity-helper-completion-reviewed.json`; execution reports, comparison evidence
and audit logs are under `.jait/artifacts/parity-continue/`.

## Parallel implementation decision — 2026-10-17

The maintainer authorized starting the Rust gateway in a separate folder while reference-test reconstruction continues. This supersedes the earlier implementation-start prerequisite below. R00–R08 remain open and are still replacement/cutover gates. Their historical evidence and pending counts above are unchanged by this implementation work.

`packages/gateway-rust` now provides a native Tokio/Axum HTTP process with loopback-only bootstrap configuration, structured lifecycle logs, bounded graceful shutdown, and a port of `routes/health.ts`. `tests/contract/tests/gateway_rust.rs` compiles the production entrypoint and tests real HTTP plus the TypeScript health handler. The only normalized response field is uptime; counts, provider branches, null/omitted fields and version remain exact. The standalone binary reports empty state and never opens the live database or reads credentials. It cannot serve the application yet. See the [runtime README](../packages/gateway-rust/README.md) for commands and current coverage.

Implementation can proceed per bounded component with Rust-owned checks of real code. Full-suite parity, authorization, storage/recovery, platform, resource and rollback evidence remain mandatory before replacing the gateway. Starting implementation earns no declaration-parity credit and does not mark R09 complete.

Next implementation slices:

1. Add a disposable SQLite repository boundary and validate schema/recovery against the existing corpus. Keep production databases closed until compatibility and rollback are demonstrated.
2. Port identity/authentication and ownership checks before enabling data or execution routes. Reuse Rust acceptance cases and denied-write assertions.
3. Port session CRUD, persisted state and idle SSE through the same HTTP contracts. Keep unsupported routes absent until they have real implementations and matching evidence.
4. Expand providers, active streams, consent and scoped tools by domain, alongside the remaining reference-test lanes.

## Foundation-first construction decision — 2026-10-18

The maintainer requested establishing the directory structure and shared technology
choices before continuing individual ports. The [foundation decision](gateway-rust-architecture.md)
defines the modular native process, core and adapter library choices, domain
ownership, performance targets and construction sequence. The scaffold now lives
under `packages/gateway-rust/src`; reserved domains contain ownership documentation
only. Runtime extraction preserves the public `Gateway` API. Shared blocking-work
admission is available for subsequent database/CPU adapters; existing auth routes
have not adopted it. Release-profile settings and native unit-test wiring are in place.

Foundation validation passes formatting, strict Clippy, three native unit tests and
42 tests across the four credited contract targets, with unchanged source hashes.
The reviewed binding-source change is covered by foreign-owner rejection and
same-owner idempotence before refreshing its fingerprint. The source-bound report
is `.jait/artifacts/gateway-rust/native-progress/report.json`; the foundation summary
is `.jait/artifacts/gateway-rust/foundation/report.json`.

Foundation milestones are 100% complete. Native component coverage remains eight
of 361 (2.22%); folder creation and technology selection earn no additional credit.
The separate, uncredited auth HTTP suite hit a ten-second TypeScript fixture timeout
in `origin_rejections_and_deleted_user_denials_prevent_effects`; ten other tests
passed. That gap remains recorded, and all replacement gates remain.

Next, implement shared runtime/storage/transport/policy infrastructure before
migrating complete application domains. Performance targets still require matched
application-level measurements.

## Reference-test prerequisite and parallel test lanes

The complete gateway test suite must be reconstructed in Rust and pass against the existing TypeScript gateway **before production replacement/cutover**. Expanding or fixing TypeScript tests is not the migration deliverable. Existing TypeScript tests are the behavioral specification and baseline; expose uncertain or failing behaviors as gaps instead of silently changing their assertions.

`tests/contract/coverage.json` inventories every discovered gateway test declaration with its source location, name, describe hierarchy, modifiers, proposed test lane and replacement boundary. Every declaration starts pending, including skipped/parameterized declarations. It also inventories non-test gateway source files and their direct static test imports so previously untested areas require explicit review. Static imports do not prove coverage; declarations inside `each`/loops require runtime expansion review. AST capture cannot establish assertion equivalence or branch coverage.

Run `bun run test:contract:coverage` (or `cargo run --locked --manifest-path tests/contract/Cargo.toml --bin coverage`) for the Rust-only inventory drift audit. It fails on new, changed or removed gateway files and invalid parity claims. `-- --require-parity` additionally fails while any test declaration or source coverage requirement is pending. The initial seed scenarios are intentionally not credited as full replacements. Reports are saved under `.jait/artifacts/gateway-rust-readiness/coverage-audit.json`.

CI uses `bun run test:contract:coverage --evidence-dir .jait/artifacts/contracts` after generating gateway, internal-reference and translated-reference profiles. This mode requires reports bound to the current gateway/shared/contract sources and selects the newest report per profile; it does not fall back to historical successes. A run fails if its sources change during execution.

A verified mapping needs a `parity_review` explaining equivalent assertions and one or more `rust_cases` entries containing `id`, project-relative Rust `source`, and project-relative passing TypeScript-backend `report` under `.jait/artifacts/`. No skipped case counts as passing. Evidence and review must cover each parameterized variant and source branch; this audit checks the recorded evidence, not the correctness of the review. To recapture after reviewing gateway changes, run `bun tests/contract/tooling/capture-coverage.mjs`. This inventory-only helper uses the installed TypeScript compiler AST, preserves mappings for byte-identical files, and resets changed files to pending; it executes no tests. Inventory capture uses TypeScript as a read-only aid; running the Rust audit itself requires no TypeScript/Node/Bun. Source fingerprints fail closed if the inventory needs recapturing; do not refresh fingerprints without reviewing changed assertions and preserving existing mappings.

Test work may proceed in parallel after harness interfaces are agreed:

| Lane | Scope | Shared dependency |
| --- | --- | --- |
| HTTP/tools/config | All routes, schemas, CLI/config and tool response contracts | Isolated backend fixture and typed client helpers |
| Security/execution | Authentication, isolation, consent, scope, redaction and process/path boundaries | Disposable users/nodes and deterministic execution fixtures |
| Providers/streams/coordination | Provider protocols, SSE/WebSockets, sessions, agents, teams and threads | Local model/MCP/ACP peers and event recorder |
| Storage/scheduler | Schema/migrations, persistence, memory, jobs, backup/recovery and controlled time | Sanitized database corpus and fixture clock |
| Native integrations | PTY/browser/node, email/calendar/channels, voice, plugins and screen transports | Local protocol/process peers and supported-platform runners |

Each worker owns separate Rust scenario/fixture modules and maps exact existing assertions plus missing behaviors; shared harness changes require coordination. These lanes reconstruct reference tests; the separate native implementation lane now proceeds alongside them. R00–R08 are incomplete until these lanes and the strict inventory gate pass. A separate branch/contract inventory, mutation checks and supported-platform evidence remain required in addition to declaration mapping.

### Declarative vector lanes

`tests/contract/verify-vectors.mjs` replays one Rust-owned vector file through the test-only TypeScript reference adapter using the same assertion semantics as `src/fixture_internal_contracts.rs::validate`:

```
node tests/contract/verify-vectors.mjs vectors/<lane>.json --json
```

One lane is one `vectors/<lane>.json` plus one `drivers/<lane>.ts`, so lanes share no files and can be filled concurrently. `fixtures`, `storage`, `provider`, `security` and `internals` carry reviewed cases. `db`, `providers`, `routes`, `services`, `storage2`, `tools` and `toolsb` are pre-registered placeholders: their vector files are `[]` and their drivers throw on every operation until Rust authoring lands for that domain. Do not write expected values on the TypeScript side; a lane with hand-authored expectations is no longer a parity check. Rust owns the vectors and expected results, and the verifier has no write path.

## Execution rules

- Add every route/tool/schema/event/config/CLI/database contract to an executable inventory before porting it. Include non-TypeScript bridges, root entrypoints, assets and package/runtime dependencies.
- R09–R31 implementation may proceed in the isolated native lane; replacement/cutover is blocked until the complete Rust suite has passed against TypeScript and the parity gates above are satisfied. Work in order of dependencies below. Split a component into focused per-contract implementation items before starting it; all cases must stay mapped to the parent acceptance gate.
- Preserve the existing gateway until each component has matching black-box results. Use disposable databases, local protocol servers and scoped filesystem/process fixtures. Never compare side-effectful requests by replaying them against production.
- Every domain needs happy paths, invalid/boundary input, auth/user/project/node isolation, errors/timeouts/cancellation, persistence/restart and real native integration where applicable.
- Port isolated unit tests into Rust as well as extending backend-independent contracts. Run deterministic fixture-driven tests without cloud models or real outbound messages. Exercise the real engine/transport in additional integration profiles.
- Treat pre-existing failures explicitly: reproduce, classify and fix or document them before using that area as migration evidence. Do not widen assertions to preserve defects silently.
- Use coverage reports to locate missing branches; require no coverage regression and strict checks on authorization/consent/scope invariants. Mutation/fault-injection cases must prove important assertions fail when behavior breaks.
- Keep requirements and backend differences versioned. Obtain deployment authorization only after the reviewed canary/rollback result exists; creating these todos does not launch workers, publish or deploy.

## Ordered backlog

### R00: Establish reproducible component baseline

Depends on: none. Priority: high.

Source areas: `packages/gateway/src`, `packages/shared/src`, `packages/api-client/src`, `tests/contract`.

Acceptance: Run all current gateway/shared/client unit and integration tests, typechecks and Rust contracts; classify every failure and conditional skip with reproducible evidence. Add measured branch coverage and a nondecreasing CI gate. Keep baseline failures visible rather than changing assertions to obtain green.

### R01: Inventory every externally observable contract

Depends on: R00. Priority: high.

Source areas: `packages/gateway/src/routes`, `packages/gateway/src/tools`, `packages/gateway/src/ws.ts`, `packages/shared/src`.

Acceptance: Produce a versioned manifest of routes, tools, JSON schemas, WebSocket/SSE events, database tables, config keys, CLI commands and supported platforms. Map every source file to a migration owner and required tests; fail inventory checks when a new interface is unmapped.

### R02: Harden the Rust acceptance harness

Depends on: R00, R01. Priority: high.

Source areas: `tests/contract`, `.github/workflows/contract.yml`.

Acceptance: Integrate the seed suite with stable reports, isolated fixtures, no skipped required cases, no hidden retries, dependency locks and CI. Add backend command adapters so the same restart/crash contracts run against TypeScript and Rust. Preserve redacted failure evidence and verify cleanup on timeout/cancellation.

### R03: Build deterministic protocol and failure fixtures

Depends on: R01, R02. Priority: high.

Source areas: `tests/contract`.

Acceptance: Add local fixture servers/processes for model streams, ACP/MCP, HTTP/SSH/TLS, mail/calendar/channels, scanner output and native process execution. Exercise malformed, oversized, slow, disconnected and partially failed responses without real accounts or live target scans; define semantic normalization only for volatile IDs/timestamps.

### R04: Complete HTTP auth and data acceptance tests

Depends on: R01, R03. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/routes`.

Acceptance: Extend Rust contracts across every HTTP route: exact success/error statuses and schemas, invalid input, cookies/JWT expiry, owner invitations, user/project/node isolation, pagination, Unicode, persisted state and denied-write invariants. Cover all CRUD domains, not only the seed session endpoints.

### R05: Test active streaming and WebSocket lifecycle

Depends on: R03, R04. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/routes/chat.ts`, `packages/gateway/src/ws.ts`.

Acceptance: Add real socket tests for authenticated WebSocket handshake/event isolation, incremental UTF-8 SSE, tool events, event ordering, Last-Event-ID replay/deduplication, backpressure, disconnect/reconnect, steering, cancellation and restart during an active turn. Demonstrate that injected dropped/reordered events fail the tests.

### R06: Test consent and execution boundaries

Depends on: R03, R04. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/security`, `packages/gateway/src/tools`.

Acceptance: Prove no effects occur before approval or after denial/cancellation; cover user/node/tool permissions, secret redaction, filesystem/symlink traversal, SSRF and redirect/DNS boundaries, argument injection, execution ownership, deadlines and child-process cleanup in isolated fixtures.

### R07: Build database compatibility and recovery corpus

Depends on: R01, R02. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/db`.

Acceptance: Create sanitized fixtures from supported schema versions and all persisted domains. Test upgrade integrity, foreign keys, concurrent writes, transactions, abrupt shutdown, backups and restoration. Specify which mixed-version rollback is supported; irreversible migrations must block cutover until a restoration path is verified.

### R08: Measure platform and resource baselines

Depends on: R00, R03. Priority: high.

Source areas: `tests/contract`, `packages/gateway`.

Acceptance: Record repeatable TypeScript startup, idle/steady/peak RSS, throughput, latency, file descriptors and child-process counts under identical workloads. Define Linux/macOS/Windows and CPU-architecture support, plus real PTY/browser/scanner fixture availability; unexecuted platform checks remain explicit gaps.

### R09: Create the Rust gateway runtime foundation

Implementation may start alongside R00–R08 under the parallel decision above. Completion and cutover still depend on R00–R08, every test lane, and strict parity. Priority: high.

Source areas: `packages/gateway-rust`, `packages/gateway/src/config.ts`, `packages/gateway/src/index.ts`.

Acceptance: Create a Rust workspace with documented HTTP/async/SQLite/TLS library choices, typed errors, configuration precedence, state/artifact paths, structured redacted logs, cancellation and graceful shutdown. Wire CI formatting/lint/tests and native builds. Keep wire contracts and existing on-disk state compatible.

### R10: Port SQLite storage and migrations

Depends on: R07, R09. Priority: high.

Source areas: `packages/gateway/src/db`, `packages/gateway-rust`.

Acceptance: Implement every schema, index, repository, migration, transaction, identifier and timestamp invariant in Rust. Run the compatibility corpus against both backends and compare durable effects. Preserve secrets and audit/history records; demonstrate backup/restore and crash recovery.

### R11: Port identity secrets and trust policy

Depends on: R06, R09, R10. Priority: high.

Source areas: `packages/gateway/src/security`, `packages/gateway/src/services/users.ts`, `packages/gateway/src/services/user-secrets.ts`, `packages/gateway/src/services/provider-accounts.ts`.

Acceptance: Implement login/registration/invitations, password compatibility, JWT/cookie handling, settings, secret storage/input, provider-account isolation, origin controls, pairing, trust and approval policies. Pass expired/malformed credentials and cross-user/project/node denial contracts without copying or exposing live secrets.

### R12: Port HTTP WebSocket and SSE transport

Depends on: R04, R05, R09, R11. Priority: high.

Source areas: `packages/gateway/src/server.ts`, `packages/gateway/src/ws.ts`, `packages/gateway/src/routes`, `packages/gateway/src/services/static-asset-cache.ts`.

Acceptance: Implement routing, validation, exact error envelopes, CORS/cookies, uploads/static assets, preview origins, WebSocket control plane and SSE framing. Preserve authorization at every route and upgrade boundary. Pass transport/order/reconnect/backpressure contracts with the unchanged clients.

### R13: Port sessions history search and memory

Depends on: R04, R07, R10, R11, R12. Priority: high.

Source areas: `packages/gateway/src/services/sessions.ts`, `packages/gateway/src/services/session-state.ts`, `packages/gateway/src/services/session-search.ts`, `packages/gateway/src/services/session-sql.ts`, `packages/gateway/src/memory`, `packages/gateway/src/routes/reminders.ts`.

Acceptance: Port session CRUD/fork/archive/soft-delete, UI state, messages/checkpoints/context, traces, SQL/search, memory scoring/provenance, reminders and exports. Pass ownership, Unicode, pagination, retention and restart contracts with the existing SQLite corpus.

### R14: Port model providers ACP and MCP adapters

Depends on: R03, R05, R06, R09, R11, R12. Priority: high.

Source areas: `packages/gateway/src/providers`, `packages/gateway/src/services/jait-llm.ts`, `packages/gateway/src/services/jait-models.ts`, `packages/gateway/src/services/provider-usage.ts`.

Acceptance: Port provider discovery/authentication, model and quota/usage handling, external CLI/ACP processes, Codex event mapping, MCP provisioning/bridging and remote routing. Preserve cancellation, attachments, credential isolation and error propagation using deterministic local protocol peers; inventory replacements for all JS SDK dependencies.

### R15: Port the native agent execution loop

Depends on: R05, R06, R13, R14. Priority: high.

Source areas: `packages/gateway/src/tools/agent-loop.ts`, `packages/gateway/src/tools/agent-acp-runner.ts`, `packages/gateway/src/services/execution-guard.ts`.

Acceptance: Implement agent turns, provider streams, tool-call validation/execution, checkpoints, compaction, retries/repetition recovery, steering/queued input, attachments, usage and cancellation in Rust. Demonstrate fail-then-pass assertions for lost/duplicated events and recovery after interruption; no gateway TypeScript worker fallback. Preserve the 13 Rust-owned `internal.agentloop.*` cases in `tests/contract/vectors/agentloop.json` for DeepSeek prompt selection, batch/progress behavior, reasoning continuity, mutation barriers, failures and cancellation; replace their reference bridge with Rust execution while retaining the same expected outcomes. See `tests/contract/reviews/agent-loop-cadence.md`.

### R16: Port tool registry discovery and user interactions

Depends on: R01, R06, R11, R12, R15. Priority: high.

Source areas: `packages/gateway/src/tools/registry.ts`, `packages/gateway/src/tools/index.ts`, `packages/gateway/src/tools/core`, `packages/gateway/src/tools/catalog-tools.ts`, `packages/gateway/src/services/user-questions.ts`.

Acceptance: Port typed tool contracts, registration/naming/search/catalog, validation, approvals, decision evaluation, structured todos/questions, link/diagram output and MCP exposure. Inventory every remaining tool handler and bind it to a domain migration; missing handlers must fail parity checks.

### R17: Port terminal PTY SSH and OS execution

Depends on: R03, R06, R09, R11, R16. Priority: high.

Source areas: `packages/gateway/src/surfaces/terminal.ts`, `packages/gateway/src/surfaces/remote-terminal.ts`, `packages/gateway/src/tools/terminal-tools.ts`, `packages/gateway/src/tools/ssh-tools.ts`, `packages/gateway/src/os-control`.

Acceptance: Replace Bun/node-pty with Rust/native process and PTY ownership. Preserve shell integration, terminal output/replay, stdin/resize, bounded foreground/background behavior, exactly-once completion, SSH host verification, OS elevation and sandbox controls. Test real process groups, timeout/cancel/orphans and Linux/Windows PTY semantics.

### R18: Port filesystem projects git and worktrees

Depends on: R06, R10, R16, R17. Priority: high.

Source areas: `packages/gateway/src/surfaces/filesystem.ts`, `packages/gateway/src/services/project*.ts`, `packages/gateway/src/services/git*.ts`, `packages/gateway/src/routes/git.ts`, `packages/gateway/src/routes/repositories.ts`.

Acceptance: Port local/remote filesystem operations, watchers, project/repository state, git/forge/PR/proposal flows, worktrees and preview lifecycle. Preserve ignore rules, path/symlink boundaries, atomic writes, cancellation and user/node routing. Validate against disposable repositories and process fixtures.

### R19: Port nodes networking and remote control

Depends on: R06, R11, R12, R16, R17. Priority: high.

Source areas: `packages/gateway/src/lib/network-scan.ts`, `packages/gateway/src/services/node*.ts`, `packages/gateway/src/services/device-registry.ts`, `packages/gateway/src/services/primary-link.ts`, `packages/gateway/src/tools/remote-executor.ts`, `packages/gateway/src/services/computer-control.ts`.

Acceptance: Port node identity/pairing/permissions, primary links, discovery, remote tools/files/terminals, computer control, mobile registration/push and screen-sharing signaling. Preserve execution vantage, revocation and reconnect semantics. Use local virtual nodes and packet/control fixtures; do not scan live networks for tests.

### R20: Port security scopes scanners evidence and verification

Depends on: R03, R06, R07, R16, R17, R19. Priority: high.

Source areas: `packages/gateway/src/security/assessment.ts`, `packages/gateway/src/security/workbench.ts`, `packages/gateway/src/lib/security`, `packages/gateway/src/tools/security*.ts`, `packages/gateway/src/routes/security*.ts`.

Acceptance: Port scope/exclusions/expiry, execution leases and bounded TCP/TLS/HTTP/SSH profiles, Nmap/Nuclei/Trivy adapters, telemetry imports, evidence/findings/redaction/export, remediation plans and same-vantage verification. Test scope escapes, malformed/partial output, cancellation, engine versions, issue-present/fix/issue-absent and inconclusive results.

### R21: Port threads teams plans and coordination

Depends on: R06, R10, R13, R15, R16, R18. Priority: high.

Source areas: `packages/gateway/src/services/threads.ts`, `packages/gateway/src/services/thread*.ts`, `packages/gateway/src/services/team-chat.ts`, `packages/gateway/src/services/agent-control.ts`, `packages/gateway/src/services/plans.ts`.

Acceptance: Port persistent agents/profiles/team rooms, handoffs, thread execution/state/history/review/checkpoints, goals/plans, attention and user interventions. Preserve ownership, exactly-once delivery, cancellation/resume and truthful completion evidence. Test concurrent agents with fixture workers, not paid/live provider accounts.

### R22: Port scheduler hooks monitoring and maintenance

Depends on: R06, R10, R15, R16, R20, R21. Priority: high.

Source areas: `packages/gateway/src/scheduler`, `packages/gateway/src/services/database-retention.ts`, `packages/gateway/src/services/disk-*.ts`, `packages/gateway/src/services/background-command*.ts`.

Acceptance: Port jobs/cron/hooks, durable monitoring schedules, background continuations, notifications, database retention, disk watchdog/janitor and maintenance. Test restart/missed-trigger/concurrent-trigger behavior, scope expiry and no duplicate side effects with a controlled clock and isolated storage.

### R23: Port skills plugins extensions and installation

Depends on: R06, R09, R16, R18. Priority: normal.

Source areas: `packages/gateway/src/skills`, `packages/gateway/src/plugins`, `packages/gateway/src/clawhub`, `packages/gateway/src/tools/skill-tools.ts`.

Acceptance: Port skill/plugin discovery, manifests, configuration, installation/update/removal, prompt resources and extension registration. Replace gateway-owned TypeScript plugin execution paths or define an explicit external-plugin protocol. Test archive/path traversal, hashes, failures/rollback and permission preservation.

### R24: Port browser preview code graph and visual tools

Depends on: R03, R06, R12, R16, R17, R18. Priority: high.

Source areas: `packages/gateway/src/surfaces/browser.ts`, `packages/gateway/src/surfaces/playwright-node-bridge.cjs`, `packages/gateway/src/services/preview*.ts`, `packages/gateway/src/services/code-graph`, `packages/gateway/src/evaluation`.

Acceptance: Replace gateway-owned JS browser bridges with Rust/native or documented external protocol adapters. Port browser/devtools/artifacts, previews, code-graph/evaluation runners and architecture/diagram/store helpers. Test real isolated Chromium, sandbox ownership, cancellation, artifact paths and teardown; account for every browser helper/tool.

### R25: Port email calendar and messenger services

Depends on: R03, R06, R10, R11, R16. Priority: normal.

Source areas: `packages/gateway/src/services/email`, `packages/gateway/src/services/calendar`, `packages/gateway/src/services/messenger-bridge.ts`, `packages/gateway/src/tools/email-tools.ts`, `packages/gateway/src/tools/calendar-tools.ts`, `packages/gateway/src/tools/messenger-tools.ts`.

Acceptance: Replace IMAP/SMTP/mail-parser and calendar/OAuth SDK dependencies with Rust/protocol adapters. Preserve accounts, attachments, remote-image policy, MIME/Unicode, pagination, provider errors and credential isolation. Use local protocol fixtures; sending tests must never deliver real messages.

### R26: Port channel and external automation adapters

Depends on: R03, R06, R11, R14, R16, R21. Priority: normal.

Source areas: `packages/gateway/src/channels`, `packages/gateway/src/tools/channel-tools.ts`, `packages/gateway/src/tools/homeassistant-tools.ts`, `packages/gateway/src/services/notifications.ts`.

Acceptance: Port Teams/Telegram/WhatsApp channel lifecycle and assistant routing, notifications and Home Assistant/tool integrations. Resolve JS-only SDK feasibility explicitly, preserve pairing/session state and approval boundaries, and test reconnect/deduplication/rate limits/errors with simulated peers; no gateway TypeScript sidecar.

### R27: Port voice audio and live-view transport

Depends on: R03, R06, R12, R16, R19. Priority: normal.

Source areas: `packages/gateway/src/voice`, `packages/gateway/src/voice-assistant`, `packages/gateway/src/routes/voice.ts`, `packages/gateway/src/services/live-view-manager.ts`, `packages/gateway/src/routes/screen-share.ts`.

Acceptance: Port STT/TTS adapters, assistant voice WebSockets, binary audio flow, live-view/screen-share routing and cancellation. Test sample formats, chunk boundaries, backpressure, permissions, reconnect and session teardown with deterministic audio/control fixtures.

### R28: Package and operate the native Rust gateway

Depends on: R09, R10, R11, R12, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27. Priority: high.

Source areas: `packages/gateway/bin`, `packages/gateway/scripts`, `packages/gateway-rust`, `.github/workflows`, `apps/desktop`.

Acceptance: Produce native supported-platform binaries with embedded web/shell assets, CLI/config/state compatibility, service lifecycle, installers, upgrades, canary/rollback and release checks. Document any external engines/agents. Prove the gateway starts and serves clients on a host without Node/Bun; optional npm distribution wrappers must not become runtime dependencies.

### R29: Run full differential and client compatibility gates

Depends on: R04, R05, R06, R07, R08, R28. Priority: high.

Source areas: `tests/contract`, `tests/e2e`, `packages/api-client`, `apps/web`, `apps/desktop`, `apps/mobile`.

Acceptance: Run the same complete manifest-driven scenarios against fresh TypeScript and Rust backends, compare errors/events/persisted effects, run all client workflows against Rust and inject crashes/failures. Run real native/browser/scanner integrations and the supported OS matrix; missing tools or skips are gaps, not passes. Resolve every mismatch or approved contract change.

### R30: Validate resource improvement and cutover recovery

Depends on: R08, R29. Priority: high.

Source areas: `tests/contract`, `packages/gateway-rust`, `docs/gateway-rust-migration.md`.

Acceptance: Benchmark both implementations under identical idle/stream/tool/concurrency workloads and require measured memory improvement with agreed latency/startup/resource limits. Run long-lived reconnect/cancel/restart tests, backup/upgrade/restore and a reversible canary cutover before broad activation. Record actual results and rollout blockers.

### R31: Remove the TypeScript gateway and enforce completion

Depends on: R29, R30. Priority: high.

Source areas: `packages/gateway`, `packages/gateway-rust`, `package.json`, `.github/workflows`, `docs`.

Acceptance: After all component gates pass, remove replaced TS gateway code/runtime dependencies, old launch/build paths and gateway-owned JS bridges. Keep TypeScript web/mobile/API clients interoperable through generated/versioned wire schemas. CI must fail on unmapped contracts, required skips or gateway Node/Bun runtime use; archive rollback artifacts and update operational docs.

## Test evidence and current baseline

Source revision: `8f513256f60c73770deb054c9d28960f9412ed71` plus the existing uncommitted Rust acceptance suite. Machine-readable inventory, command logs, results and the durable-todo index belong under `.jait/artifacts/gateway-rust-readiness/`.

At planning time, gateway/shared/API-client typechecks passed. Component and integration outcomes are recorded in `baseline-summary.json` and the companion baseline report, including failures and conditional skips. The baseline is evidence for the existing TypeScript gateway, not proof of an unimplemented Rust gateway.


### Native implementation checkpoint — 2026-10-18

The source-bound native gate now passes at **55/361 components (15.24%)**.
This continuation adds question/secret request lifecycles, completion-notification
state, notification broadcast/sink dispatch, usage aggregation/refresh caching,
and the user.ask tool adapter. Reviewed metadata, ownership, timer, ordered
callback and cache behavior are compared with real TypeScript implementations.
The gate runs formatting, strict native Clippy, seven native tests and 345
contract-test executions across thirty targets with unchanged source hashes.
Eight mutations fail the new assertions and restored implementations pass.

Evidence: `.jait/artifacts/gateway-rust/checkpoints/55-report.json`, the current
`native-progress/report.json`, and reviews `native-input.md`, `native-feedback.md`
and `native-user-ask.md` under `tests/contract/reviews/`.
The **181/361** milestone remains open. Session HTTP remains a candidate with
Date.parse/framework compatibility gaps. Production tool dispatch, WebSocket
transport, supported-platform evidence and replacement readiness remain separate
unmet gates; production startup has not been switched.


### Native continuation checkpoint — 2026-10-19

This continuation targets **78/361 components (21.61%)**, with seven new native
components since the recovered 71-component checkpoint: token estimates, provider
todo results, provider snapshot caching, Linux OpenCode credential storage,
question request HTTP, hook HTTP and execution guards. Real TypeScript contracts
cover output and persisted/lifecycle effects. Thirteen mutations across these
slices fail their original assertions; restored implementations pass.

The source-bound verification command is
`python3 packages/gateway-rust/tooling/validate-frozen.py`; its report records
actual results and identifies any live-source drift. Review files under
`tests/contract/reviews/` document typed boundaries and remaining gaps. Native
account storage handles auth/deleted-user checks for question routes, and the
shared JSON parser now matches recursive prototype-pollution rejection.
Production startup and provider/agent execution remain unactivated. The
**181/361** milestone and replacement-readiness gates remain open.


The trust-route continuation targets **79/361 components (21.88%)**. The native
worker preserves trust cache lifetime between database jobs, including failed
write effects and stale cached rows after external changes. Nine focused tests
and three restored mutations cover HTTP, storage, auth and shutdown behavior.
Strict Clippy also passes for all five contract targets added in this continuation.
The full source-bound gate remains the authority for component credit.

## Inventory growth to 364 components

Upstream commit `46a9e828` added three gateway sources to
`tests/contract/coverage.json`, taking the inventory from 361 to 364:
`packages/gateway/src/providers/usage.ts`,
`packages/gateway/src/tools/model-result.ts` and
`packages/gateway/src/tools/skill-discovery-tools.ts`. At re-baseline none of the three had a
native counterpart and none was credited. They were recorded in
`packages/gateway-rust/native-coverage.json` with status `pending` and their
reference hashes so further edits to those files are fingerprinted before the
port begins. `inventory_total` is now 364; verified coverage is measured against
that number. The inventory's own `status: verified` field means reference/JS
contract coverage only and is never read as native credit.

## Provider usage accounting continuation — 2026-10-19

The native `providers/usage.rs` implements `providers/usage.ts`: Codex and ACP
counter parsing, turn/session accumulation, and complete summaries of retained
accounting across dropped trace rounds. Differential tests exposed and corrected
nullish fallback, integer-valued decimal, last-request scope, and aggregate
arithmetic differences in the earlier partial implementation. The original
`context_overhead` API re-exports the moved helpers.

Fourteen differential comparisons and five native regressions pass. Four restored
mutations fail both suites. See `tests/contract/reviews/native-provider-usage.md`
for the typed boundary and evidence. The full source-bound report remains the
authority for current coverage; the all-component migration goal is still open.

## Model-result continuation — 2026-10-19

Native `tools/model_result.rs` completes `tools/model-result.ts`: model-only
projection, duplicate-message removal, omitted/null data, and serialization with
the default 30,000 UTF-16-unit ceiling. The partial implementation's clipping
measurement now uses JavaScript number spelling for candidate metadata as well
as the original JSON. Shared JSON number formatting uses the pinned ryu-js
encoder; existing audit/JSON contracts still pass.

Eleven differential tests compare the reference outputs, including exact strings
and previews. Five native regressions and four restored mutations verify the
same behavior. Tiny budgets preserve the reference minimum envelope, which can
exceed that budget. See `tests/contract/reviews/native-model-result.md` for the
typed boundary. Component credit depends on the full source-bound report;
production model-history wiring remains separate migration work.

## Project transfer and notification detail — 2026-10-19

Native project-transfer orchestration validates and quotes its SSH/SCP plans and
runs them through a bounded argv-based command pool. Local executable peers test
the actual process boundary without connecting to remote hosts. Lifecycle tests
cover limits, failure ordering, admission, cancellation and process-group cleanup.
Existing caller authorization remains required before using this internal API.

Notification detail generation now has exact prompt construction, UTF-16 clipping,
normalization and best-effort failure handling through an injected completion
client. Paused-clock tests verify the real 12-second deadline and transport drop.
The full gate controls component credit. See `native-project-transfer.md` and
`native-chat-notification.md` under `tests/contract/reviews` for evidence and
platform/transport boundaries. The 364-component goal remains open.

## System One continuation — 2026-10-19

The parallel native service now resolves configured System One endpoints, validates
bounded questions/answers, isolates cached results and failure backoff by key/origin,
and ranks already-authorized candidates with the original fallback behavior. Its
decision-tool adapter preserves metadata, question construction and output JSON.
Exact request/answer contracts and loopback transport tests cover the implementation;
production gateway wiring remains separate.

Twenty-one differential tests, twelve native regressions and eight restored
mutations cover the pair. An added comparison caught and corrected signed-zero
tie ordering in the draft. See `tests/contract/reviews/native-system-one.md` for
evidence, compatibility boundaries and cache lifetime requirements. The full
source-bound report controls coverage; the 364-component goal remains open.

## Node registry continuation — 2026-10-20

The native node state manager implements capability merging, connection timestamps,
client reassignment, gateway retention during client disconnection, removal and
snapshots. Compiled ICU collation preserves display-name sorting and stable ties;
locale configuration remains explicit at activation. Advertised capabilities do
not grant permissions.

Eight differential comparisons, five native tests and four restored mutations
cover the state transitions. Both Cargo lockfiles pin ICU collation/data. See
`tests/contract/reviews/native-node-state-manager.md` for typed/ownership and locale
boundaries. The full source-bound gate controls component credit; the 364-component
goal and production gateway wiring remain open.

## Ollama setup guidance continuation — 2026-10-20

Native metadata-only Ollama setup guidance preserves loopback classification,
operator key-path selection, first-failure retention, readable fallbacks and
inert quoted ACL guidance. The Unix adapter uses real user metadata and stat/access
without reading key contents. Differential tests caught and corrected default-path
normalization, then compared actual filesystem results on owned fixture files.

Eight differential tests, six native checks, five source tests and five restored
mutations cover this component. See `tests/contract/reviews/native-ollama-usage-setup.md`
for evidence and platform/host boundaries. The complete source-bound gate controls
credit; production usage API activation and the full migration remain open.

## Installed skill discovery continuation — 2026-10-20

Native installed-skill search preserves exact-match priority, Unicode word scores,
result limits, stable locale ties and 180-unit description previews. The read tool
resolves enabled registry IDs to their trusted paths, returns untrusted file content,
and masks read errors. A differential reproduction corrected repeated-separator
spelling in baseDirectory.

Ten differential comparisons, six native checks and four restored mutations cover
the tool pair and full metadata. See `tests/contract/reviews/native-skill-discovery.md`
for the registry adapter and Unicode/platform boundaries. This component grants no
credit for the separate skill installation/discovery module, and production tool
activation remains separate. The full source-bound gate controls the checkpoint.

## Owner-wide emergency stop continuation — 2026-10-20

Native agent control now persists owner-wide halt/resume state and executes teardown
with the original callback, error and timestamp semantics. Cancellation during
teardown leaves the halt durable. Six native tests include file-backed restart;
six differential tests compare the real TypeScript/Drizzle service, callback traces
and SQLite rows. Eight original tests pass and four restored mutations are caught
by both suites. A fail-then-pass comparison corrected Bun's WTF-8 storage behavior
when the reason ceiling splits an emoji. Review: `tests/contract/reviews/native-agent-control.md`.
Production execution-path wiring remains separate; the full source-bound gate
controls checkpoint credit and the 364-component migration goal remains open.

## Attention delivery continuation — 2026-10-20

Native attention delivery preserves stable request identities, insertion-ordered
replacement, owner resolution, browser/desktop notification policy, targeted clears
and best-effort sink fanout. Duplicate sink subscriptions and their unsubscribe
behavior match object identity in the reference. Transport failures preserve the
original state-mutation ordering. Six differential tests, five native tests and
fourteen original tests pass; four restored mutations fail both native and
differential suites. Review: `tests/contract/reviews/native-attention.md`.
The full source-bound gate controls checkpoint credit; live WebSocket, mobile and
channel transport activation remains separate migration work.

## Calendar public contracts — 2026-10-20

The calendar entry point now re-exports its existing native service and all native
calendar record types. A compiler-checked TypeScript fixture corpus matches native
JSON roundtrips, including optional/null errors and numeric limits. Three focused
contract checks and two native checks cover the type-only module and barrel;
they add no calendar engine behavior or duplicate service credit. Review:
`tests/contract/reviews/native-calendar-contracts.md`. The full source-bound gate
controls coverage and production activation remains unchanged.

## Local Docker inventory continuation — 2026-10-20

Native Docker metadata inventory now validates/maps container records, selects only
local daemon endpoints, bounds argv/process output/time, batches at 32 with a 512
cap, and coalesces polls with success/failure caching. A reproduced cancellation
wedge was fixed by letting the shared collection outlive its first subscriber.
Exact UTF-16 clipping and legacy icon-key wire shapes are retained. Twenty-six
native tests, nine component contracts and a dedicated lifecycle regression pass;
three restored mutations fail both suites. Review:
`tests/contract/reviews/native-network-resources.md`. The source-bound gate controls
credit; live-daemon/platform and production activation gates remain separate.

## Resumable question parity refresh — 2026-10-20

Concurrent TypeScript changes added requestId-based MCP waits. Their old native
fingerprints were rejected by the gate. The native question service/tool now
retains answers across 60-second pending waits, checks exact owner/session identity,
allows already-started waiters to share an answer, and collects it once. Plain asks
keep no-expiry behavior. Twelve refresh contract checks, three native lifecycle
checks, the existing question/secret-input contracts and eight original tests pass.
Three restored mutations fail both suites. Review: `native-user-ask.md` under
`tests/contract/reviews`. This refresh retains existing component credit only after
the full source-bound rerun; it adds no duplicate source-component credit.

## ACP registry continuation — 2026-10-20

Native registry configuration now covers npx/uvx and injected binary-launcher
specifications, stable ICU ordering, bounded-time HTTP, disk cache permissions,
single-flight loading, forced refresh and exact memory TTL. Host comparisons
reproduced and corrected dropped-subscriber suspension, directory permissions,
BOM decoding, redirect limits and inherited alias JSON projection. Six native
tests, fourteen focused contracts (including 114 parser vectors), four original
tests and four restored mutations pass. Review: `tests/contract/reviews/native-acp-registry.md`.
The binary launcher is a separate component and requires an explicit native
adapter; production activation and supported-platform readiness remain open.
The full source-bound gate controls checkpoint credit.

## Security and scheduler public contracts — 2026-10-20

Native declarations now mirror the type-only security and scheduler contract
modules: consent requests/decisions, audit records, numeric trust literals,
scheduled job/create records and asynchronous service methods. Three focused
compiler/roundtrip/signature checks and one native trust regression pass. These
two inventory rows add no security or scheduler engine behavior. Review:
`tests/contract/reviews/native-domain-contracts.md`. Credit awaits the full
source-bound gate; production consent and scheduling activation remain separate.

## Model catalogue, emergency control routes and launcher — 2026-10-20

The source-bound 140-component checkpoint passes all four gates: format, strict Clippy,
136 native library checks and 76 contract targets. Exact frozen/live hashes and a
post-gate recheck match. It includes the ACP registry, security/scheduler public contracts,
model catalogue and agent-control HTTP routes. Existing candidate session routes earn
no verified credit. Reviews document typed seams and platform/activation limits.

The ACP launcher continuation adds native installation and a standalone process, exercised
against owned HTTPS/ZIP fixtures and the real TypeScript program. Cancellation reproductions
caught leaked signal tasks and archive processes; bounded output and padded base64 decoding
were also corrected with failing-before/passing-after evidence. Its 26 host checks and
one native reader test pass. The complete frozen gate must pass again before counting it.
Production TypeScript gateway wiring remains unchanged; the 364-component goal remains open.

## Cached provider catalogues and public declarations — 2026-10-20

The 141-component checkpoint includes the complete native ACP launcher with 137 native
library checks and 77 contract targets, all passing and source-matched. The next candidate
batch adds provider catalogue HTTP/cache behavior and the memory/session/surface public
contracts. Fifteen model-fetcher component checks plus four transport checks cover actual
HTTP, held refreshes, reset races, cancellation and serialized parity. Three restored mutations
are caught. Five public-contract checks plus four transport checks bind declarations to strict
TypeScript fixtures, including negative cases. These type-only rows add no new engine behavior.
Credit requires the next frozen-source full gate; the 364-component goal and production
activation remain open. Reviews: native-model-fetchers.md and native-public-contracts.md.


## Native chat/tool runtime continuation — 2026-10-21

Component implementation remains **185/365 (50.68%)**. This continuation focuses
on the first complete internal turn path and adds no duplicate component credit
for a partial agent loop or chat HTTP route. Test reconstruction remains a
separate ledger: **2,742/2,883 declarations (95.11%)**, with source freshness
reported by the progress audit rather than implied by that percentage.

The candidate native turn coordinator connects configured OpenAI-compatible
streaming, consent-aware dispatch, bounded process execution and persistent
owner-scoped turn records. A real owned loopback SSE fixture requests a tool,
ConsentManager approves its bounded subprocess, the model consumes its result,
and a second turn resumes after SQLite is closed and reopened. Shared admission
holds a session lease through load/execution/persistence. Before tool effects,
capacity checks reserve serialized history/result headroom; cancellation and
timeout retain bounded partial text. Native stream regressions fix framing,
reasoning separation, completion and correlation defects; consent regressions
fix stalled trust-lookup cancellation and JavaScript number wire parity.

The full source-bound gate passes all four stages (format, strict Clippy,
**271 native tests**, and **118 contract targets**) with matching post-gate
fingerprints. The focused application/provider/process/consent/session contracts
pass **60 checks**. A reproduced remote-provider boundary mismatch was isolated to a
submillisecond offset introduced by pausing the test clock late; initializing the
test runtime paused preserves exact timeout assertions and passes the same
comparison. The provider implementation did not change for that fixture fix.
See `tests/contract/reviews/native-chat-flow.md` for boundaries and evidence.

This candidate has no mounted chat HTTP endpoint or browser integration. Its
versioned development turn log is separate from the production UI message
projection and existing TypeScript history. Supported-platform, resource and
cutover gates remain separate. The next application slice is authenticated chat
streaming with disconnect/cancellation handling and an explicit production
message projection, followed by the actual browser workflow.
