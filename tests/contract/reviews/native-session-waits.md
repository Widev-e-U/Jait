# Native session-wait registry

Reference: `packages/gateway/src/services/session-waits.ts`, with shared labels in
`packages/shared/src/types/message.ts`. Native implementation:
`packages/gateway-rust/src/services/session_waits.rs`.

The six differential scenarios in `gateway_rust_session_waits.rs` execute the real
TypeScript service through `nativewaits.ts`. Expected behavior is never authored
in the TypeScript adapter. They cover all six labels, nullish defaults, explicit
empty labels, omitted empty detail, false blocking, stable key helpers, duplicate
raises, every changed field, same-key session transfer, clearing absent/existing
keys, session-wide clearing, reconnect snapshots and broadcaster removal/reset.

Ordering compares blocking state, then session and key with ICU collation, retaining
insertion order for collation ties. Two reversed Unicode corpora cover accents,
combining marks, case, emoji and numeric-looking keys. These comparisons establish
host-default locale behavior; supported-platform locale coverage remains open.

The map retains a separate immutable lookup key while returned records preserve
reference identity through `Rc<RefCell<SessionWait>>`. Repeated identical raises
still replace the returned object. Caller mutations affect get/list/snapshot and
subsequent equality checks as in the source. Differential cases cover these effects.
UTF-16 text preserves lone surrogates for native construction and serialization;
JSON deserialization through serde still accepts only well-formed Unicode, matching
the existing native transport boundary rather than claiming full JS input support.

Callbacks run synchronously after state commits, with registry borrows released.
Delivery errors propagate without undoing insertion or removal. Three native tests
cover record identity, mutable lookup keys, reentrant callback mutation/clearing,
failed delivery, and lone-surrogate key/label output. Differential error/reentry
cases compare snapshots and notification ordering with the original service.

This service belongs on a single gateway event loop, like the current synchronous
attention registry. It adds no process-global singleton or WebSocket wiring:
the native runtime must own and connect its registry during domain integration.
Focused tests establish component behavior only. Full source-bound validation,
production activation and the overall migration remain separate requirements.

Three copied-native mutation controls change default blocking, suppress raise
idempotence, and drop detail. Each produces a differential assertion failure;
restoring the original source passes again. Reviewable results are saved in
`.jait/artifacts/source-review-authoring/session-waits-mutations/results.json`.
TypeScript driver checks, focused strict Clippy, formatting and artifact checks
also pass. The full native gate must rerun before counting this candidate.
