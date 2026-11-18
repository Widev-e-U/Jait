# Rust gateway acceptance contracts

The assertions run in a Rust executable and talk to the gateway exclusively through
HTTP and SSE in the acceptance profile. A separate internal-reference profile
uses a bounded test-only Bun driver to invoke real TypeScript exports; Rust still
owns its inputs and expected results. The driver contains no gateway implementation.
A small Node launcher locates Cargo and anchors build output to the repository.
The default fixture starts the current TypeScript gateway through Bun; a different
backend can be tested through its URL.


## Backend-selectable migration scenarios

Run the same Rust-owned behavior assertions against the Bun reference or the
native candidate:

```sh
bun run test:gateway:migration:types
bun run test:gateway:migration --backend bun
bun run test:gateway:migration --backend rust
```

This is a supplemental suite, separate from declaration reconstruction and native
component credit. It currently requires 45 application scenarios on Linux:
33 boundary/storage/integration scenarios, four streaming scenarios, four
process scenarios, and four production-entrypoint chat-flow scenarios. Repeated argv helper unit tests and stream-oracle controls do
not inflate that count. Rust's missing implementations are reported as blocked
and make the command fail. Actual mismatches are failed. The native streaming
fixture is explicitly blocked instead of silently starting Bun. There are no
ignored or expected-failing acceptance cases. `migration-cases.json` pins the
required scenario IDs; omitting a required test remains blocked instead of
silently reducing the denominator.

Each invocation saves logs and a source-fingerprinted report under
`.jait/artifacts/migration-suite/<backend>-<uuid>/`. Dependencies and code are
fingerprinted before and after execution; concurrent source changes prevent a
passing verdict. All fixture state remains under project-local `.jait/artifacts/`.
The default CI run checks Bun; workflow dispatch can measure the Rust candidate
and retain its failing/blocked verdict. Verdict JSON and target logs are uploaded for failure diagnosis.

Latest supplemental checkpoint (2026-10-19): Bun **45 passed / 0 failed / 0
blocked**; Rust **7 passed / 3 failed / 35 blocked**. Both runs have unchanged
source fingerprints. Rust fails raw/compacted tool-history preservation for
JSON overflow and UTF-16 escapes, and reports readiness without opening the
configured corrupt database. The standalone native entrypoint does not yet
compose database startup; this failure is retained as a replacement requirement.
The four added native chat-flow scenarios are blocked at missing public registration.
The source-linked flow and coverage matrix are in [reviews/chat-data-flow.md](reviews/chat-data-flow.md),
with a machine-readable specification in `flows/chat.json`. Each migration run
checks source-anchor and required-test references and writes `chat-flow.json` and
`chat-flow.md` beside its verdict. CI retains these reports and logs.
The detailed local review is `.jait/artifacts/chat-flow-review.md`.
These results do not change native component credit.

The supplemental scenarios cover:

- All 54 ordinary domain tables with explicit values for every current column:
  reopen, migration rerun, snapshot restore, rollback, FTS queries/integrity,
  SQLite FULL via a bounded page ceiling, and rejection of a corrupt snapshot.
  FTS shadow tables are maintained by SQLite, never seeded directly. These are
  current-schema raw storage contracts, not archived-release or service tests.
- Real MCP stdio, SSE and streamable-HTTP peers; discovery schemas, results,
  error envelopes, failed-list child cleanup, reconnect replacement, and a
  deterministic remove-during-discovery race.
- Real ACP launcher/tar extraction with synthetic archives: checksums, unsafe
  paths/symlinks, stale lock and marker recovery, cached installation, literal
  argv/env forwarding, download failure cleanup, and SIGTERM forwarding.
- Real sub-agent SQLite writes, insert/upsert, creation-time retention,
  empty/null and zero-valued fields, and best-effort write failures.
- Disposable Git stage/unstage/discard workflows, route authentication and node
  selection; local forge API behavior and CLI authentication redaction.
- Real Matrix encryption/recovery, invalid keys, wrong backup key/algorithm,
  corrupt ciphertext, and the exact 50,000/50,001-session boundary.
- Real Linux watcher events for distinct case-sensitive paths and ignored files;
  PTY spawn/write/resize/exit, missing PTYs and pending-RPC shutdown cleanup.
- Streaming replay/live handoff, steering reaching the next provider request,
  cross-user denial, cold/invalid cursors, provider/tool terminal failures, and
  cancellation with an unread client. The producer has a finite 16 MiB ceiling
  and cancellation has an eight-second deadline. This does not prove a general
  unbounded-stream memory/backpressure guarantee.
- Actual entrypoint process restart, fresh readiness and port release, plus
  graceful shutdown while a client leaves an idle connection open. Startup with
  an occupied port or corrupt database must exit unsuccessfully without readiness;
  a subsequent valid launch must recover, and corrupt input bytes must survive.

The managed fixture recognizes the native binary's structured `gateway.ready`
stdout announcement as well as the Bun fixture's ready file. Only readiness from
the current launch is considered. A custom active-stream fixture can be supplied
through `JAIT_CONTRACT_ACTIVE_STREAM_ARGV` when running the `active_stream` target
directly; it must provision the same identity, local provider, proof tool and
control endpoints. The generic backend argv is rejected for that specialized
fixture rather than ignored. The suite runner also accepts
`--active-stream-argv '["/absolute/path/to/native-stream-fixture"]'` to enable
those same scenarios once equivalent native provisioning exists. Caller-supplied
adapter identity is recorded separately and never grants native component credit.
Supplying argv does not implement missing Rust chat/provider behavior.

Still separate acceptance work: archived released databases/old-binary restore,
all historical encodings, Windows ConPTY/macOS runs, complete WebSocket/API and
assessment-scope matrices, and every startup/failing-disposer combination.
Native progress and replacement readiness must remain separate from this suite.

## Vector fixture formats

The internal profile reads strict arrays of `{ id, calls, assertions }` vectors.
`native-feedback.json` and `native-user-ask.json` belong to the dedicated
`gateway_rust_feedback` and `gateway_rust_user_ask` differential targets instead.
Their schemas remain owned by those targets and their JSON bytes remain in the
source fingerprints. Every other JSON file in the vector directory still has to
satisfy the strict internal-vector schema; unknown or malformed reference inputs
fail registration.

## Reference declaration checkpoint — 2026-10-19

The reviewed inventory now verifies **2,792 / 2,792 declarations**. All eight
source-bound reference profiles pass, including real Docker, Chromium, scanner,
filesystem and local Ollama checks. The `--require-declarations` audit passes.

The stronger `--require-parity` audit still fails: **360 runtime-source reviews**
remain pending. Native gateway implementation and replacement readiness remain
separate gates. Saved reports and exact results are indexed in
`.jait/artifacts/parity-final/final-summary.json`; source-review candidates and
limits are in the adjacent `source-review-notes.md`.

## Run

Requires Rust 1.98+, Node, Bun 1.3.10 and installed workspace dependencies.

```sh
bun install --frozen-lockfile
bun run test:contract
bun run test:contract:internal
bun run test:contract:unit
node tests/contract/run.mjs translated
bun run test:contract:fmt
bun run test:contract:lint
bun run test:contract:coverage --evidence-dir .jait/artifacts/contracts
```

The explicit real-scanner profile runs exactly four installed Nmap, Nuclei and
Trivy checks against disposable loopback/filesystem fixtures:

```sh
node tests/contract/run.mjs translated-report --profile scanners
```

The engines must already be on PATH. Set JAIT_TEST_TRIVY_CACHE to the prepared
fixture database inside this project's .jait directory; symlink escapes are
rejected. The runner installs nothing and retains a failed report if any required
case fails. Chromium's packaged runtime also requires the normal gateway build,
including the bridge assets copied by copy-shell-integration.mjs.

The coverage audit reads each shared Rust source/report once per invocation and
checks its exact bytes again before saving the verdict. Cached evidence cannot
hide a report or source changed during the audit; case IDs and passing statuses
are still checked independently for every declaration.

The managed run starts an isolated loopback gateway on an OS-assigned port, with a
fresh database, random signing secret and no inherited provider credentials.
It uses the existing evaluation startup mode, which disables scheduled work,
sandbox maintenance, channel startup and optional runtime installation. Ordinary
HTTP routes, authentication and SQLite persistence remain real.

Requests have a 10-second deadline, startup has a 60-second deadline, response
bodies are capped at 2 MiB, and redirects are rejected. Cases run once, without
automatic retries. Eight requests run concurrently in the concurrency scenario.
SIGINT/SIGTERM request cancellation; the current HTTP request can take up to its
deadline before cleanup. Owned gateways are killed and reaped on exit, including
startup/setup failures. SIGKILL cannot run cleanup.

Every invocation prints its unique artifact directory:
`.jait/artifacts/contracts/<run-id>/`. It contains `report.json`, `gateway.log`,
and the isolated `state/` database. Cargo output lives under
`.jait/artifacts/rust-contract-target/`. Paths are anchored to the crate/repository,
including when invoked from another working directory.

Exit codes: 0 means every required case passed; 1 means scenario/setup/cleanup
failure; 2 means invalid invocation or a runner/report error. Setup failure marks
required cases blocked and writes a failing report. Credentials and response bodies
are excluded from report diagnostics. CI uploads only reports, not databases/logs.

## Run sandboxes

Each translated tail case runs in its own sandbox under
`.jait/artifacts/gateway-rust-readiness/tailstatic-runs/stream-<uuid>/` holding a
fake `home/`, `tmp/`, `state/`, the assertion stream, `stdout.log` and
`stderr.log`. Sandboxes are scratch, not the record: per-case results are
aggregated into `report.json` and the reviewed fragments committed under
`tests/contract/fragments/`.

- A passing case deletes its sandbox; a failing case keeps it and the failure
  message prints the path to inspect.
- Kept sandboxes expire after 72 hours, swept once per test process, so killed or
  timed-out runs cannot accumulate unbounded.
- `JAIT_TAILSTATIC_KEEP_RUNS=1` retains passing sandboxes when debugging the
  harness itself.

Keeping every sandbox once produced 68,778 directories and 62 GB in this
repository, which also exceeded the kernel inotify watch budget and stalled the
gateway's file I/O. Do not reintroduce unbounded retention here.

## Another backend

Start an empty disposable backend, then run:

```sh
bun run test:contract --base-url http://127.0.0.1:8200 --disposable --label rust
```

This creates a random owner account, invitation-created members and sessions.
Use a fresh test database for each invocation. The runner does not log into or
reuse an existing owner account. The explicit `--disposable` flag acknowledges
these writes; omitting it fails before requests are made.

The current external profile registers 92 HTTP/SSE cases. The managed profile adds
the abrupt-restart case because it owns the process. Reports name the profile
and explicitly list this exclusion, so external success does not imply restart
compatibility. External runs also omit the restart assertions inside the two
Messenger restart scenarios; these omissions appear in `profile_exclusions`.
Compare stable case IDs and statuses across reports for the same
contract version; IDs, timestamps, credentials and timings are not golden values.

The Rust binary can also be invoked directly after compilation. The Node launcher
is a convenience, not part of the acceptance assertions. Override `CARGO` or
`JAIT_CONTRACT_BUN` when the executable is outside the usual PATH.

## Required scenarios

Contract version 0.2.0 currently registers 93 managed scenarios (92 HTTP/SSE
scenarios plus abrupt restart), including ten local provider probes and five
Messenger scenarios. The table below describes the original 15 seed
scenarios. The executable registrations in `src/main.rs`, `src/scenarios.rs`,
`src/data_contracts.rs`, `src/security_contracts.rs`, `src/control_contracts.rs`
`src/edge_contracts.rs`, `src/provider_contracts.rs` and `src/messenger_contracts.rs` define the complete current set.

The edge batch covers agent-control authentication, halt/refusal/resume and
successful post-resume thread creation, invalid halt requests without state
mutation, per-user halt isolation, repeated incident timestamps, bearer/cookie
refresh, message/cancel ownership, exact error bodies, repository proposal/todo
aliases and completion history, and project repository assignment/refusals.
Thread creation only persists a record; no provider turn is started.

| Stable ID | Observable contract |
| --- | --- |
| auth.anonymous-denied | Protected list/identity routes and session/chat writes reject anonymous clients. |
| auth.invalid-token-denied | Malformed and unsigned tokens do not grant identity or session access. |
| auth.registration-validation | Missing/short credentials fail; existing usernames conflict; uninvited registration is denied after bootstrap. |
| auth.login-identity | Wrong password and missing credentials fail; fresh login retains identity. |
| auth.invitation-owner-and-single-use | Invitations require the owner and cannot be reused. |
| auth.cookie-refresh-and-logout | Login issues an HttpOnly auth cookie; cookie refresh retains identity; logout expires the cookie. |
| sessions.lifecycle | Create, Unicode rename, active listing, archive and soft deletion persist across independent HTTP clients. |
| sessions.state-persistence | Nested Unicode state survives independent requests; patching another key preserves existing values. |
| sessions.cross-user-isolation | Another user cannot list/read/update/archive/delete a session, change its state or read its stream/trajectory; denied writes leave owner data unchanged. |
| sessions.missing-resource | Missing sessions produce 404 for reads, updates, archive, delete, state and stream. |
| stream.idle-snapshot-and-completion | An authenticated new session returns bounded SSE: empty snapshot, then done naming that session. Anonymous access fails. |
| stream.idle-reconnect | Three independent connections receive equivalent completed idle snapshots. |
| sessions.invalid-state-unchanged | An invalid array state update is rejected and leaves prior state intact. |
| sessions.concurrent-create | Eight simultaneous creates return distinct IDs and preserve their individual names. |
| persistence.abrupt-restart | A forced process restart on the same database preserves sessions, nested state, credentials, ownership and idle stream behavior. |

Deletion currently means status `deleted`: unfiltered lists and direct owner reads
retain the tombstone, while active/archived lists exclude it. This suite explicitly
records that existing behavior. Changing it requires a deliberate contract update.

The three SSE assertion tests exercise CRLF/multiline framing and demonstrate
rejection of malformed/truncated data, missing completion, wrong session identity
and reversed event ordering. These run without starting a gateway. Two additional runner tests verify that external
targets require explicit acknowledgement before any network access, and that an
unhealthy backend produces a nonzero exit with required cases marked blocked.

## Translated fixture execution

`node tests/contract/run.mjs translated` runs the translated gateway cases with
four concurrent isolated peers. Pass filters directly, or override concurrency
with `--test-threads=1` when diagnosing shared resources. Each case still gets a
fresh process and disposable state. Most drivers run in Bun test mode so
module mocks actually apply; Rust receives observations and owns every assertion
verdict. Builtin mock registration is checked before the production module runs.
The browser DevTools socket cases use Node 22 with the installed `ws` package;
Bun's built-in replacement lacks the required `unexpected-response` event.
A test-only TypeScript loader preserves the source code and assertions for Node.
Bun peers disable automatic `.env` loading, preserve mock timer time, and evict
module cache entries explicitly when source fixtures request module resets.
The injection adapter restores Node's `writableEnded` lifecycle for Bun's
`light-my-request` responses, including termination after denied preHandlers.

The initial serial run took 1,325 seconds: 2,303 passed, 692 failed, and 59 ignored.
It exposed relocated dependency imports, inactive module mocks, application
logs mixed into the assertion protocol, and unsupported Set containment.
The first complete rerun took 399 seconds with four peers: 2,851 passed, 150
failed, and 59 ignored (current-source regeneration also added four cases and
two semantic helper checks). Later fixes have targeted validation; see the saved
logs for the latest complete count. This is execution evidence, not reviewed
assertion-equivalence credit.
The latest complete run passes every Cargo target: 3,029 passed and zero failed.
The translated target has 3,012 passes and 59 existing ignored cases, taking
357.67 seconds. Managed acceptance passes 93/93 and internal contracts 309/309.
Reproduction evidence, fixture adaptations, the chat memory-order fix and remaining
equivalence-review limits are documented in
`.jait/artifacts/rust-first-execution/final-summary.md`; the full run is
`final-tests.log`. No new ignore annotations were added.

## Translated evidence reports

`bun run test:contract:translated` (or `node tests/contract/run.mjs translated-report`)
runs the complete enabled translated suite and writes a Rust-owned `report.json`
under a unique `.jait/artifacts/contracts/` run directory. It builds the existing
native test target, inventories its registered tests, and requires exactly one
result for each registration. Setup/build failures, missing/duplicate results,
failed processes, cancellation, deadlines, and source drift fail the report.
No filters are accepted for this evidence profile; use `translated` for diagnosis.

Ignored cases have `status: "skipped"`, appear in `not_covered`, and cannot satisfy
a reviewed declaration. The profile is `translated-enabled-typescript-reference`:
success means every enabled test passed against TypeScript. It does not grant
assertion-equivalence credit or Rust gateway runtime parity. Review fragments
remain necessary. Logs are bounded, and owned process groups are cleaned up on
cancellation or timeout. CI runs this profile before the current-evidence audit.

## Remaining migration gates

This is the initial acceptance baseline. A passing report establishes the scenarios
above. Broader migration readiness requires:

- Active provider streams using deterministic local provider fixtures, partial
  chunks, Last-Event-ID replay, event deduplication, cancellation and restart recovery.
- WebSocket authentication, event ordering, reconnect and cross-user isolation.
- Tool execution/consent, filesystem boundaries, scope enforcement, redaction and
  child-process cleanup using local fixtures.
- Historical database upgrade fixtures, data integrity and mixed-version rollback.
- The remaining APIs (jobs, memory, repositories, providers, nodes and assessments).
- Supported-platform runs and measured startup, steady-state/peak memory, latency
  and resource ceilings.

Keep `not_covered` in the report and this checklist aligned when adding contracts.
Add cases to `src/scenarios.rs`, use stable IDs, and increment the contract version
when changing expected behavior. Backend differences should be fixed or explicitly
resolved; do not accept several statuses just to make both implementations pass.

The workflow `.github/workflows/contract.yml` runs formatting, Clippy, assertion
tests, the internal-reference profile and the managed acceptance profile on an ephemeral GitHub-hosted Linux runner.

## Retained deleted contracts

`coverage.json.retained_test_files` keeps deleted test contracts as explicit
requirements backed by a project-local source snapshot and fingerprint. Capture
preserves these entries. The Rust audit rejects snapshot drift, path escapes,
missing reasons, and any original file that has become active again; restoration
requires explicit reconciliation. Retained declarations contribute to the strict
pending count and receive no automatic parity credit. The saved Messenger
ownership declaration retains both original HTTP assertions and is replayed by
the translated suite without restoring a production test file.

## Declaration parity review

`python3 tests/contract/tooling/parity-review-index.py` inventories generated
registrations separately from review credit. It records each declaration's
`translation_variants`, including ignored variants, and parses Rust raw strings
with any generated delimiter length. A generated variant is not proof that all
source variants are present or equivalent. The inventory regression checks run
with `python3 tests/contract/tooling/parity-review-index.test.py`.

Run `bun tests/contract/tooling/apply-fragments.mjs` to merge reviewed declaration
mappings, then run the Rust coverage audit described in
[the migration plan](../../docs/gateway-rust-migration.md). Reapplying identical
reviews is idempotent; duplicate declarations or conflicting existing reviews
fail before writing the inventory.

A passing scenario is not automatically a complete replacement for a TypeScript
declaration. Every assertion, fixture precondition and parameterized variant must
be accounted for. HTTP route tests alone do not replace tool wrapper envelopes,
mocked call arguments, seeded consent queues or legacy job payloads. Reviews that
omit those assertions remain pending in `coverage.json`; corrected earlier
claims are documented in `fragments/parity-review-gaps.json`.

The previous reviewed inventory credited 36 declarations, including twelve exact
internal-reference mappings (two replace earlier HTTP-level auth mappings). This includes nine edge
batch mappings and removes twelve earlier partial mappings. At that checkpoint, the Rust audit reported
3,058 pending declaration/source requirements; the strict
`--require-parity` gate must continue to fail.
Making its status mandatory for merges is a separate branch-protection setting.

## Reference fixtures and evidence freshness

The provider peer binds an ephemeral loopback port and records actual gateway
HTTP requests, including methods, paths and synthetic authentication. Ten cases
cover catalogue protocols, malformed responses, rejected keys and inference
verification. They do not establish active model streaming. The internal profile
has twelve scenarios invoking production auth and command-classification exports;
all 17 variants from the original command tests are asserted in Rust.

Fresh reports include source fingerprints covering gateway, shared and contract
sources. A run cannot succeed if those sources change during execution.
`--evidence-dir` accepts only reports matching the current sources and takes the
newest report per profile, so an older success cannot hide a newer failure.
Without that option the audit checks the historical report paths in the reviewed
manifest. Fingerprints detect source drift; assertion-equivalence review is still
required. The CI workflow generates both profiles before running this audit.

The final continuation run passed 92/92 managed scenarios and 12/12 internal
reference scenarios. Four Messenger cases were added concurrently and are included
in the managed result, without declaration parity credit. The six reviewed
provider mappings are now credited. There are 36 verified declarations and 3,058
pending requirements. Formatting, Clippy, all 15 Rust unit/runner checks and the
source-bound inventory audit passed at that checkpoint; further concurrent
Messenger route/service/history edits are now flagged as source drift. The strict
parity gate still fails as required. No gateway implementation port has begun.

The isolated reviewed reports for this batch are under
`.jait/artifacts/gateway-rust-readiness/continuation-evidence/`.
The temporary Matrix dependency startup failure was resolved by concurrent
Messenger work before the final passing run.

## Parallel Flash preparation checkpoint

The current run passes 93/93 managed gateway cases and 50/50 internal cases.
The security batch now reconstructs all 18 network-scan declarations, five SSRF
declarations and 15 assessment declarations, including all ten unsupported-target
variants, all twelve invalid-scope fixtures, failed completion persistence, and
real local TCP before/after verification. Rust owns all expected outcomes.
The reviewed inventory now credits 74 declarations, leaving 3,020 requirements
in the existing inventory. The audit still rejects concurrent Messenger drift,
including a deleted regression declaration; no credit was obtained by removing it.
Formatting, Clippy and all 16 Rust unit/runner checks pass.

The internal runner dispatches lane adapters lazily and compiles independent
`vectors/fixtures.json`, `vectors/provider.json` and `vectors/storage.json` sources.
Expected values remain in the Rust assertion path. Duplicate scenario ids fail
before running, and vector JSON participates in source fingerprints so edits
invalidate fresh evidence. `vectors/fixtures.json` now carries 14 compiled
vectors (memory scoring, bounded-JSON and UTF-8 limits, command timeout, sub-agent
payload persistence, persisted tool calls and cron/scheduler guards), and
`vectors/provider.json` and `vectors/storage.json` hold the 54 and 177 vectors
from the earlier batches. The remaining lane files (`tools.json`, `toolsb.json`,
`services.json`, `db.json`, `providers.json`, `routes.json`, `storage2.json`) are
placeholders until workers complete them and receive assertion review. Vector
presence is not parity credit: the strict `--require-parity` gate still fails.

Three independent Jait-provider DeepSeek v4.1 Flash batches are specified in
`.jait/artifacts/gateway-rust-readiness/parallel-flash/dispatch-plan.json`.
Their launch failed with `agent_halted`; no threads were created. Resume autonomous
agents through Jait before dispatching these prepared batches. Coverage credit
requires passing Rust reports and exact original-assertion review for every batch.
Security evidence: `.jait/artifacts/contracts/aab942fc-a2f0-4585-b887-94e82eb299aa/report.json`.
Managed gateway evidence: `.jait/artifacts/contracts/49f7d931-76a4-4f56-a2ab-3698da8c2817/report.json`.

## Reference-fixture lane checkpoint

The reference-fixture lane is filled in. `vectors/fixtures.json` holds 14 vectors
covering BM25 tokenization and ranking, bounded-JSON and UTF-8 size limits, circular
serialization, command timeout, sub-agent payload extraction and stripping, persisted
tool-call history, and cron/scheduler create and update guards. A driver fix redirects
`migrateDatabase` diagnostics to stderr so the lane still emits one JSON document.

`node tests/contract/run.mjs internal` now passes 295/295 required scenarios and
`node tests/contract/verify-vectors.mjs` passes 14/14 fixtures, 54/54 provider and
177/177 storage vectors against the TypeScript reference adapter. Formatting, Clippy
and all Rust unit/runner checks pass. This is lane coverage, not parity credit; the
strict `--require-parity` gate still fails as required.
Evidence: `.jait/artifacts/contracts/50ab1811-d1f9-4588-82ed-a531136d69b4/report.json`.

## Command-output filter lane checkpoint

The command-output filter lane is filled in. `vectors/filters.json` holds 29
Rust-owned vectors for `packages/gateway/src/tools/command-output-filters.ts`:
shell preamble normalization, primary-command extraction, opt-out handling,
`git status`/`git log`/`git diff`, grep grouping plus its decline cases, test
summary collapsing, long path-list listings, and dispatcher selection,
minimum-savings threshold and disabled-option behavior. The `lt-path`/`gt-path`
assertion kinds were added to the Rust validator and mirrored in
`verify-vectors.mjs`. This lane replaces the former vitest suite for that module,
so the module is now covered by Rust-owned tests only.

`node tests/contract/run.mjs internal` passes 338/338 required scenarios, and
`node tests/contract/verify-vectors.mjs tests/contract/vectors/filters.json` passes
29/29 vectors against the TypeScript reference adapter. This is lane coverage, not
parity credit; the strict `--require-parity` gate still fails as required.
Evidence: `.jait/artifacts/contracts/9cf1de47-d386-4107-9098-adeca9886120/report.json`.

### Utility boundaries and mutation checks

`vectors/boundaries.json` adds exact utility boundary contracts, executed by Rust through the thin production-call adapter `drivers/boundaries.ts`. Run `node tests/contract/run.mjs test --test boundaries` for the focused baseline and source-mutation checks. The mutation test modifies project-local copies, requires assertion failures rather than fixture errors, and verifies restored behavior. CI includes this target. Full internal evidence includes all boundary vectors automatically.

`reviews/command-timeout.md` maps timeout decisions to individual vector IDs and documents the unreachable minimum-guard alternative. These are reference tests for the TypeScript implementation; they do not measure a Rust gateway runtime. JSON serialization coverage remains pending beyond the explicitly tested cases.

## Continued prerequisite validation

The translated comparator fixes, helper-vector relational assertions, gate handling,
report parser, process cleanup, and remaining limitations are recorded in
`reviews/translated-semantics.md`. Comparison counts now exclude synthetic completion
guards. Platform-only gates compile to Rust `cfg_attr` conditions; capability gates
remain unresolved until their integrations run explicitly.

The owned HTTP/restart fixture accepts `JAIT_CONTRACT_BACKEND_ARGV` as a JSON array
containing an executable and literal arguments. It does not invoke a shell. A custom
backend requires an explicit `--label`; it must bind loopback on an ephemeral port
and write that port to `JAIT_CONTRACT_READY_FILE` once ready. It receives the same
isolated state/database/home/temp paths as the default TypeScript backend. Restart
kills and reaps the owned backend, then repeats the same argv and state. Unix process
groups bound normal descendant cleanup; Windows and deliberately detached children
retain the limitations documented in the continuation evidence. This adapter does
not implement a Rust gateway.

`node tests/contract/run.mjs resource-baseline` measures an owned disposable gateway
on Linux: startup/readiness, five seconds of idle sampling, 50 sequential health
requests, 20 three-request session CRUD operations, and four clients performing 50
health requests each. Reports go to `.jait/artifacts/resource-baselines/<id>/report.json`.
It records RSS, process high-water memory, file descriptors, descendants, throughput
and latency. Workload sampling can miss brief peaks, and summed process high-water
marks are not a simultaneous tree peak. Active model/tool/native-engine workloads
and macOS/Windows/other architecture measurements remain gaps. Repeat measurements
on a quiet host; a report fails freshness if contract/gateway/shared sources change.

`node tests/contract/run.mjs interfaces` checks the versioned interface candidate
inventory without Node/Bun subprocesses in the Rust auditor. `--require-resolved`
fails until all pending interface/owner/test mappings and category gaps are resolved.
See `reviews/interface-inventory.md`; candidate discovery is not behavioral coverage.

## Matcher differential

`node tests/contract/tooling/matcher-differential.mjs` (or
`bun run test:contract:matcher-differential`) checks the contract comparator
against the real TypeScript matcher so the two cannot drift while each still
passes its own self-authored expectations. The hand-authored corpus
`corpus/matcher-differential/cases.json` holds 44 cases, each with an `id`, the
expected `vitest` verdict and a `wire` pair: an `observation` (the value under
test) and a `rule` (the matcher, expected value and options).

The harness runs in two passes. First `tooling/matcher-differential.test.ts`
executes the real `expect(...)` matcher for every case and records what Vitest
actually decided in `.jait/artifacts/matcher-differential/verdicts-vitest.json`. Then the
Rust target `tests/matcher_differential.rs` replays each wire pair through
`tests/support/tail_assertions.rs` and requires three verdicts to agree: the
committed golden, the observed Vitest result and the Rust comparator result.
Either half failing fails the harness, and a divergence is reported with the
case id and both verdicts.

The Rust target skips unless `JAIT_MATCHER_DIFFERENTIAL=1` is set, which the
harness sets automatically, so a plain `cargo test` never fails for a missing
verdict file. Regenerate the verdict file by rerunning the harness whenever the
corpus changes. This is comparator evidence, not a full Rust-runtime parity
claim.

## Independent consent safety checks

`node tests/contract/run.mjs test --test consent_invariants` runs 18
requirements-based lifecycle scenarios through the real TypeScript consent
manager, executor, and trust engine. Rust requires zero effects before approval,
after rejection/shutdown/timeout, during dry-run, or when cancellation occurs
before execution (including approval/cancellation races). Both local registry
and remote delegate dispatch are exercised with inert effect counters.

The same oracle must reject five disposable source mutations that remove the
entry cancellation check, permit execution after late approval, bypass rejection,
start execution before a decision, or ignore dry-run. A copied unmodified source
must pass; compilation errors and timeouts do not count as caught mutations.
The contract workflow runs these checks independently of translated declarations.

This suite exposed cancelled calls executing and gaining trust despite the
original 13 executor tests passing. Before/after and mutation evidence is saved
in `.jait/artifacts/test-strength-consent/`. It checks whether work may begin;
already-running tool cancellation remains the tool implementation's responsibility.
It does not certify prompt cancellation/removal while consent remains unanswered,
all permission policies, or all application security boundaries. No declaration
parity credit is assigned for adding these independent requirements checks.

### Context checkpoint handoffs

`bun run test:contract:unit --test compaction` exercises real agent-loop compaction through the bounded `drivers/compaction.ts` transport. Rust owns the fixtures and assertions for previous-checkpoint continuity across repeated pruning, latest user corrections, full active-turn prefix coverage, recent tool pairs, evidence tails, consistent output caps, cancellation without replacement, and visibly degraded fallback. The explicit CI test list includes this suite.

This currently tests the TypeScript implementation; it is not evidence that a Rust production loop exists. When migrating compaction, retarget this transport to the Rust implementation while preserving the Rust assertions. Mock model responses prove the context supplied and consumed by the loop, not live model summary readability.

## Independent user isolation and recovery checks

`node tests/contract/run.mjs test --test tenant_recovery --test active_stream --test recovery_corpus`
checks behavior beyond declaration translation. The tenant test creates two users
and private sessions, exercises 54 denied requests, and compares complete owned
resources before and after foreign mutation attempts. Three forced process-group
kills/restarts must retain committed structured Unicode state and user isolation.
All server state is disposable and project-local; no provider calls are made.

The active-stream oracle additionally rejects duplicate tool starts, tool results,
and completion events for its deterministic single-tool fixture. The old oracle
accepted these duplicates; the new negative controls are exercised against both
a minimal trace and the actual socket trace. This does not certify arbitrary
multi-tool workflows or every route/database domain. The recovery corpus still
has the historical-fixture and populated-domain limits documented in its review.

## Initial native implementation lane

`bun run test:gateway:rust` runs `tests/gateway_rust.rs` against the real
`packages/gateway-rust` library and production entrypoint. Cargo compiles that
entrypoint as the `gateway-native` test binary. The suite covers isolated config,
loopback enforcement, bind failures, health JSON differential checks using the
existing TypeScript handler, concurrent HTTP/HEAD/query behavior, unsupported
routes, process startup without Node/Bun/PATH, and SIGTERM cleanup on Unix.
Artifacts are under `.jait/artifacts/gateway-rust/`.

This is an initial component suite. The full HTTP/SSE acceptance profile still
requires APIs the native gateway does not implement; it must continue to fail
against this partial backend. No full parity or replacement-readiness credit is
claimed. The existing TypeScript-backed suites remain in place.

## Declaration milestone and explicit reference integrations

`coverage --require-declarations --evidence-dir .jait/artifacts/contracts` requires
current successful evidence for every reviewed test declaration, including all
mapped variants. The report exposes `declaration_parity_complete`,
`pending_declarations` and `pending_source_reviews` separately. The stronger
`--require-parity` gate retains its existing meaning: both declarations and
runtime-source coverage reviews must be complete. Neither gate establishes
native gateway implementation parity.

Two additional opt-in reference profiles retain their original assertions:

```sh
node tests/contract/run.mjs translated-report --profile filesystem
JAIT_TEST_OLLAMA_MODEL=gemma4:e4b node tests/contract/run.mjs translated-report --profile ollama
```

The filesystem profile requires the actual unprivileged permission-failure and
recovery test. The Ollama profile requires all three real-server declarations,
including cleanup. It calls only `http://127.0.0.1:11434`, checks the installed
model inventory with proxies and redirects disabled, and rejects remote/cloud
stubs or missing GGUF models. Only the selected Ollama peers receive the chosen
model and fixed loopback URL; other peers retain their cleared environment.
Model peers have a 330-second transport deadline; all other peers retain their
120-second limit. Required integration skips cannot count as passing evidence.

Generated observations preserve nested function and AbortSignal identity, so
deep equality and call-argument checks distinguish equal-looking references.
Transport regressions exercise both shared and distinct references; reference
execution still requires a separate source/assertion review before credit.

## Reconciled native/reference source reviews

`node tests/contract/tooling/native-source-review.mjs` executes the explicitly
reviewed source registry in `reviews/native-source-reconciliation.json`. Each
entry preserves the original component review, scope limits, source SHA-256 and
exact Rust test IDs. The runner bounds suite concurrency, rejects missing/skipped
results and source drift, and writes a TypeScript-reference evidence report to
`.jait/artifacts/contracts/native-review-*/`. It awards no native progress.

After reviewing a successful report, `--apply <report.json>` validates current
source fingerprints and updates the corresponding source inventory entries.
This is separate from `tooling/source-review.mjs`, which requires reference
source mutation/restore controls for its authored runtime vectors. CI runs both
lanes before auditing current evidence. Neither lane proves production startup,
all-platform compatibility or complete source branch coverage.

The session HTTP reference explicitly supplies a disposable `JAIT_WEB_DIR` with a
minimal index page. This selects the existing production SPA fallback, matching
the native session router's documented response profile, and restores/removes
the fixture afterward. Without it, a checkout with no web build uses Fastify's
other 404 envelope and made the suite depend on ambient build output. The
API-only server fallback is a separate server-composition coverage gap; this
fixture does not credit that branch or waive any pending source requirement.
