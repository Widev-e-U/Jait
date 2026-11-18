# Reference source runtime reviews

The inventory started with 1 verified source (command-timeout.ts) and 360 pending
sources, independently of 2,792 mapped test declarations. The current registry contains 174
source reviews across runtime modules, re-export barrels and erased type modules. Source counts are equal-weight inventory progress, not implementation
effort, measured branch percentages or whole-gateway equivalence.

`../source-reviews.json` is the per-source behavior and decision table. Each entry
names every associated vector and one source mutation. `../vectors/sourcereview.json`
contains 1,282 authored input/expected-output scenarios. Rust runs the production
TypeScript through the existing bounded subprocess transport; the bridge supplies
calls and boundary fixtures, with no expected results or pass/fail decisions.

The runtime group covers surface UI policy, assessment leases, ownership replies,
state directory selection, crypto installation, inline email images, preview JWTs,
request origins, Git node selection, shell prompts, LLM request identity, cron
validation, device transitions, both UUID helpers, voice/editor tools, list
previews, swarm rounds, control access, and trust/hook HTTP routes. Fastify route
tests use real registration and injection. Service, WebSocket and audio interfaces
are substituted only at the policy/tool boundary being tested. No provider, TTS,
SSH or external notification request is made.

Barrel reviews assert exact runtime export names and identity with independently
imported defining modules. They additionally reject non-export statements. They
credit the barrel only: dependent implementations and their initialization remain
separate reviews. Type-only reviews require exactly empty emitted ESM and no
runtime exports. Static type/schema compatibility remains a separate migration
gate. No source was waived, excluded from the inventory, or marked implemented
in Rust by this batch.

Run from the repository root:

```sh
node tests/contract/run.mjs test --test source_review -- --nocapture
node --test tests/contract/tooling/source-review.test.mjs
```

The Rust target requires each unchanged case to pass, then copies each module and
redirects its import inside `.jait/artifacts/source-review/`. It requires a real
equality assertion failure after mutation and a pass after restoring the copy.
Production files are never temporarily reverted. Compiler failures, subprocess
failures, missing assertions and fixture setup failures do not count as mutations
caught. A type-only control adds an actual runtime export; a barrel control renames
a binding. Runtime controls change security ownership/locking, limits, routing,
ordering or return behavior. Source, driver, vector, interpreter and Cargo hashes
must remain unchanged while the result is collected.

The target prints its unique project-local `report.json` path. Apply that report
only after inspecting its verdicts:

```sh
node tests/contract/tooling/source-review.mjs .jait/artifacts/source-review/<run>/report.json
node tests/contract/tooling/source-review.mjs .jait/artifacts/source-review/<run>/report.json --apply
node tests/contract/run.mjs coverage --require-declarations
```

The first command validates without writing. Promotion checks every required
current SHA-256, the inventory's existing FNV source fingerprint, exact scenario
membership, all passing results, and one assertion-failing/restored mutation per
source. It updates only reviewed source entries. Tests reject stale source or
interpreter evidence, incomplete/failed/wrong-backend reports, borrowed mutation
cases, fixture failures and failed restoration.

Limits: these are reference runtime reviews on Linux. They do not establish native
Rust runtime completion, all supported platforms, measured source branch coverage,
complete interface coverage, historic database compatibility or replacement safety.
Unreviewed source entries remain pending and the overall parity gate remains closed.

The second runtime batch adds worktree metadata mounting, terminal output slices,
usage freshness/backoff/capacity, Linux sandbox owner identity, diagram and link
validation, and mobile alarm context/delivery. The empty/reversed terminal slice
reproduction returned `ab` instead of the expected empty string before the root
fix, and passes unchanged afterward. The production files stay intact during
mutation controls, including this fix. Source-copy imports preserve both quote
styles, parent paths and package resolution; restored barrel identity checks
ensure the copy still exercises the original dependent modules.

The next batch adds node registry state transitions under an injected clock, project
transfer process arguments using local ssh/scp stand-ins, and notification detail
normalization and request construction with a mocked completion boundary. The 11
new scenarios cover gateway-node exemptions, client replacement, literal path
quoting, validation and process failure order, exact truncation boundaries and
provider failure fallback. Their source mutation controls bypass the gateway
exemption, disable SSH BatchMode, and change the notification size limit. No
remote process or model request is made. Transfer timeout/maxBuffer exhaustion,
notification timeout firing and live model quality remain separate checks.

The following batch adds the production container metadata parser and Docker
inventory cache/batching policy, maintenance-tool service/notification handling,
and Linux Ollama setup metadata. Docker and maintenance use explicit injected
boundaries; Ollama setup uses isolated project-local files and real stat/access
permission outcomes. Tests neither contact a daemon/provider nor execute an ACL
command or maintenance check. The source controls move the cache expiry by one
millisecond, invert the single-repository result message decision, and reverse
the local-versus-remote setup branch. Default Docker process/socket selection,
multi-location credential search and non-Linux setup remain separate checks.


The continuation adds enabled-only skill discovery and ID-owned file reads, skill-management handlers, and pinned remote email image loading.
The image loader accepts an explicit transport boundary with its original HTTPS and DNS
functions as defaults; fixtures use this boundary because Bun does not replace built-in
HTTPS exports through mock.module. URL, MIME/status, byte limits, timeout and close
cleanup remain production behavior. The route review credits handler behavior, not
application-wide authentication or tool installation.

Further fixtures execute shell integration copy/generation and desktop dependency staging
inside synthetic package trees with an unrelated CWD. They check literal bytes, generated
exports, stale/missing checks, browser bridge delivery, cyclic dependencies, nested versions,
optional dependencies, package file selection, manifests and failure order. The Graphify
runner uses explicit execution/runtime boundaries and real local output-path probes; its
default runtime installer and process adapter remain separate. Update-error classification
and sandbox background startup/completion/cancellation execute with deterministic local
fixtures. The sandbox manager and container policy are not replaced by these source reviews.

The latest applied report is
`.jait/artifacts/source-review/ff2ab49f-85c7-4443-9f5d-851e7e154ea6/report.json`
(825 scenarios and 135 mutation controls). The applied inventory contains
225 verified sources out of 364; 139 sources remain pending.
Copied-driver scratch paths resolve through the same explicit project root as normal runs.
Fixture setup failures encountered during authoring granted no review credit.


The assessment, workbench and environment route batch uses real JWT validation,
Fastify registration/injection and in-memory SQLite. It checks foreign/deleted sessions,
foreign project owners, gateway versus remote execution nodes, all workbench endpoint
forwarding/status/error paths, optional monitor registration and execution context,
repository/node/provider projection and host-row decoding/order. Service/tool boundaries
are local spies: no scan, scheduled job, finding verification or provider discovery runs.
Only ISO timestamp syntax is normalized. These handler reviews do not replace the
independent assessment engine, authorization scope, scheduler or exposure checks.


The validator/persistence/core-tool batch covers real schema coercion and conditional
requirements, sub-agent extraction/stubbing/upsert payloads and write-failure isolation,
streamed/provider/API thread-title paths and cleanup, read range/UTF-8/line boundaries,
edit modes and literal byte preservation, web dispatch and partial batch failures,
terminal factory/input forwarding, security-tool ownership/vantage/status/history,
team-chat attribution and agent profile defaults/update/read-only policies. The shell
asset review checks exact embedded bytes against independently read authored assets;
it does not credit shell execution. Large read fixtures are generated inside the bridge
so they cannot exceed the unchanged 64 KiB request boundary. Neither the team nor the
security fixtures invoke real deliveries or assessments.

Filesystem selection/search reviews cover remote platform ownership and deepest roots,
local helper exceptions, real project-local stat probes and scoped surface construction,
relative/file search roots, projection and opposite-interpretation retries. Underlying
PathGuard, search-engine/process and remote transport behavior remain separate reviews.

The channel/store/filesystem handler batch exercises real Fastify injection and channel
JWT validation, credential redaction and patch semantics, lifecycle option filtering,
store query/enrichment/timeout/install boundaries, local browse sorting/exclusions and
remote proxy errors. No store install, messenger connection or remote browse occurs.
Windows filesystem roots and app-wide authentication are not credited by the Linux
filesystem/store handler reviews. Pending source entries retain those broader gaps.


The protocol adapter review uses owned in-process HTTP/TLS/SSH servers on ephemeral
loopback ports. It checks GET/headers, no redirect following or sensitive-header/body
retention, the exact body-consumption cap, certificate identity/trust/validity windows,
SSH self-report/bounds, cancellation and rollback fields. A synthetic key/certificate is
embedded in the hashed bridge; no existing service is contacted. Bun TLS fixtures pin
TLS 1.3. Timeouts, failed handshakes and older protocol acceptance remain separate gaps.
Bun's extra SSH end-event coverage gap after destroying an oversized stream is retained.

Messenger history fixtures use synthetic base58 recovery keys and local native/WASM
crypto substitutes. They check backup matching, forced room/session IDs, the 50000-entry
limit, decoded-key clearing, import/export and decrypt resource release on all authored
failure paths. Actual cryptography, backup-server authenticity and platform bindings
remain separate. This batch changes no production source.


Workbench tool fixtures cover every fixed check profile, operator/node/signal
forwarding, evidence projection and result fallback, as well as stored monitor job
input authority, authorization before scheduling, 15/30/60 cron generation, ownership,
expiry disabling and compatible completed baselines. Services and scheduler are spies;
no findings, scans, verification, exports or persisted monitor jobs are created.


Catalog fixtures check live versus MCP visibility, page membership and available/missing
references, floor/clamped pagination and deferred schema lookup after oversized payloads.
Network-tool fixtures use a scanner spy and real in-memory SQLite for cache/summary and
upsert preservation, including failed writes. They do not credit legacy scanner scope,
authorization or cancellation: that implementation remains pending separately.


The protocol bridge additionally asserts that every returned observation names the exact
port bound by its fixture server before normalizing that ephemeral value. A prior run
completed its fixtures while a concurrent Cargo.toml edit changed a hashed input; that
run received no fresh evidence credit. The canonical report above was rerun after the
manifest stabilized. The evidence gate and declaration inventory remain mandatory.


Pi MCP provisioning fixtures validate the project-local temporary directory before calling
production provisioning. They check transport payloads, duplicate/prototype names,
provider/session gating, per-session isolation, permissions and cleanup, and execute the
POSIX wrapper with a synthetic command whose path/argv contain shell metacharacters.
No Pi/provider is launched. Windows and filesystem-failure paths remain separate gaps.


Evaluation startup, bootstrap, sandbox background processes and Go vendor translation
now have 56 additional authored scenarios (398 total, 118 source controls registered).
These additions passed the full runtime/mutation review and received inventory credit.
The two process launchers accept an explicit spawn dependency with the existing
production default; all fixture processes are simulated and temporary state stays
under project artifacts. The pre-aborted async path varies between the exact supplied abort reason and
undefined under Bun depending on bridge loading. The fixture normalizes only
those two rejection values to `Pre-aborted`, while requiring zero settings fetches,
state creation, timers or process launches. The child bootstrap uses
one import per process because Bun caches top-level execution despite query strings.
Go streaming fixtures keep the upstream open through completion/error/cancel so
cancellation is observable instead of racing a fully buffered closed stream.

The provider-auth/update batch adds 59 cases for synthetic OpenSSH Ed25519 keys,
fixed-origin signed requests, identity and local-fallback policy, provider update
allowlists, version parsing, caching/concurrency, lifecycle and update command
construction. The inherited-property provider regression (`constructor`, `toString`
and related names) failed before the production lookup changed to own-property
membership and passed afterward. Process/fetch functions are spies; no updater,
installed credential, cloud request or daemon is used.

Mail connection and code-graph fixtures add 105 cases. Mail checks strict schemas,
header rejection, injected DNS pinning/private-address rejection/timeouts, the fixed
Thunderbird origin, secure protocol choice, chunk/byte/XML limits and stream cleanup.
The optional DNS resolver retains the original production default. Graph fixtures
check exact GraphRAG rows and real project-local JSONL/manifest files, all five tools,
and all six HTTP routes with real JWT validation and Fastify injection. No indexing,
mail connection or provider call runs. The full report includes a passing baseline,
assertion-failing mutation and restored pass for every source; fixture setup failures
during authoring granted no credit.

An additional 86 cases cover all configured model-backend branches and legacy fallbacks,
metadata list/search visibility and rank forwarding, container live-view queue limits
and release after failure, and PTY client framing/messages/timeouts/stop cleanup.
The PTY client accepts an optional launcher with its original spawn default. Sandbox,
ranking/model and process boundaries are synthetic. Host live-view launch/display
readiness, actual ConPTY/broker integration and process-exit races remain separate.


Gmail, Outlook and IMAP add 97 synthetic mailbox cases. They exercise request
origins/headers/payloads, list bounds, summaries, MIME bodies and inline images,
HTTP/JSON/network failures, send/reply/tag/trash behavior, IMAP UID validity and
10 MiB limits, read-only locks and cleanup, special flags and SMTP TLS settings.
Gmail inherited folder names reproduced a wrong-label bug: `constructor` became
JavaScript function text. The unchanged regression passes after mapping only own
system-label keys; `__proto__` is also preserved as a custom label. No mailbox or
network was accessed by these fixtures.

Configuration, staged updates and private desktop/PTY entrypoints add 80 cases.
Configuration fixtures clear/restore relevant environment variables and assert
secret format/stability without returning generated credentials. Updates use real
isolated package trees and command/service spies: install validation, lock refusal,
cleanup, backup retention and rollback are verified by reading the actual active
version before and after failure. Health polling uses synthetic time and responses.
Node VM entrypoint fixtures link synthetic process/readline/PTY/gateway dependencies
while desktop filesystem/crypto operations stay inside the project artifact tree.
They verify launch guards, private files, live/stale locks, readiness, stop/EOF and
startup-failure behavior without starting a gateway, service or PTY.

At this checkpoint, workspace and driver typechecks, strict lint on the changed
runtime/driver files, the declaration coverage gate, artifact-path guard, evidence
validator tests, all 825 source scenarios and 135 before/mutate/restore controls
pass. Targeted Vitest validation passes 56 tests in eight files; a separate rerun
of project WebSocket sync plus provider updates and mail connection passes 22 tests
in three files. The initial complete workspace attempts failed with a closed Matrix
`OlmMachine`, allocator corruption and `ERR_IPC_CHANNEL_CLOSED`. Server construction
was restoring saved Messenger sessions because tests lacked isolated default state.
The test setup now assigns each file a fresh project-local state directory. The
worktree expectation follows that configured state root. The latest full workspace
run passes 5,340 tests (78 skipped) in 547 passing files, without the Matrix crash:
`.jait/artifacts/source-review-authoring/workspace-tests-current.log`. The initial
failure logs remain in `workspace-tests.log` and `workspace-tests-serial.log`.

The fresh translated run passes 3,115 cases (50 skipped), with all 2,815 test
declarations verified. The source-runtime report
`.jait/artifacts/source-review/29057809-2e56-401d-ac7a-53b59b9ef4d9/report.json`
passes 911 scenarios and 144 before/mutate/restore controls. Its evidence validator
has applied credit to 232 of 364 source files. This includes the new agent-control,
attention, mobile-push, permission/profile and original-fixture reuse reviews.
Copied subjects resolve their original package boundaries; source overrides load
through Bun only after fixture dependency mocks, avoiding premature real dependency
initialization. No mutation touches a production file.

The next 157-source run reached its final fingerprint check after all scenarios
and restored mutation controls, then correctly rejected a concurrent edit to
`thread-title.ts`. That failed run grants no credit. The source inventory has been
recaptured and the new rejection of tool-protocol titles is covered by 26 marker,
wrapper, payload and near-prefix inputs, with an explicit guard-removal mutation.
The changed API error is asserted exactly. Two changed original test files were
regenerated; all 29 existing matcher registrations retain identical rules, and
three new declarations remain pending fresh source-bound translated evidence.

Seventeen additional source reviews (203 new scenarios), plus the title refresh,
are now registered for the next full source gate: 161 sources, 1,115 scenarios and
161 restored mutation controls. This includes 49 manually authored Home Assistant
cases across all three tools and the original-fixture memory, channel and team-room
reviews. Each review records its exact tested behavior and coverage gaps;
registration or an authoring probe grants no inventory credit. Real process
execution, provider requests, messaging, device control, containers and live speech
services use isolated fixtures. Filesystem checks use owned project artifacts.
Reference behavior, native Rust implementation and production activation retain
separate acceptance gates.


The 161-source report
`.jait/artifacts/source-review/a274a1b3-d6a9-4b3e-b826-a2582edf6d1d/report.json`
passed its fresh-evidence validator and has been applied: 249 of 364 reference
sources now have review credit. The later translated run passed all 3,128 cases
(50 skipped), but a concurrent change to the native ACP launcher contract made
its final source fingerprint differ. That run grants no declaration credit.

Ten additional source reviews are registered for a fresh gate: file, email and
computer tools, ACP registry, model catalogues, quota fetchers, email-account and
pull-request routes, usage persistence, and the non-writing skill/extension handlers.
They add 130 scenarios for 171 sources, 1,245 scenarios and 171 controls overall.
The ACP constructor regression preserves textual IDs in both implementations;
its five original declarations must receive fresh translated evidence before the
reused source oracle can run. A first source attempt correctly refused those
pending declarations rather than treating registration as review credit.

The new source-copy authoring probes pass all 99 scenarios for the six later
sources, detect each targeted mutation, and pass again after restoration. These probes are authoring
checks; only the complete source gate can promote inventory entries. Browser
DevTools remains unregistered because the generic reuse boundary explicitly
requires its dedicated Node transport fixture. Skill authoring fixtures that
change HOME are excluded from the non-writing handler review. No mailbox,
provider, extension installation, external pull-request operation or user
notification is performed by these new fixtures. The consolidated run records
its current phase and final report paths in
`.jait/artifacts/source-review-authoring/consolidated-status.json`.

The translated evidence snapshot now uses the explicit `translated-reference-v1`
scope. It retains every gateway/shared source and original test, fixture,
assertion interpreter, contract source, vector, corpus and dependency manifest;
only flat `gateway_rust.rs` / `gateway_rust_*.rs` native-component test targets and flat `native*.ts`
component drivers are outside this target's fingerprint. They are not executed
by `tail_static` and retain their native gate. Other reference runners still use
the full snapshot. Coverage accepts the narrower snapshot only for the six named
translated profiles and requires its exact complete fingerprint; unknown scopes,
missing inputs and failed cases do not grant credit. Owned-file regression
fixtures check mutation/restoration across required input classes, separate-native
file changes, new fixture addition, scope/profile validation and failed-report
handling without touching production files.


The fresh scoped translated report
`.jait/artifacts/contracts/5c26c17a-fea6-413a-acd8-9672cf5ab86b/report.json`
passes 3,128 cases with 50 explicit skips and unchanged scoped inputs. It grants
fresh evidence to all 32 title/project and five ACP registry declarations. The
merged inventory has 2,819 verified declarations (2,818 current and one retained).
The source gate for 171 sources and 1,245 scenarios remains active; its success
and validated application, followed by coverage and native checks, are still
required before the additional sources receive credit.

The 171-source report `.jait/artifacts/source-review/26e44f56-db3e-4246-80ee-42184e7d7171/report.json` passed all 1,245 scenarios and 171 mutation/restoration controls, and its validated application raised reference credit to 259/364. The consolidated gate then stopped at native formatting. Subsequent OAuth expiry fixes invalidate the prior CalendarService source credit until refreshed. Three additional registered reviews cover mailbox and calendar callback expiry, boundary and replay behavior, plus update asset selection (37 scenarios, three controls). Registration grants no credit; current declaration translation and the full 174-source gate remain required. All 19 prior mailbox/calendar matcher rules are preserved; four new declarations await fresh evidence.
