# Native screen-share HTTP lifecycle

Reference: `packages/gateway/src/routes/screen-share.ts` (one original component).
Native: `routes/screen_share.rs`, `services/screen_share.rs`, and explicit
`Gateway::with_screen_share` composition. The standalone gateway remains health-only.
No production mounting, consent bypass or automatic media execution is introduced.

The actual TypeScript server registers the actual routes and actual screen-share
service against a disposable migrated database. A test-only WebSocket port records
ordered immutable events; it does not send messages. Native tests run the real
loopback authenticated gateway and native device/session state. Both sides require
existing users and cookie-origin checks before any effects. Global device/session
visibility follows the existing TypeScript service; this is not per-user ownership.

All eight operations are exercised: state, devices, register, start, stop,
transfer-control, capture and record. Coverage includes insertion/re-registration,
all three platforms, forced authorized registration, empty/non-array capabilities,
ECMAScript coercion/whitespace, primitive/null bodies, unknown/unauthorized hosts and
viewers, duplicate viewer order, web-viewer control denial, empty viewers, replacement
sessions, stop without a session, repeated stop and transfer after stop. State is
committed before broadcast and start-request; a signaling exception does not roll
back the session. Tests cover each signaling failure boundary, caught Error versus
non-Error fallback, uncaught media/stop errors, primitive throws and custom statuses.

Media operations are explicit typed native host effects. The TypeScript shared
service currently returns capture/recording metadata placeholders. Matching fixture
values are confined to tests; native production code contains no fake capture or
recorder. This route credit does not claim a media backend, WebRTC transport, real
WebSocket delivery, OS permission integration, recording lifecycle or the entire
shared screen-share package. The supplemental native state model implements only
the methods used by these routes; updateViewerTransport is not separately credited.
The host supplies bounded synchronous enqueue effects that must not reenter the
state lock. There is no await under that lock. Load/capacity and host supervision
remain replacement gates; existing TS unbounded state is not a bounded-load claim.

Random session/recording UUIDs are normalized by a consistent bijection, retaining
cross-response/event identity relations; device IDs and array order remain exact.
Timestamp values alone are normalized after checking RFC3339 validity, retained
connectedAt, refreshed lastSeenAt and final-state timestamp consistency for
registration. A delayed re-registration prevents a same-millisecond false pass.
The authenticated second user observes the same global state as TypeScript.
Full response status/body, final state and
ordered effects are compared. General HTTP error headers/unsupported engine objects
belong to transport/host integration and are not claimed by this DTO fixture.

The poisoned-toString regression demonstrably failed before native conversion and
validation-order fixes (Bun 1.4 says `No default value`). Focused evidence is in
`.jait/artifacts/gateway-rust/agent-messenger-history/screen-share-poison-before.log`
and `screen-share-final-focused.log` in that directory. Three additional deliberate
mutations test auth bypass, allowing web viewers to control, and missing broadcast;
results and restored-source validation are recorded alongside the focused logs.
Full frozen validation must pass before this candidate becomes a new full checkpoint.

### Handoff and capture lifecycle compatibility decision (2026-10-28)

Both gateways now reject handoff for an unapproved, paused or stopped share with
409 and reject an invalid `controlOwner` with 400. A late approval cannot revive a
stopped share, and a late denial cannot stop a share that was already approved.
Replacing a chat's share sends the old idle state before the new start request so
its host can stop capturing. Agent tool disconnect is scoped to its owning chat.
These are intentional safety changes from the prior permissive lifecycle.

Client evidence: the web hook sends an explicit `user` or `agent` value, uses the
owning chat ID, and requests capture only after successful approval. Its focused
tests exercise cancellation while approval or the capture picker is pending. The
TypeScript route tests assert rejection and replacement ordering, and the native
HTTP differential suite compares these cases with the TypeScript implementation.
This evidence does not establish interactive input, clipboard transport, real
WebRTC or production Rust gateway readiness.
