# Gateway migration to Rust

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

The tracker now has **16 implemented-but-unverified originals** and **118 other
incomplete originals**. Historical verified coverage stays **236/370 originals**
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


## Scoped Git and STT continuation — 2026-10-27 (uncredited)

Git execution now rejects explicit remote node selection before authorization,
shares the request deadline across authorization and process execution, and bounds
aggregate output and command/file-read counts. Unix worktree reads use directory
handles with no-follow and nonblocking opens, preventing ancestor symlink escapes
and FIFO hangs. In-root symlinks are intentionally rejected; Windows worktree
reads fail closed pending an equivalent handle-scoped adapter. Nine Git execution
tests pass, including authenticated native init/status against an isolated fixture,
owner/root denials, cancellation, traversal and output budgets. Nine handlers remain
explicitly deferred; remote routing and runtime authority composition are open.

STT destination expiry now cancels pending response headers and body reads and
releases the socket. All 18 voice checks pass, including this new regression.
The recovered Home Assistant slice passes all 10 checks; the prior repository
route run passed five. These are focused implementation checks, not differential
parity or final acceptance. No broad gate or coverage recapture ran. Coverage
remains **236/370 originals** plus **5/6 additions**; production remains TypeScript.
Source hashes, logs and remaining integration gaps are recorded in
`.jait/artifacts/gateway-rust/implementation-resume/resume-checkpoint.json`.

## Implementation-first parallel continuation — 2026-10-26

The saved goal now follows parallel implementation → integration → final validation
→ focused failure repair → verified completion. Workers own separate email,
maintenance/retention, and skills/ClawHub modules; the coordinator owns shared
registrations, dependencies and SandboxManager integration. Compilation and focused
checks resolve concrete implementation uncertainty. Full native gates, broad
differential suites, mutation campaigns, coverage recapture and repository checks
are deferred until the remaining implementation is integrated. No broad suite is
rerun merely to refresh a checkpoint.

Historical verified baseline: **236/370 originals (63.78%, 134 remaining)** plus
**5/6 newer additions**, or **241/376 current (64.10%)**. A read-only reference
fingerprint audit found zero drift in those 241 recorded reference sources. This
is not a new native validation pass. Implemented-but-unverified work receives no
coverage credit. Per-component state, worker ownership and the initial native
source hashes are recorded separately in
`.jait/artifacts/gateway-rust/parallel-implementation/status.json`.

Current unverified implementation: **12 original components** are recorded
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


## Agent entrypoint and architecture improvements

Before selecting a port, read the [architecture decision](gateway-rust-architecture.md)
and its [session ownership and concurrency guidance](gateway-rust-architecture.md#session-ownership-and-concurrency),
then audit `packages/gateway-rust/native-coverage.json` and live source drift using
the [runtime verification instructions](../packages/gateway-rust/README.md).
The architecture review dated 2026-10-24 records existing code, proposed changes,
primary Rust/Tokio/SQLite references and executable acceptance criteria.

For concurrency work, also read the [capacity roadmap](gateway-rust-capacity.md).
It separates subscriber capacity from active turns and execution resources, records
current limits and proposes staged acceptance checks for R08/R29/R30. Existing
production and compatibility gates still apply.

### Long-term concurrency ambition: thousands and beyond

The maintainer's goal is to support as many concurrent sessions as practical,
including many thousands and eventually more than 10,000 where measured resources
allow. Treat concurrency as an ongoing migration objective: **500 is an early
validation milestone, not the destination or an architectural ceiling.** Progress
through 500 → 1,000 → 2,500 → 5,000 → 10,000 simultaneous sessions, then extend the
capacity curve beyond 10,000. Measure connected sessions, mixed resident sessions
and actively streaming provider turns independently; queued turns do not count as
simultaneously active generation.

Optimize for the highest sustainable concurrency within explicit CPU, memory,
provider and execution budgets while keeping interactive control responsive,
owners progressing fairly and cancellation/recovery correct. Record the highest
passing workload, hardware, resource cost and limiting factor at each stage.
Thousands of sessions can share bounded execution capacity; CLI agents, browsers
and scans retain separate measured budgets and authorization limits.

Start with the efficient single-process local gateway. If measurements show a
single-host limit, evaluate authorized execution nodes and, only through a separate
architecture/recovery review, multiple gateway owners. The capacity roadmap defines
the evidence needed for each stage. This is an unmeasured ambition, not a shipping
capacity claim, raised default, unlimited admission policy or reason to delay the
existing replacement gates until the final stretch target is reached.

Prioritize these improvements within the existing R09–R27 domain slices:

1. One owner per active session; compose admission, provider lifetime, steering,
   approvals, cancellation and finalization behind it. Run independent sessions
   concurrently and keep control commands responsive during provider waits.
2. Track turn/effect tasks, preserve authority at every effect, and retain resource
   capacity until actual cleanup finishes, including blocking and remote work.
3. Bound queues and bytes, retain committed event ordering and replay, and test
   slow subscribers, restart and overload.
4. Keep SQLite writes serialized and short; separate CPU work from async I/O.
   Add read lanes or CPU pools only when measurements justify them.
5. Keep tools sequential by default; opt reviewed independent operations into
   bounded concurrency with resource-conflict checks and stable result ordering.
6. Make recovery, revision checks, typed authority, fair admission and redacted
   queue/latency diagnostics part of the relevant port's evidence.

These are design requirements and recommendations for incremental implementation,
not completed migration components. Intentional behavior changes need an explicit
compatibility decision and client tests. Use the architecture document's priority
and acceptance table alongside R05–R08 and R29–R30; the historical checkpoints
below do not certify these proposals or the current workspace. Documentation
changes add no native or reconstructed-test credit and do not authorize cutover.

## Practical concurrency delivery plan and likely pain points

Planning assessment: 2026-10-24. Thousands of coordinated sessions are a plausible
engineering ambition; sustainable active generation also depends on provider
throughput, quotas and execution hardware. No load result establishes these targets
yet. Use the [capacity roadmap](gateway-rust-capacity.md) for workload definitions,
thresholds, resource budgets and artifact locations. Re-audit the live source
before implementing any observation below; these are investigation priorities,
not measured bottlenecks or completed migration work.

### Implement in this order

1. **Build the measuring harness first.** Use an isolated project-local database,
   a deterministic barrier provider for lifecycle assertions and a real loopback
   HTTP/SSE provider for transport measurements. Prove requested active streams
   overlap. Measure gateway and process-tree memory, DB admission wait and service
   time, delivery latency, control responsiveness and cancellation cleanup.
   Include long histories, slow readers, synchronized starts and reconnect bursts.
   Keep real provider capacity and paid integration tests separate from gateway
   coordination results; do not load-test the live workbench.
2. **Make one local gateway efficient.** Prioritize incremental message projection
   alongside the harness: compare work per append as history grows and preserve
   atomic event/projection updates and commit-before-publish. Reuse compatible
   HTTP clients with request-scoped credentials. Compose session lifecycle under
   one owner; admit provider streams, processes, CPU work, DB jobs and buffered
   bytes through separate bounded budgets. Add fair scheduling across owners and
   providers, with responsive control paths during bulk work. Preserve existing
   authority, ordering and recovery contracts through differential tests.
3. **Advance through measured stages.** Establish 100 and 500, then test 1,000 →
   2,500 → 5,000 → 10,000 and beyond using the same workload definitions. Each
   stage must preserve the reviewed latency/correctness outcomes, survive the
   defined soak and cancellation/reconnect cycles, and stay within a predefined
   resource budget. Publish the highest passing point and first limiting resource.
   Optimize that bottleneck before increasing admission; failed or rejected stages
   remain visible as unsupported. Capacity evidence remains separate from native
   component credit and production replacement gates.
4. **Distribute the measured bottleneck.** Add explicitly authorized execution
   nodes for expensive tools when local CPU, process or memory budgets bind.
   Measure their contribution separately from gateway stream capacity. Consider
   multiple gateway owners only after a separate ownership/persistence/recovery
   review covering exclusive session ownership, authority fencing, routing,
   quotas and network partitions. Keep SQLite WAL on one host; shared network
   storage is not the gateway scaling plan.

### Pain points to investigate

| Likely pressure point | Current evidence or scaling risk | Planned response / evidence needed |
| --- | --- | --- |
| Persistence amplification | Each native turn-event append calls message projection, which rebuilds that session's native message rows; long histories increase transaction work | Measure append cost against history size; implement equivalent incremental updates with a bounded recovery rebuild and differential transcript tests |
| Resident memory | Serialized and parsed histories, tool output, stream buffers and replay can all remain live or be copied | Load context on demand, share immutable data where appropriate and bound aggregate bytes; report incremental memory per connected, resident and active session |
| Provider throughput | Gateway concurrency cannot establish inference throughput, token/request quotas or affordable operating cost | Track provider concurrency and rate budgets separately; measure real integrations independently and expose bounded waiting/fair allocation |
| Heavy execution | CLI agents, browsers, builds and scans consume different process, CPU, memory and node resources | Give each effect class explicit admission and cancellation limits; add authorized nodes only where measurements justify them |
| Cleanup and recovery | Cancellation can leave child processes or uncertain external effects; reconnect/restart can expose ownership races | Retain capacity until actual cleanup completes, supervise children, replay durable events and avoid blind retries of ambiguous mutations |
| Streaming and clients | Slow subscribers, reconnect bursts and many rendered conversations can amplify buffering and UI work | Measure fan-out and replay separately, enforce byte/lag limits and test a summarized/virtualized session overview with detailed views on demand |
| Admission and shared resources | The reviewed Rust route defaults to 8 active turns and validates at most 128; the event bus caps sessions and total subscribers at 256 | Re-audit and redesign these limits with resource accounting and fair scheduling; raising constants alone is not evidence of sustainable capacity |

Memory arithmetic illustrates why the session representation matters: 10,000
sessions retaining 1 MiB each consume about **9.77 GiB** for those buffers alone,
before parsed copies, connections, runtime overhead or child processes. This is
an illustrative calculation, not a measured Jait footprint.

The initial engineering priority is therefore **the isolated load harness plus
incremental message projection**. Use their measurements to select subsequent work
rather than assuming Rust, a larger queue or extra machines will remove the
application's limiting resource. Supporting library semantics and primary
references are recorded in the [capacity guide](gateway-rust-capacity.md#primary-references).

## Earlier checkpoint status — 2026-10-25 (233 components)

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

## Previous frozen native checkpoint — 2026-10-24 (230 components)

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

## Historical frozen native checkpoint — 2026-10-23

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

## Tool presentation and evidence compatibility — 2026-10-24

The public project-browser controls are `browser.open`, `browser.close`,
`browser.restart`, `browser.status`, and `browser.logs`; use the existing
`browser.inspect` for page inspection. The managed project runner and its
ownership, URL, node and launch protections remain internal dependencies.
Legacy `preview.*` definitions remain executable for old clients but are omitted
from discovery and model schemas. Recovered activation lists select the new
names. Disable rules apply across both names; explicit canonical policies win,
with legacy policies retained as fallback. This is an intentional discovery
contract change, not an authorization expansion.

Chat labels humanize unknown tool identifiers without renaming execution IDs.
Completed Q&A cards display selected options, custom text and skipped answers,
including persisted MCP envelopes. Browser coverage is in
`tests/e2e/tool-results.spec.ts`; native Q&A payload, registry compatibility,
policy, catalog and schema contracts compare with actual TypeScript helpers.

`context.read` adds optional case-sensitive literal `query` (1–256 UTF-16 code
units), scoped to the same owner/session and expiry as pagination. `offset` is
the search start; `matchOffset` identifies the match; bounded surrounding text
and `nextOffset` permit continued recovery. Missing matches are explicit.
Large model results retain execution handles, small diagnostic/coverage fields
and an identified head/tail excerpt; canonical UI/persisted results stay intact.
Native context-budget and model-result contracts cover search after reload,
Unicode, denied/expired recovery, output bounds and completion diagnostics.

These changes add no native browser-engine or production-readiness credit.
A future native browser adapter must pass the existing browser collaboration,
visible-session, startup/stop, access-control and launch-failure tests in addition
to these discovery and UI contracts. Production remains TypeScript. The reproducible `bun scripts/benchmark-tool-evidence.ts` check writes
`.jait/artifacts/tool-evidence-benchmark.json`. Character
budgets and recovery-call checks alone do not establish model-token cost savings;
whole-task evaluation must include provider/cache usage, latency, retries and
successful completion under representative workloads.


## Browser handoff and question continuation compatibility — 2026-10-24

Intentional correction: a question that returned a transport-level pending result
now resumes its chat when the user answers or cancels; callers no longer have to
send a separate chat message. Other MCP actions pause while that chat's question
is pending. Browser Done is collected through `browser.handoff`, retaining the
browser identity check before transferring control. Unable/cancel never grant
agent control. Attached waits resume directly without a second wake.

Native service observer parity is covered by the differential
`gateway_rust_user_ask_resume` contracts and existing question HTTP tests. The
native chat/MCP/browser runtime must also satisfy the production HTTP continuation,
paused-action and visible-tab regressions documented in
`tests/contract/reviews/native-user-ask.md` before R14/R16/R24 acceptance. This
refresh adds no native component count or production-readiness credit. UI clients
can collapse both prompts into a single line without losing selections, custom
text, or their chat draft.
