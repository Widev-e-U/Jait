# Native consent HTTP adapter

Reference: `packages/gateway/src/routes/consent.ts`. Native:
`packages/gateway-rust/src/routes/consent.rs`. This is an opt-in route adapter,
not production server composition or permission to approve any live request.

The adapter uses the existing native ConsentManager directly. It authenticates
before ownership, reads, decisions, override changes or audit. Requests must still
be pending and belong to an owned session (including the host ControlAccess thread
fallback); foreign, missing and already resolved IDs return the same 404. Global
pending/count endpoints filter every request through ownership. Policy output
retains permission insertion order and the unknown-tool consent requirement.

Single decisions preserve click provenance, omitted approval reasons, the rejection
default and empty-string reasons. Notification approve-all resolves only the
current pending snapshot of the originating request's session and never enables
future bypass. Session approve-all enables the existing override before resolving
its snapshot; clearing the override always writes the reference audit event.
Only successful decisions are counted/audited. Audit failures and decision observer
failures stop the remaining work without rolling back completed decisions or the
session override. All audit action IDs are native UUIDv7 values. The adapter adds
no implicit retry or authorization inferred from private-network reachability.

Reserved ID/session words have focused method-routing comparisons, including
`pending/approve`, `pending/reject`, `pending/approve-all`, `policy/approve`,
`count/reject` and percent-encoded static names. Axum's static prefix otherwise
shadows Fastify's method fallback. Explicit GET/POST routes preserve both meanings
and apply the correct ID/session ownership check before dispatch. The regression
failed with value assertions before correction and passes afterward; see
`.jait/artifacts/gateway-rust/consent-http/reserved-before.log` and `focused-final.log`.
This is compatibility preservation, with no intentional public protocol change.

The mandatory ownership and audit closures run on an explicitly supplied bounded
BlockingLane. The composing host must provide ControlAccess::session (including
thread ownership) and its authorized audit writer; fail closed without ownership
stores. A caller disconnect cannot cancel admitted synchronous work or release
its lane permit early. Lane overload/closure rejects before host effects; existing
BlockingLane contracts cover that infrastructure. Host callbacks must bound their
own I/O and retain the existing database/audit authority. Consent manager timers
remain owned by the shared manager. The legacy GET /api/trust response contains
only the same static guidance as the reference registrar; surrounding server
origin/auth policy is a separate composition gate. Other native consent endpoints
use the shared authenticated, origin-checked and current-user boundary.

`gateway_rust_consent_http` invokes the actual TypeScript registrar, ConsentManager,
ControlAccess, Fastify body/parser routing and authentication over real loopback
HTTP. Bun light-my-request injection produced late duplicate-header errors on
denied preHandlers; switching only the fixture transport resolved these without
modifying the registrar or suppressing errors. Only the session/
thread lookup and audit sink are isolated host fixtures. Rust serves real loopback
HTTP over the native queue, an isolated SQLite auth database, bounded worker and
signed credentials. Assertions compare every status/body, ordered decision/audit
record, remaining queue and session override. Generated request IDs map to their
individual fixture aliases; creation/expiry/decision timestamps normalize because
wall clocks differ. Each audit ID is independently checked as UUIDv7 before
normalization. One additional native check rejects foreign cookie origins, deleted users and
a closed blocking lane before any host read/write or session override. Native
consent-manager contracts separately verify those clocks,
persistence and timer semantics. The fixture does not approve a live request,
access the user's database, execute tools, contact providers or change production.

Focused comparisons, bounded isolated native/reference mutation controls and a
full frozen-source gate must pass before checkpoint credit. Platform, composition,
load, recovery/rollback and production replacement/activation gates remain open.
