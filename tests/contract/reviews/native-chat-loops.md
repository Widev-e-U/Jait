# Native chat loop service and tools

Reviewed 2026-10-24 against the current TypeScript sources.

Native implementations: `services/chat_loops.rs`, `tools/loop_tools.rs` and the factory metadata asset. The service uses the native session repository and SQLite. The caller supplies authenticated chat context and executes database operations on the bounded database worker. These components persist goal state and report wake/broadcast events; mounting them grants no tool permissions and does not activate automatic continuation.

The differential target `gateway_rust_chat_loops` invokes the actual TypeScript service, shared Zod schema and loop tool factory with fixed clock/identity. It compares all persisted session metadata, returned loop fields, UTF-16 text, callback ordering, error results and instructions. Coverage includes goal replacement, revisions, stale checks, pause/resume, waiting/answer recovery, completion evidence, iteration accounting, cancellation/error precedence, owner scope, archived/deleted sessions, unrelated metadata, malformed metadata shapes, validation limits, worker authentication, all five tool dispatches and exact factory metadata. Reopen coverage closes and reopens a real SQLite file through the bounded native worker. Trigger failures and callback exceptions verify partial persistence.

Additional malformed-next-message cases reproduced an ordering defect: native evaluation previously accessed nextMessage before validating completion evidence. Native evaluation now matches the reference order and the current Bun error wording. Evidence: `.jait/artifacts/gateway-rust/chat-loops/input-precedence-before.log` and `input-precedence-restored.log`. The restored suite passes 13 tests, including four driver boundary checks.

Six independent mutations in the frozen copy were rejected by their intended assertions: stale revision bypass, owner bypass, missing evidence-count check, incorrect UTF-16 error cutoff, worker-context bypass and revision increment. No live subject was mutated. All 13 restored tests pass. Reproduction script and results: `.jait/artifacts/gateway-rust/chat-loops/mutations.py`, `mutations.json` and `mutations-restored.log`.

Prompt assets were refreshed in the prior continuation; current prompt comparisons and the complete source-review suite pass in `continuation-check.log`. The native migration gate must still certify a frozen batch before a new aggregate checkpoint is claimed. HTTP loop endpoints, chat/provider lifecycle integration and production activation retain their own pending component/replacement gates.

## Stopped goal recovery — 2026-10-24

Intentional compatibility update: instructions now preserve incomplete error,
paused and waiting goals in model context. They carry the saved status, criteria
and error, require an explicit user continuation request before `loop.resume`,
and forbid automatic error retries or notification-driven resumption. Completed
goals still emit no loop instructions. This changes context only; transition,
revision, ownership and consent rules are unchanged. Reused CLI sessions also
receive the current checkpoint each turn because their original system prompt
is retained. Mobile clients display stopped/error state while collapsed and the
full error plus Resume action when expanded.

The native service mirrors the updated TypeScript instruction contract. The
`gateway_rust_chat_loops` target passes all 14 tests, including persisted error,
pause and wait instruction comparisons across reopen. Evidence:
`.jait/artifacts/loop-recovery-rust.log`. Gateway route regressions cover explicit
recovery followed by automatic continuation and missing checks on goals created
mid-turn; reused CLI tests verify current error/pause context and preserve stops
when the user asks about a failure. Component counts are unchanged; this review
does not certify production Rust chat lifecycle composition.

## Live monitoring compatibility — 2026-10-25

The live TypeScript service/tool now uses configured System One checkpoint review,
redaction, timeouts and stale-review validation. Full native component credit for
these two references is pending until that integration is reconstructed. Native
contracts retain exact comparisons for deterministic budgets, optional persisted
monitor metadata, disabled-monitor checkpoints, resume, validation and instructions.
No existing contract target is skipped. Production remains TypeScript. Earlier
checkpoint counts certify their frozen source only.

## Configured monitor migration specifications — 2026-10-25

`gateway_rust_chat_loops` now includes Rust-authored acceptance specifications
for configured review. They invoke the actual TypeScript `ChatLoopService`, shared
schema, SQLite persistence and tool factory through the existing contract driver.
Only the model evaluation boundary is substituted with explicit bounded verdicts;
no external model, API credential or live database is used. Captured review state
also checks redaction before that boundary. Clock and UUID remain deterministic.

Cases lock down per-criterion confident acceptance, missing/uncertain/rejected
verdicts, provider failure, credential redaction, stale reviews after pause or goal
replacement, three stalls and explicit resume budgets, waiting and oversized
payloads, async tool dispatch and persisted verdicts after service restart.

These are executable reference behavior specifications for the later native
configured-monitor port. They do **not** compare configured monitoring with Rust:
that implementation and its host/API composition remain pending. Existing native
differential tests continue to run in the same target. A future port must replay
these scenarios against both implementations, retain cancellation/deadline tests,
and pass source-bound migration gates before claiming native parity. No component
credit or fingerprint has been refreshed for this test-only addition.

Validation: `gateway_rust_chat_loops` passes 24 tests (seven new monitor specifications); `gateway_rust_system_one` passes 25 tests. Log: `.jait/artifacts/loop-monitor-rust-contracts.log`.
