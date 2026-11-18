# Native attention delivery

Source: `packages/gateway/src/services/attention.ts`.
Implementation: `packages/gateway-rust/src/services/attention.rs`.

The native service implements all module responsibilities: stable kind/request
keys, consent/question actions, browser/desktop native-notification policy,
insertion-ordered replacement, get/list/filter, user resolution, surface-specific
raise, user/global clear, duplicate-clear suppression, sink registration/removal
and best-effort synchronous/asynchronous delivery. Duplicate sink subscriptions
use shared object identity; repeatedly invoking one unsubscribe removes successive
registrations of that same object, matching the reference's `indexOf` behavior.
Transport exceptions propagate after the same map mutation point; resolver
exceptions happen before insertion. Failed sinks do not suppress later sinks.

The transport, resolver, clock and task spawner are explicit ports. The transport
port is the same responsibility boundary as the imported `WsControlPlane` in the
reference; it must preserve authorization and user/surface scoping at activation.
The spawner owns detached sink tasks; the wrapper consumes their error results.
No JavaScript runtime or worker is used by the native implementation.

Evidence (2026-10-20):

- `RUST_TEST_THREADS=2 node packages/gateway-rust/run.mjs test --lib services::attention`: five native tests pass.
- `RUST_TEST_THREADS=2 node tests/contract/run.mjs test --test gateway_rust_attention`: six differential tests and four shared subprocess transport checks pass. The TypeScript driver instantiates the actual AttentionService and exported helpers and compares complete result and delivery traces.
- `bun x vitest run packages/gateway/src/services/attention.test.ts`: fourteen original tests pass.
- Four restored mutations (browser suppression, replacement stacking, owner filtering, retained cleared items) fail both native and differential suites. Logs and the runner are under `.jait/artifacts/gateway-rust/parallel-20261020/attention/`.

The comparisons include no/empty/null/explicit owner values, custom/empty timestamps,
detail payloads, stable ties between request kinds, unknown keys, single and multiple
question prompts, duplicate option labels, three-button ceilings, inline replies,
unknown device surfaces, every clear reason, repeated unsubscribe, synchronous and
rejected-promise sinks, resolver failures and failures at every transport method.
State retention/deletion and sink non-delivery after transport failure are explicit
assertions, not inferred from the happy path.

Typed/ownership boundary: native inputs are the declared data types and Unicode
scalar strings. Native snapshots are owned values; JS alias mutation, getters,
prototype inputs, reentrant mutation of the service from a sink, native panics and
malformed callback return objects are not compatibility claims. Sink failures use
typed Result values; task execution/lifetime and actual WebSocket/mobile/channel
transport activation remain separate components. Full source-bound gate success,
not this review alone, controls component credit.
