# Native consent manager review

Reference: `security/consent-manager.ts`. Native: `security/consent_manager.rs`.
All queue operations, expiry, audit writes and persisted per-session overrides are
implemented beside the production gateway. Executor ownership, authorization and
scope enforcement remain at the existing caller boundary; the manager does not
auto-approve requests when an override is enabled.

The standard bounded bridge executes the actual TypeScript class with real SQLite,
controlled wall clock/timers and no external services. Fourteen checks pass: ten
component checks plus four bridge guards. Cases compare ordered queue snapshots,
request metadata, retained request terminal status, all decision channels, duplicate
and unknown IDs, nullish/default/fractional/negative timeouts, session filtering,
shutdown, hydration, insert/upsert/delete/reopen, trigger failures and callback order.
Request callback failure rejects its waiter but leaves an entry; decision callback
failure removes the entry and leaves its waiter unresolved. Immediate reentrant
approval resolves before a later callback throw, as the source Promise does.

Native integration covers eight simultaneous approve/reject attempts with one audit
row/callback, real expiry after dropping a waiter, invalid expiry with no request,
and SQLite connection reopening. Native timer behavior is backed by an actual Bun
probe in `consent-manager-draft/timer-probe.json`. Synchronous store calls belong on
the caller's database/blocking lane; expiration dispatches to spawn_blocking. Defaults
use UUIDv7 and a real clock. No default or production database is ever opened here.

Two caught/restored isolated mutations prove shutdown rejection and audit insertion
(`consent-manager-draft/{shutdown-approves,audit-dropped}.before.log` and
`restored.after.log`). Standard host evidence: `consent-manager-standard.log` and
`policy-history-restored.log` (14/14). Native strict Clippy passes. Full source-bound
gate controls component credit.

Boundaries: arbitrary mutable JS object/prototype aliasing is not the native data
transport; retained request handles expose snapshots with live terminal status.
The manager intentionally preserves the source's callback-error outcomes instead
of resolving orphaned promises differently. It is not yet wired to production
routes or executor dispatch. No DB migration, production edit or runtime activation.
