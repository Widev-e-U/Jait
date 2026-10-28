# Native Rust gateway

## Live ledger audit — 2026-10-28

The original manifest contains 370 paths; the current inventory records 376,
including six later additions. The live ledger records **236 originals as verified**,
**87 originals as implemented but unverified**, and **47 originals without a
ledger entry** (323/370 originals have a ledger entry). Five additions are recorded as verified
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
