# Durable GitHub setup challenge store — partial, uncredited

Historical store-only slice. Callback integration is now reviewed in
`native-agent-github-compound.md`; the limits and evidence below describe this
earlier store checkpoint.

2026-10-26. Continues native-agent-github-setup-journey.md. Production remains
TypeScript. This is an implemented native authority store, with issuance and
revocation composed into the canonical credential service. The callback route
and NativeGithubPort DO NOT yet reserve, dispatch or commit through this store.
Existing callback gap observations intentionally remain passing baseline tests;
no end-to-end TTL, revocation, replay, App binding or callback fencing is claimed.
No component credit is awarded. No activation, deployment, publish or release.

## Implemented boundary

`services/agent_github_challenge.rs` is the single native setup authority store.
A native-only `native_github_setup_challenges` table is lazily created on use;
it does not advance the shared TypeScript schema-version ledger. This is a
candidate-local DB schema extension, not a production migration. One row per
owner retains a positive INTEGER generation across revocation and disconnect.
Overflow fails closed. Fresh setup replaces the previous challenge atomically.
Service setup, validated manual save and disconnect now use immediate SQLite
transactions; challenge issuance/revocation commits with connection/secret
writes or rolls back with them. This intentionally makes failed local saves
atomic. Public success responses and existing actual-service comparisons stay
unchanged. Invalid manual input does not revoke the current challenge.

The store holds a SHA256 digest of the full signed state (including its fresh
nonce), owner pair, generation, issuedAt, absolute expiry, App, a credential
snapshot digest, phase, operation digests, reservation identity and bounded
public replay results. It does not persist raw codes or credential snapshots.
The existing encrypted service still retains manifestState for compatibility.
The token signer must issue fresh unique nonces. Generation fences local
capabilities; it is not currently an extra signed token claim. Keeping the last
state hash through revocation/expiry rejects immediate identical-state reissue;
it is not an archive of every previously issued nonce.

The proposed 15-minute absolute TTL is implemented in the phase API: issue time
is inclusive, expiry exclusive, a time before issuedAt fails closed, and
conversion never renews the deadline. Binding is checked from credentials read
inside an immediate transaction at reservation, dispatch and completion.
State/signature parsing remains pure and does not reserve or consume authority.
Legacy signed state without a matching challenge row cannot reserve an effect.

## Phase and effect authority

Fresh Apps await a manifest; existing Apps with a private key await installation.
Reservation atomically records one effect and a fresh reservation identity.
Opaque, non-cloneable Rust capabilities distinguish reserved and dispatched
work. Only the held pre-dispatch capability can release for a safe retry.
Dispatch commits `*_uncertain` BEFORE returning effect authority to the caller.
Dropping/losing either capability leaves the durable row unavailable for a new
effect. A second process cannot acquire a second reservation for that owner.
An independent owner can still reserve. Crash/restart interpretation is
conservative: even abandoned pre-dispatch reservations require authenticated
restart because the process-held proof that no dispatch occurred was lost.

Completion rechecks deadline, generation, reservation identity, phase and
credential binding before invoking local changes. Local credential writes,
post-write App/revision binding and the exact public result commit in the SAME
transaction. Closure or replay-write failure rolls all local changes back while
preserving uncertainty. Manifest success awaits installation; installation
success completes. Exact same phase inputs return the recorded result without
another local apply/effect capability; changed code/installation is rejected.
Installation cannot change Apps. A newer setup or revocation fences old success.
There is no automatic retry after transport failure/cancellation/shutdown or
remote ambiguity, and no generic phase reset/recovery operation is exposed.

Inputs are bounded to 8 KiB and replay objects to 16 KiB. Callers must supply
public data only. Explicit expiry cleanup clears replay/binding/reservation data
and keeps the generation/last state digest tombstone. A host must schedule this
cleanup for idle owners; no background expiry cleanup is mounted in this slice.

## Evidence and review limits

The validation result is
`.jait/artifacts/gateway-rust/agent-github-challenge/partial-result.json`.
The frozen source manifest binds the implementation and unchanged reference
clients. Module checks cover TTL boundaries, owner/state/revision binding,
two-stage replay identity, release versus abandoned/uncertain work, dispatch and
commit fences, App changes, rollback after apply/replay failure, overflow,
privacy, two competing SQLite connections and independent-owner progress.
A child test process opens the persisted uncertain row after the parent drops
its connection; the parent asserts that the child actually ran its check.
Canonical service checks exercise issuance, new setup, disconnect/recreate,
manual save, invalid save and SQLite-trigger failures with real encrypted secrets.
One of the module checks is the child harness entrypoint, which is a no-op in the
ordinary suite; report substantive checks separately from that helper.

This is engine/store evidence, not a real callback replay, network cancellation,
process kill during a SQLite commit, or external GitHub browser test. A transaction
rollback fixture is not remote cancellation. Snapshot hashing detects current
credential changes; identical-credential ABA through direct SQL is NOT prevented.
No claim of completed cross-process callback fencing follows from SQLite races.

Next integrate one compound callback operation under the NativeGithubPort owner
lease and this durable authority. Wire conversion/installation commits and
expiry cleanup, preserve missing-input/query admission, exact replay and
uncertainty behavior, and test fresh actual HTTP clients against intentional
narrowings while preserving authenticated manual installation. Do not reuse the
old per-operation callback sequence as an atomicity claim. State-bearing install
URL issuance still needs an authenticated operation/browser change; no unsigned
fallback. Then review sink lifecycle/idempotency/fencing, cache App binding and
residency, credential ABA/cross-process ownership, host shutdown/deadlines and
broader Date.parse. A current full frozen native gate remains open. Counts remain
228/370 originals plus 5/6 additions (233/376 current); 142 originals and one
addition are pending. Platform/load/soak/recovery/rollback/activation gates remain.

Validated frozen/restored: 117 existing actual-service/store/HTTP/tool comparisons,
338 library checks including 20 substantive challenge checks plus one child harness,
strict Clippy, native/contract formatting and artifact checks. Seven isolated
controls are caught; the additional replacement control reaches the forbidden
local apply under the mutant, preserving revoked-state error classification.
All original source hashes are restored; runtime live/frozen equality is audited
separately from documentation changes. The evidence does not establish callback
enforcement or a current full native gate.
