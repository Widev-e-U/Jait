# Native question, secret and completion-notification state

The question and secret services share an ordered in-memory registry in
`input_requests.rs`. Both preserve request metadata, nullable ownership, pending
insertion order, truthy session/user filters and owner checks before resolution.
Resolution removes the pending entry under a mutex. Metadata callbacks run outside
that mutex, allowing reentry; waiters wake after the synchronous callback, as
JavaScript promise reactions do. Concurrent resolution has exactly one winner.
Observers must not panic. The native API passes owned metadata snapshots rather
than exposing mutable JavaScript object references.

Question requests have no expiry. Title defaults use ECMAScript whitespace.
Secret requests retain default/overridden expiry and optional remember metadata.
Submitted secret values travel only through the waiting result channel. No value
is included in metadata callbacks. Timer cancellation prevents later effects after
submission/cancellation; pending timers retain the registry until expiry even if
the caller drops its service handle. Fractional, nonpositive and overflowing timer
delays follow the reference; ISO expiry calculation supports the complete finite
ECMAScript TimeClip date range, including signed six-digit years. Timers require a
Tokio runtime. Dropping a receiver does not remove an unresolved live request.

Completion notifications use the real native session-state service, or a bounded
2048-entry fallback when storage is absent. Validation keeps only user identity,
notification id, session id, replacement id and read state. Preview text is stripped.
The id limit counts UTF-16 units. Updates refresh fallback insertion order; only
the oldest entry is evicted. Stored malformed legacy data is ignored on reads,
without rewriting or deleting it. Ownership checks for sessions remain the
responsibility of callers, matching the reference service.

`gateway_rust_input` compares actual TypeScript classes with native services using
fixed wall-clock time, normalized validated UUIDv7 request identities, real SQLite
migrations, exact serialized stored text, callback metadata, results and ordering.
All data is disposable and project-local. Tests cover default/explicit fields,
unauthorized and duplicate resolution, cancellation, timeout, empty owners,
cross-session filters, extended years, malformed rows, scalar and array values,
UTF-16 limits, preview stripping and fallback capacity. Rust-only checks add
callback reentry, dropped receiver behavior, timer ownership and concurrent
resolution. Finite well-formed Unicode JSON and nonpanicking callbacks are the
reviewed boundary; arbitrary JavaScript prototype objects are not native inputs.

Three reversible mutations remove owner enforcement, replace timeout status, or
relax the UTF-16 identifier limit. Each causes the unchanged corresponding
differential assertion to fail; restored sources pass. Evidence is recorded in
`.jait/artifacts/gateway-rust/input-mutations.json` and `input-mutant-*.log`.
These are sensitivity checks on new ports, not claims of defects in TypeScript.

The focused suite passes 14 tests, including four subprocess transport checks.
The three component credits require a passing full source-bound gate. HTTP
routing, production tool dispatch, WebSocket delivery and production replacement
readiness remain separate work.
