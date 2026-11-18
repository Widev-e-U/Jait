# Rust gateway replacement board

Checkpoint: 2026-11-13. This board tracks dependencies, not a parity claim. The
production gateway remains TypeScript until the standalone Rust replacement gates
in `gateway-rust-migration.md` pass and activation is separately authorized.

## Baseline

- `native-coverage.json`: 388 entries: 295 labeled verified, 9 implemented, 59
  partial, 25 absent. These labels are not a current gate-verified count.
- Live reconciliation: 64 source hash drifts, including 14 labeled verified;
  one missing reference and three new live candidates. Evidence:
  `.jait/artifacts/gateway-rust/source-reconciliation-20261113.json`.
- `node tests/contract/run.mjs coverage` failed on eight changed source files
  and two unmapped tests in the existing working tree. It reported 1,458 verified
  test declarations and 1,913 pending requirements; neither figure measures API
  or production readiness. Do not refresh fingerprints without behavior review.
- The last historical full source-bound checkpoint documented in the migration
  guide is not evidence for the current source snapshot. The incomplete,
  heuristic API inventory cannot yield a reliable tested API percentage.

## In-place pilot decision

A Bun-only FFI pilot is not a viable shipped integration boundary: gateway
`start` uses Node, and `scripts/package-desktop.mjs` stages a target-OS Node
runtime and package files. A cross-runtime native addon remains technically
unproven here, including its ABI, artifacts and rollback on each supported
platform. Windows desktop and Linux build paths exist in release workflow; those
are not evidence that a new addon ships everywhere. Existing chat and approval
Playwright tests provide client coverage candidates, but have not tested such an
addon. Any effectful integration must retain the existing authenticated tool and
consent executor, cancellation and permission checks. Rollback would require a
verified previous package and explicit selection of its matching binary; it is
not established by merely falling back on load failure. No production hybrid
pilot is implemented: it would not establish the authorized standalone swap.
Revisit only if a narrowly scoped, cross-runtime, packaged experiment can be
shown without changing the replacement requirement.

## Dependency waves and gates

1. **Evidence and inventory** — reconcile source drift and missing/new files;
   inventory HTTP, WebSocket, background services and all clients; review
   contracts and run the source-bound gate on a frozen snapshot. Open.
2. **Composed runtime and chat** — retain authenticated session ownership,
   durable replay and bounded cancellation; integrate selected configured
   providers and real consent-aware tools. Open. The web request currently sends
   `clientMessageId`, `provider` and often `model`; strict Rust request parsing
   rejects them. Node validates and persists the client ID and returns 409 for
   a duplicate; accepting it without atomic durable deduplication is unsafe.
3. **Remaining native surfaces** — mount and black-box test all routers and
   implement missing background and client surfaces, including ferridriver,
   messenger, teams, forge, preview, updates, Telegram and desktop host. Open.
4. **Replacement evidence** — client and browser smoke, ACP and OpenAI chat
   with tools and consent, differential contracts, recovery and platform tests,
   measured capacity and soak, bounded resources, rollback and activation.
   Full fmt, strict Clippy and tests must pass on the final snapshot. Open.

Next slice: trace client message ID storage and duplicate handling across the
composed route, session lease and durable database; implement the atomic contract
with focused authenticated HTTP and client/differential tests before provider
selection. Preserve unrelated working changes and do not award verified credit.

## Chat history slice — 2026-11-13

The authenticated message projection now returns Node-compatible
`clientMessageId` for existing user rows whose persisted ID starts with `user-`,
while retaining the indexed display ID. This is a history-read slice, not new
turn admission or duplicate prevention. Focused projection coverage checks
pagination, other roles, ordinary IDs and owner isolation. The route still
rejects new `clientMessageId` requests: the native event log and materialized
rows need an atomic identity mapping, duplicate response before stream admission,
and rebuild/recovery behavior before enabling them. Provider/model routing
remains unsupported. The full formatting gate initially found formatting in the clean tracked
`execution/local_deploy.rs`. That file was formatted without semantic changes;
`cargo fmt --check` subsequently passed on the current working tree. Strict
Clippy (`--all-targets -- -D warnings`) also passed on this snapshot. The complete
Rust test suite remains a separate gate; these checks do not establish parity.

### Admission and rebuild dependency

The coordinator appends the user event after the route has returned its stream.
The session lease serializes a session, but cannot guarantee a globally unique
client ID across sessions. The projection currently deletes and rebuilds only
`rust-chat:<session>:` rows; `require_native_history` treats a `user-…` row as
foreign. Consequently, changing the projected row ID alone would make the next
turn fail and could orphan a row during rebuild. Admission must atomically
reserve the global ID, user event, lifecycle/start frame and recoverable mapping,
with ownership and bounded-capacity checks, before returning the stream. Its
failure and cancellation behavior must be tested before enabling the field.
The foreign-history regression now explicitly covers a `user-…` ID; this does
not implement request admission or establish chat parity.

The coverage inventory gate initially failed on source drift in concurrent preview,
messenger, browser and tool changes, including two unmapped browser recording
tests. On 2026-11-13 the inventory was recaptured after reviewing the changes;
changed and new behavior remains pending. The inventory/claim validation gate
passes with 1,920 pending requirements. This is not an API parity measure.

### Pre-stream history validation

The manager now validates the loaded provider history while retaining the session
lease, before returning an HTTP stream. Oversized or structurally invalid history
therefore fails admission instead of producing a later stream error. This is an
intentional provisional failure-order change in the candidate runtime; client
compatibility and Node differential evidence remain outstanding. The focused
manager regression checks that an oversized history releases the admission slot.
The route also checks the incoming user message together with loaded history
before sending headers. The web client source handles non-2xx responses as errors,
but this inspection is not a browser or Node differential test.
This does not reserve or persist a client message ID, and does not establish
replacement readiness.
