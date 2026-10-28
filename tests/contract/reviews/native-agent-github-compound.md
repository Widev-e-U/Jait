# Durable GitHub callback composition — partial, uncredited

2026-10-26. Extends native-agent-github-challenge.md and supersedes its statement
that HTTP callback enforcement is absent. Production remains TypeScript.
No new component credit; the service, host and route are still incomplete.

The HTTP callback now passes scalar signed state, signed owner fields and optional
code/installation into one CompleteCallback operation. NativeGithubPort validates
the request before admission and retains one owner lease across both SQL/effect
phases. The canonical service validates the signature/owner again, then uses the
existing challenge capabilities to reserve, dispatch and atomically commit each
phase. No SQLite connection crosses an outbound await. Queued/started SQL retains
the owner lease even after caller cancellation. This composes the existing store;
there is no duplicate implementation, generic callback bypass or runtime startup.

## Compatibility decision and actual client evidence

The unmodified TypeScript service/routes remain the differential reference.
Valid issued two-stage and combined setup, redirect encoding/error truncation,
missing-input admission and authenticated manual installation retain public
responses. Tests compare public results/effects separately from changed internal
port ordering, and explicitly assert the new compound call sequence. TypeScript
reference results are retained for intentional differences:

- A signed token without a matching persisted challenge has no callback authority.
  Setup replacement, manual save and disconnect revoke older setup state.
- The absolute 15-minute deadline includes issue time and excludes expiry.
  Conversion does not renew it. Time before issuance fails closed. These are
  actual HTTP client checks in addition to the store and service tests.
- Exact same-phase input replays a bounded public result without outbound I/O.
  Changed code/installation, wrong owner, wrong App or changed credential binding
  cannot use an old phase result. A manifest code supplied for an existing App
  without a recorded matching conversion is rejected rather than silently skipped.
- Reservations record uncertainty durably before dispatch. A remote failure,
  cancellation, lost response or failed local transaction cannot authorize retry
  with the same state. Fresh authenticated setup is the explicit recovery path;
  it replaces challenge authority but cannot undo an already dispatched remote
  effect. Two-stage local credential/replay commits remain atomic per phase,
  rather than claiming an external two-phase transaction.
- Repeated state is an invalid-state redirect before parsing/effects. Repeated
  code or installation is an invalid-callback redirect before compound admission.
  Empty/missing code and installation keep the missing_code redirect. Inputs to
  the compound service are bounded to 8 KiB. Missing/repeated input does not
  consume a valid challenge. UTF-16 error truncation/redirect escaping are retained.
- The old Get/CompleteSetup/AttachInstallation interleave seams are removed from
  the callback. A real HTTP comparison demonstrates that a hook on the old Get
  seam no longer runs; the reference still observes the old disconnect boundary.
  Authenticated manual installation retains its independently owned operation.

## Validation and limits

`gateway_rust_github_challenge_flow` covers exact replay, two-stage deadlines,
legacy/wrong-owner/revoked state, existing-App installation, transport and local
transaction failures, safe release of pre-dispatch failures, a lease spanning
both effects, cancellation uncertainty, stale success/failure across two ports,
bounded inputs and reopening a full worker/service over a persistent database.
`gateway_rust_github_composition` uses real HTTP, SQLite and encrypted fixture
secrets; it records native/reference differences, replay, exact deadline,
clock rollback, malformed inputs and explicit fresh-setup recovery. The scripted
route tests separately check the typed operation handoff and presentation.

Evidence is recorded in
`.jait/artifacts/gateway-rust/agent-github-compound/partial-result.json`, including
frozen source hashes, focused contracts, library/Clippy/format/artifact gates,
negative controls and restoration. Initial failing logs are retained separately
and do not count as passing evidence. No full current native gate is claimed.

Expiry cleanup is explicit but still unscheduled for idle owners. Installation
URLs still omit signed setup state; state-bearing URL issuance/browser integration
requires further work. No external GitHub browser or network was contacted.
Cross-process callback lifecycle (beyond the tested store races/reopen), process
kill during SQL commit, host deadlines/shutdown, direct identical-credential ABA,
cache App binding/residency, webhook sink lifecycle/idempotency/fencing and broader
Date.parse remain open. This callback change does not settle those boundaries.
Native-only schema extension and shared TypeScript schema-version isolation remain
as described in native-agent-github-challenge.md. Scope/consent/SSRF boundaries and
concurrent work are preserved. Counts remain 228/370 original plus 5/6 added
components (233/376 current), with 142 originals and one addition pending.
Platform/load/soak/recovery/rollback/activation gates remain open.

Frozen/restored validation: **131 focused checks**, **338 library tests**
(including 20 substantive challenge checks and one child harness), strict native
Clippy, native/contract formatting and artifact checks pass. Six isolated controls
catch HTTP state handoff, compound owner admission, conversion public shape,
expiry, replay input identity and stale local apply. Focused totals include
repeated internal-driver self-checks; they are not 131 unique differential cases.
No native GitHub executable source drift is accepted. Final documentation changes are audited
separately from the frozen runtime. Concurrent browser integration test edits
(project screenshot paths and selector timeout) are recorded in
concurrent-reference-test-drift.json. The live artifact gate passes; this slice
does not revalidate browser runtime behavior or assert whole-repository equality.
Counts and full-gate limits remain unchanged.
