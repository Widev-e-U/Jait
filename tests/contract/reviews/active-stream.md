# R05/R03 active stream continuation

New executable improvement: Rust now drives authenticated shipping chat routes over real loopback HTTP sockets, using a deterministic local HTTP OpenAI-compatible provider. No production code, shared helpers, Cargo configuration, dependency, coverage registry, or CI configuration changes are required. This is additional TS baseline evidence, not proof of Rust gateway parity or completion of R05/R03.

Run from repository root (Bun and the repository's Rust toolchain required):

```sh
mkdir -p .jait/artifacts/rust-continuation/active-stream
PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$PWD/.jait/artifacts/rust-continuation/active-stream/target" cargo test --manifest-path tests/contract/Cargo.toml --test active_stream -- --nocapture
```

The run uses existing path-imported `Gateway` and `Api` fixtures. Gateway owns process-group termination, startup/read deadlines, an environment allowlist, isolated HOME/state/tmp, and Git configuration/ceiling boundaries. The TS driver changes its working directory to an isolated project with a Git marker. It supplies real `createServer`, SQLite, user/session services, tool registry and signed authentication. It substitutes only the provider URL via a fail-closed fetch adapter: the expected OpenRouter URL goes to the local HTTP provider; other non-loopback fetches throw. The provider key is dummy, and no CLI/live/paid model is invoked. Fixture control endpoints exist only in this disposable server.

## Rust-owned assertions

- POST `/api/chat` returns SSE; a byte-at-a-time UTF-8/SSE reader receives `α🙂` before Rust opens the provider's release gate. This proves incremental response delivery without timing thresholds. Provider output enqueues individual bytes; TCP may coalesce them, so physical packet fragmentation is not asserted.
- `/stream` reconnect returns an active snapshot containing partial text. Dropping the original response does not cancel the turn. Reconnected delivery then completes in token order `α🙂β終`.
- A real local registry tool executes: `tool_start` precedes its successful correlated `tool_result`, and completion ends with `done`.
- Negative controls mutate the actual observed trace: removing `β` must fail the token-content/order oracle, and swapping tool start/result must fail the tool-order oracle. These are caught oracle errors, not ignored or expected-failing Cargo tests.
- `/events` replay has strictly increasing durable IDs and `replay: true`. After a process restart, reconnecting with a middle `Last-Event-ID` yields exactly the recorded suffix through `done` with unchanged IDs/payloads. Last-Event-ID **is supported on this shipping endpoint**; `/stream` instead uses snapshot reconciliation.
- Completed history survives restart and is no longer active. Steering while idle returns 409; steering while active returns success and appears in the live snapshot. Cancelling a held provider request yields `done`, no `error`, no released second token, and a second cancel reports false.
- Killing/restarting an active gateway interrupts the old socket without a successful `done`; reconnect reports inactive and terminates. Active model execution is not resumed across restart.

Evidence is under `.jait/artifacts/rust-continuation/active-stream/<run UUID>/`: gateway log, observed events, durable ID/payload trace, cancellation trace, and final result. HOME, SQLite, dummy identity/token and all fixture state remain there too; do not publish raw state/identity files. Cargo output/target also stay under the requested artifact root. The test executable additionally runs three existing backend argv unit tests pulled in by the fixture import; those are not three additional active-stream cases.

## Exact remaining requirements

1. R03: run the same route/lifecycle assertions against a Rust backend with equivalent fixture provisioning. The current custom driver imports TS services; setting a generic backend argv does not make this test backend-neutral (this test deliberately overrides it).
2. R05: add slow-consumer/backpressure resource and cancellation bounds with controlled socket writes and measured queue/memory limits. No backpressure guarantee is established here; the helper's read/frame bounds protect the test, not server buffering.
3. Verify steering actually reaches the subsequent model request and changes the continuing turn. Current evidence covers acceptance and snapshot visibility before cancellation only.
4. Verify live `/events` replay-to-subscription handoff under concurrent emission, no-header cold reconnect, invalid/stale/future cursors, pruning and multi-turn ordering. Current Last-Event-ID evidence covers a completed turn's durable suffix across restart.
5. Verify crash checkpoint timing and retained partial content during a long active round. This test only asserts that interrupted execution is inactive after restart; it does not promise durability of the last token or automatic turn resumption.
6. Add WS transport parity if required by the migration acceptance criteria; this fixture covers HTTP/SSE. Add authorization failures, provider/tool failure paths, proxy behavior and multiclient isolation separately.

Validation: targeted Cargo integration run passes (one live streaming scenario plus three imported argv unit tests). Full repository healthcheck and coverage/CI registration are not claimed; they are outside this three-file continuation.

The subsequent safety review added exact cardinality for the fixture's one tool
start, one tool result, and terminal done. Duplicate-event controls run against
the real observed trace and a small oracle regression. Before the change,
`stream_oracle_rejects_duplicate_tool_and_completion_events` failed because a
duplicate tool_start survived; it passes after the guard. Evidence:
`.jait/artifacts/parity-next/stream-before.log` and `independent.log`.
This strengthens the fixture oracle; it is not a claim that a duplicate-delivery
production defect was observed.
