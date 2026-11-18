# Native Codex event mapper

Reference: packages/gateway/src/providers/codex-event-mapper.ts.
Native: providers/codex_event_mapper.rs. Target: gateway_rust_codex_event_mapper.
The reference driver imports the real mapCodexNotification and returns its events as JSON.

Nine differential tests plus four bounded-driver checks pass. Every notification batch is
sent through both implementations and compared after normalizing only generated identifiers
(codex-item-N / codex-evt-N become codex-item-# / codex-evt-#), so no test asserts a literal
generated ID. The differential batch runs as one in-process call, op
provider.codex-event-map, which keeps the reference module's fallback counter advancing
monotonically inside the batch exactly as the native thread-local counter does; normalizing
the generated suffixes is what removes the ordering dependence between the two sides.

Covered behavior, all compared exactly: token precedence delta > text > content with the
non-empty gate, whitespace-only deltas, reasoning/thinking deltas, the delta-only
outputDelta gate with item-id resolution performed only when the delta is truthy, command
output streaming, started and completed item envelopes including the item-or-params
fallback, kind-based envelope classification, tool category and argument construction,
provider agent tool names kept as categories, MCP progress and MCP result variants, failed
item status mapping, JSON-string tool payload parsing with nested fallbacks, turn start and
completion, failed turns with a null error, retryable versus fatal errors, agent messages
with joined content parts and last-message task completion, usage from token counts,
task_started/task_complete, session completion, turn diffs and unknown methods collapsing to
activity events, and non-object params passing through without throwing.

Adversarial coverage: an item-type normalization matrix (snake, camel, kebab and mixed case
spellings), non-object envelopes at every entry point, whitespace-only string fields treated
as missing, blank identifier fallbacks across all four id positions, JSON-string versus
object tool result payloads, every MCP progress and result field variant, and delta-only
gating for both token and output streams.

Mutation sensitivity was measured, not assumed. Four deliberate defects were injected,
tested and restored (source restored byte-identical and asserted):

| mutation | native unit tests | differential contract |
|---|---|---|
| token delta uses text before delta | caught (26/1) | caught (12/1) |
| tool output also accepts text | missed, then caught (26/1) | caught (12/1) |
| asString skips trimming | missed, then caught (26/1) | caught (9/4) |
| item-type normalization skips camel to snake | caught (26/1) | caught (12/1) |

Two mutations initially survived the native unit tests because the differential suite was
the only place the delta-only gate and whitespace trimming were pinned. Two unit tests were
added for those behaviors, and all four mutations now fail both suites.

Evidence in .jait/artifacts/gateway-rust:
- codex-event-mapper-native.log: 27 passed, 0 failed, 8 filtered.
- codex-event-mapper-contract.log: 13 passed (9 differential, 4 driver self-tests).
- codex-event-mapper-ts.log: 11 reference tests passed.
- codex-event-mapper-check.log: format and strict Clippy passed, no warnings.
- codex-event-mapper-mutations.log and codex-mutations.py: four mutations, all caught,
  source restored.

Commands:
  ~/.cargo/bin/cargo test --manifest-path tests/contract/Cargo.toml --test gateway_rust_codex_event_mapper
  RUST_TEST_THREADS=2 node packages/gateway-rust/run.mjs test --lib providers::codex_event_mapper
  node node_modules/vitest/vitest.mjs run packages/gateway/src/providers/codex-event-mapper.test.ts

Scope: this slice maps Codex provider notifications into provider events. It does not run a
Codex process, dispatch provider events to sessions, or start the production gateway, and it
makes no claim about live Codex transport behavior. The shared usage accumulator is reused
from context_overhead.rs and is verified separately.
