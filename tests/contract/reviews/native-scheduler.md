# Native durable scheduler

Reference: `packages/gateway/src/scheduler/service.ts`.
Implementation: `packages/gateway-rust/src/scheduler/{service,minute,tzdata_2025b}.rs`.

The native service implements persisted create/get/list/update/remove, owner and
system-job visibility, run history, manual and scheduled triggers, five-field
minute matching, time zones, agent-task dispatch rewriting, minute deduplication,
per-job scheduling guards, concurrent jobs, one-shot disposal and hourly cleanup.
SQLite work uses the bounded database worker and does not span an external await.
Construction starts no polls. Start is idempotent; stop cancels future polls and
leaves started executions alive, matching clearInterval in the reference.

Contracts call the real TypeScript service with Drizzle and isolated SQLite.
They compare complete records, run rows, callback traces, errors, timestamps,
dispatch input and purge/preflight counts. Only generated UUIDv7 values are
aliased; generation/version is asserted. Corrupt JSON, nullable defaults, empty
owners, injection-looking identifiers, disabled manual jobs, returned failures,
thrown execution errors, callback failures after persistence, all one-shot flag
shapes and fractional retention boundaries are included.

The minute corpus includes 490 ordinary date/zone/cron combinations, 75 extended
date combinations, 12 malformed/alias/offset cases and the union of reference ICU
and Jiff zone names at three dates and six cron predicates each. Dates include
DST jumps, repeated wall times, pre-epoch values and JavaScript's date extrema.
The source requires conjunction of day-of-month and weekday. Invalid dates with
all UTC wildcards deliberately preserve the source's unusual true result.

Fail-then-pass reproductions corrected a Unicode byte-slice panic for offset text,
Jiff accepting unknown-zone sentinels, and the mismatch between newer host zone
databases and the reference ICU catalogue. The embedded TZif data is pinned to
2025b, with explicit names/aliases; it does not depend on the host tzdata version.
Native extended-year conversion uses representative Gregorian 400-year cycles
outside Jiff's civil range. The differential corpus checks selected extrema, not
every historical transition or every possible date. A future reference ICU
upgrade must rerun and update this contract rather than silently change schedules.

Validation:
- `RUST_TEST_THREADS=2 node tests/contract/run.mjs test --test gateway_rust_scheduler`: 14 checks pass (ten component checks and four shared transport checks).
- `bun x vitest run packages/gateway/src/scheduler/service.test.ts`: all 14 original tests pass.
- Semaphore-controlled tests prove independent jobs and later ticks progress while
  one job is blocked. File-backed close/reopen proves run-history persistence and
  same-minute deduplication through the actual native cron adapter.
- Two native timer checks pass: paused-time idempotent start/stop/restart, and
  stopping polls while a blocked execution completes and persists its result.
- Eight isolated mutations are caught by behavioral assertions: owner filtering,
  one-shot deletion, one-shot disarming, retention equality, minute deduplication,
  running-job guards, named-zone offsets and timer idempotency. The restored
  suite passes and all isolated source hashes match its baseline. Evidence:
  `.jait/artifacts/gateway-rust/scheduler/mutations/results.json`.

Typed boundary: native callbacks return JSON tool results or explicit string
errors; arbitrary JavaScript getters, prototype properties, non-JSON values and
non-Error thrown objects are host-adapter concerns. Native panic is not a tool
failure. Trigger input time is a valid millisecond timestamp. Poll periods use
bounded unsigned millisecond inputs; zero clamps to one millisecond. Production
activation must explicitly start/stop the timer and apply the existing authorized
tool executor, scope/expiry checks and before-tick storage preflight.

Stop is not process-crash recovery or exactly-once delivery. The source persists
lastRunAt after completion and does not reconcile a process killed mid-execution,
replay missed minutes or globally exclude manual triggers. The native component
retains those boundaries; no stronger guarantee is claimed. Dropping an awaited
trigger can leave a running row; cancellation policy and crash recovery need
application wiring. Clients must use explicit stop for timer teardown.

This component adds no jobs HTTP, provider execution, production timer activation,
cutover, platform or full replacement credit. Full source-bound gate success
controls component credit.

A SQLite-trigger regression subsequently exposed a draft split-update discrepancy:
if the disarm write failed, native had already persisted lastRunAt. The source
updates lastRunAt, updatedAt and enabled in one statement. A deterministic
BEFORE UPDATE OF enabled trigger failed the differential comparison before the
fix and passed after restoring that single-statement boundary. Evidence:
`.jait/artifacts/gateway-rust/scheduler/atomic-disarm-{before,after}.log`.
The 168 frozen gate predates this regression and has unrelated core-tool source
drift; the next complete source-bound gate must include this correction.

## Reference runtime refresh — 2026-10-25

After the installed reference changed to Bun 1.4.0 / ICU 78.3, the prior bundle
failed the existing America/Coyhaique historical comparison. IANA 2025b standard
zone files plus backward are now pinned by archive hash and embedded as TZif.
The scheduler and channel-assistant targets pass (23 checks), including the full
reference/bundled name union. Newest-host data is deliberately not used: host
backzone data changes historical aliases, and standard 2026e differs on Casablanca
in October 2026. See src/scheduler/tzdata-README.md and the timezone-refresh.log
in .jait/artifacts/gateway-rust/channels-http/. This refresh adds no component
credit and requires the full frozen gate before a new checkpoint is recorded.
