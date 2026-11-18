# Native notifications and usage feedback

NotificationService constructs notification envelopes and delegates delivery to
an explicit broadcast adapter. The broadcast happens before sinks. Broadcast
errors propagate; sink errors are best-effort Result values and do not stop later
sinks. Owned callbacks must not panic. Sink callbacks may mutate the payload and
later sinks see that mutation. Duplicate callback identities are all removed by
one unsubscribe; dropping a subscription does not unsubscribe. Repeated removal
is harmless. Delivery retains the original callback array when removal replaces
the active registry, and sees callbacks appended to the original array while
iteration is in progress. Native closures run outside registry locks. WebSocket
transport itself remains unported; no delivery acknowledgement is promised.

Usage aggregation preserves account, backend and quota order and all quota fields.
It applies the OpenCode Go label override, Claude/Codex labels, gateway/remote
location, first truthy plan selection, backend account/plan metadata and per-quota
errors. Schema-valid JSON inputs are compared directly, including empty arrays,
orphan quotas, null/missing fields and prototype-named account ids. Ordinary
object inherited error properties are modeled as their JSON-visible output:
prototype methods omit the error field; __proto__ produces an empty object.
The API takes an explicit generated-at timestamp.

UsageRefreshCache shares active futures, successful freshness, automatic failure
backoff and a 30-second manual refresh cooldown. Successful requests retain a
five-minute freshness window; consecutive failures use ten/twenty/thirty-minute
backoff. The reference changed during this continuation: force now bypasses
failure backoff after the cooldown. The native implementation and vectors follow
that current source, with its SHA recorded in native-coverage.json. The earlier
candidate's different force behavior is preserved in feedback-first.log.

The 1000-key bound evicts only completed expired entries. Active requests survive
force, elapsed time, capacity cleanup and dropped waiters. Loader invocations
start in run order: a start gate releases the next task after the current future's
first poll, allowing pending I/O to overlap. This fixes the initial native bulk
loader ordering mismatch without changing the comparison assertion.
Workers retain in-flight work after callers drop futures. The API requires Tokio,
nonpanicking loaders/predicates, cloneable result values and string errors;
JavaScript object identity or arbitrary thrown objects are not a native contract.

gateway_rust_feedback compares real TypeScript services with native code using
fixed clocks, controlled held requests, future identity checks, exact ordered
loader lists, notification envelopes, sink payloads and quota output. There are
12 passing tests, including four subprocess transport checks. A native-only test
also fills the cache with one held and 999 completed requests to prove capacity
cleanup preserves active work. The input suite's 14 tests still pass after moving
its shared ISO date helper into time.rs.

Three reversible mutations make sink errors propagate, block forced refresh after
a failure, or remove the OpenCode Go label override. Each fails the unchanged
corresponding comparison; restored sources pass. Logs and structured results are
under .jait/artifacts/gateway-rust/feedback-mutant-*.log and
feedback-mutations.json. The full source-bound gate is required for component
credit; the 181-component milestone and production replacement remain open.


## Reference refresh behavior update

A later concurrent reference change removes the 30-second manual cooldown entirely.
Force now shares only genuinely active requests and bypasses all settled freshness
and failure backoff, including immediately repeated calls and regressed clocks.
The native guard follows that current implementation. Three existing differential
assertions fail before this adaptation and pass afterward; comparisons, result
values and loader identity remain exact. Prior cooldown descriptions above record
historical checkpoints, not the current behavior. Evidence is in
cache-no-cooldown-before.log and cache-no-cooldown-after.log under the native
artifact directory. No TypeScript production source was changed by this migration.
