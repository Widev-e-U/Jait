# Native owner-wide agent control

Source: `packages/gateway/src/services/agent-control.ts`.
Implementation: `packages/gateway-rust/src/services/agent_control.rs`.

All exported behavior is implemented: default running state, structural halted-error
recognition, typed errors and HTTP body, per-owner reads, authoritative refusal,
durable halt, repeat teardown, explicit resume and change notifications. The service
uses the existing SQLite migration/table, parameterized SQL and injected clock/hooks.
The halt writes before awaiting teardown. Teardown errors become `stopError`; change
callback errors propagate after persistence. State is read again after the await so
an explicit concurrent resume is observable. Dropping/cancelling teardown cannot
silently clear a halt. Activation must run on the authorized database worker; this
component does not by itself wire every production dispatch path.

Evidence (2026-10-20):

- `RUST_TEST_THREADS=2 node packages/gateway-rust/run.mjs test --lib services::agent_control`: six native tests pass. Includes actual owned on-disk close/reopen, SQL write failure before teardown, cancellation, hook ordering and explicit resume during teardown.
- `RUST_TEST_THREADS=2 node tests/contract/run.mjs test --test gateway_rust_agent_control`: six focused differential tests and four shared subprocess transport tests pass. The TS adapter uses the real service, real Drizzle and an owned in-memory SQLite database, with deterministic dates. It compares full result/error objects, hook traces and persisted rows.
- `bun x vitest run packages/gateway/src/services/agent-control.test.ts`: eight original tests pass.
- Four restored mutations (timestamp reset, wrong owner predicate, swallowed teardown error, incorrect UTF-16 ceiling) fail both native and differential suites. Logs and the mutation runner are under `.jait/artifacts/gateway-rust/parallel-20261020/agent-control/`.

The Unicode comparison failed before the native correction: truncating after the
first code unit of an emoji yielded one U+FFFD in the draft, versus three U+FFFD
from Bun/SQLite. The native binding now stores the exact WTF-8 bytes with a text cast
and reads invalid SQLite UTF-8 with the same byte-wise replacement, preserving both
stored bytes and visible results. The unchanged comparison then passed. NULs,
non-ASCII whitespace, empty/null reasons, injected-looking owner IDs, dormant rows,
noncanonical integer booleans, negative/fractional stop counts, hook throws, and
unattributed/empty action values are covered.

Typed boundary: native owner/reason/action inputs are Unicode scalar strings;
reason slicing can introduce a lone UTF-16 surrogate and its SQLite conversion is
explicitly tested. Arbitrary JS getters/prototypes, malformed hook return shapes and
JS non-Error object coercion belong to host adapters. Hooks return typed failures;
no native panic is disguised as a successful stop. HTTP/authentication and all live
agent/thread/transport activation remain separate migration components. Full
source-bound gate success, not this review alone, controls component credit.
