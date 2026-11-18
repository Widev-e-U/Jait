# Native thread review synchronization

Reference: `packages/gateway/src/services/thread-review-sync.ts`.
Native policy: `packages/gateway-rust/src/services/thread_review_sync.rs`.
Rust-owned comparisons: `tests/contract/tests/gateway_rust_review_sync.rs`;
actual TypeScript execution driver: `tests/contract/drivers/nativereviewsync.ts`.

## Compared behavior

Seven Rust-owned differential groups execute 60 scenarios against the actual
TypeScript service. Only imports for filesystem/Git/forge/cleanup ports and
process CWD are rebound; production predicates and polling methods execute
unchanged. Time is fixed and intervals are recorded without starting processes.
Fixtures compare complete ordered port calls, update/activity/broadcast payloads,
resulting thread rows, errors and interval cancellation counts.

Coverage includes delivery/branch/workdir/state/URL filtering, list limit 100,
sequential candidates and skipped overlapping polls; local path resolution;
default and custom forge resolution; missing remotes/forge/PR/update; nullish
metadata comparison and fallback (including empty values and zero); open, merged,
closed, null and unknown PR states; no-op suppression; Unicode paths/branches;
activity followed by terminal-state session/workdir release, branch-preserving
cleanup scheduling and final update broadcast. Remote cases cover gateway-node
exclusion, Windows drive paths, non-Windows first-node selection, configured
remote/origin/first-remote precedence, ECMAScript trimming, exact 15-second proxy
budget and swallowed Git failures. Exceptions and thrown values, per-thread
failure containment, partial effects, continuation after failure, repeated ticks,
default/custom intervals, idempotent start/stop and pending cleanup are compared.

Two additional native checks verify that cancelling a poll releases its running
guard, overlapping polls cannot access storage, interval callbacks hold only a
weak service reference, dropping a service cancels its registration and a stale
callback performs no work. Four shared driver transport checks also run.

## Authority and integration limits

This module is polling policy over explicit host ports, with no default repository,
forge, network-node or cleanup access. Typed Git queries carry data; their
reference-argument spelling is test evidence, never permission to execute a shell.
The host must enforce ownership, scope, explicit node authority, argv construction,
output/time budgets and cancellation at effects. The list port must enforce its
requested bound. A scheduler must supervise callback errors, cancel intervals,
avoid inline registration callbacks and allow process exit (unref behavior).

Cleanup is handed synchronously to an explicit host scheduling port before the
update event; the service creates no detached task. The host must admit and track
cleanup, retain effect capacity until it ends and preserve the branch. Stop cancels
future polling while an in-flight tick may finish, matching TypeScript. Cancelling
the native poll future releases the policy guard; cancellation and cleanup of
underlying external work remain host responsibilities. No production composition,
real Git/forge/node execution, platform or cutover readiness is certified here.

## Evidence

Focused suite: `.jait/artifacts/coverage-goal/review-sync-contracts-final.log`.
Nine native and two TypeScript mutations were caught by failing assertions;
the restored isolated suite passes all 13 checks. Mutation evidence is recorded in
`.jait/artifacts/coverage-goal/review-sync-mutations.json` and the adjacent logs.
Full source-bound gate and live freshness must pass before this candidate can
advance the completed native checkpoint.
