# Native provider usage accounting

Reference: `packages/gateway/src/providers/usage.ts`.
Native: `packages/gateway-rust/src/providers/usage.rs`.
Target: `gateway_rust_provider_usage`; driver: `drivers/nativeusage.ts`.

The driver executes the actual TypeScript exports. Fourteen differential tests compare
parser outputs, every accumulator baseline/metrics snapshot, and round summaries as JSON.
Four additional tests check bounded driver transport. Five native unit tests pin selected
regressions independently. Existing context-overhead and Codex-mapper contracts still pass;
`context_overhead.rs` re-exports the moved accounting API for those callers.

Parsers preserve nullish envelope/alias precedence, safe integer checks (including decimal
JSON spellings and negative zero), cache bounds, optional totals/request counts, and nested
last-request counters. Counters in an accumulator are nonnegative safe integers supplied
through the typed ModelUsage boundary; arbitrary JavaScript object identity, mutation after
add(), non-JSON values and invalid manually fabricated counters are outside this boundary.
The shared lastRequest contract allows omitted scope; its omission survives serialization.

Accumulation covers fresh versus resumed sessions, unknown baseline protection, duplicate
and regressing notifications, cache/request deltas clamped at zero, absent counter propagation,
turn replacement/default IDs/empty IDs, and turn counters overriding session deltas without
altering their baseline. Aggregates use JavaScript Number arithmetic in original insertion
order, including sums above the safe integer range. Seeded mixed streams compare each of
48 snapshots with and without a saved baseline. Duration accepts fractional milliseconds.

Round summaries cover missing metrics, explicit zero totals, fallback totals, optional fields
present in every contributing round, estimated flags, fractional/negative finite summary
values, reduction order, and JSON serialization of overflowing sums as null. No accounting
estimates are introduced by the native code.

Before the correction, five differential tests failed: decimal safe integers, nullish envelope
fallbacks, optional lastRequest scope, optional decimal counters, and large aggregate rounding.
Evidence: `.jait/artifacts/gateway-rust/provider-usage-before.log`. This is a regression in the
partial native implementation, not a defect in the production TypeScript implementation.

Four deliberate mutations are caught by both native tests and differential comparisons:
nullish msg selection, charging resumed lifetime totals, sorting turn IDs, and discarding an
explicit summary total. The initial turn-order native fixture did not distinguish sorted
addition; a three-small-counter fixture now pins the actual rounding difference. All four
mutations are caught after that correction and source restoration is byte-verified.
Evidence: `provider-usage-mutations.json` and individual mutation logs under
`.jait/artifacts/gateway-rust/`. Restored green results are in `provider-usage-contract.log`,
`provider-usage-native.log`, and `provider-usage-clippy.log` in the same directory.

This component computes accounting data only. Provider execution, production dispatch and
live billing/cost reporting remain separate migration work; no production gateway switch or
configuration/schema change is made here.
