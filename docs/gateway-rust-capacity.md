# Rust gateway capacity: thousands of concurrent sessions and beyond

Design investigation: 2026-10-24. This is a proposed capacity target, not a
benchmark result, shipping capability or replacement-gate pass. Production remains
TypeScript. Apply the [session ownership design](gateway-rust-architecture.md#session-ownership-and-concurrency)
and [migration gates](gateway-rust-migration.md) alongside this document.

## Define the goal by workload

The maintainer's long-term ambition is the highest sustainable concurrency,
including many thousands of sessions and eventually more than 10,000 where
resources allow. The initial 500-session profile is an early milestone, not a
ceiling. Each larger claim needs its own measured workload, resource budget and
correctness evidence. Keep this an ongoing optimization goal rather than promising
unlimited capacity or making the final stretch target a prerequisite for cutover.

500 concurrent sessions is the first gateway coordination goal. Tokio tasks are
lightweight and share runtime workers; a session does not need an OS thread.
However, a session also owns history, buffers, provider resources and effects.
The scheduler's task overhead alone cannot predict application capacity.

| Workload | Proposed goal | What a pass establishes |
| --- | --- | --- |
| Stored conversations | Paginated durable storage; independent of active-session count | Idle history does not remain resident just because it exists |
| Connected sessions | 500 sessions with one live subscriber each; separately test two subscribers per session | Connection, replay and status capacity; no inference about active generation |
| Active HTTP provider turns | Ramp 25 → 100 → 250 → 500 simultaneously streaming turns | Gateway coordination capacity using a controlled local provider; real provider quotas remain separate |
| Mixed sessions | 500 resident sessions; rotate provider streaming, approval waits, queued work and idle states | Resources follow actual work phases and interactive control remains responsive |
| CLI agents, browsers, scans and CPU tools | Separate measured process, memory, CPU, target and node budgets | Sessions may wait for capacity; 500 sessions does not require 500 heavyweight effects |

Each active-turn test must prove all requested streams overlap before releasing a
barrier; 500 completed requests run sequentially is not this test. Do not hold
all sessions behind a hidden global turn semaphore and call it active capacity.
Include one-owner and multiple-owner workloads, so owner quotas remain explicit.
500 and the later stages are configurable profiles to validate, not unconditional
startup defaults. Preserve bounded admission at every scale.

## Capacity stages beyond 500

Run separate capacity curves for connected subscribers, mixed resident sessions
and active HTTP provider turns. A pass for one does not establish the others.
Apply the overlap barrier to every active-turn stage, including stages above 500.

| Stage | Proposed simultaneous-session ramp | Evidence before advancing |
| --- | --- | --- |
| Initial baseline | 25 → 100 → 250 → 500 | Establish the initial profile below, control responsiveness, resource accounting, correctness and a 60-minute soak |
| Thousands on one host | 1,000 → 2,500 → 5,000 | Repeat the full workload matrix and soak at the highest passing step; report per-session memory, DB service time, queue delay, CPU, sockets and the first limiting resource |
| Larger single-host stretch | 10,000 → higher measured steps | Publish hardware and resource budgets for every run; prove responsive control, fair progress, bounded waiting and recovery under saturation |
| Beyond one host, if justified | Repeat the ladder across explicitly authorized nodes; choose larger steps from measured headroom | Separate execution-node capacity from gateway coordination; any multiple-gateway design needs ownership, persistence and failure/recovery review before implementation |

The numbers are exploration checkpoints, not supported limits or benchmark results.
Stop a run at its predefined resource or latency bounds, retain the last passing
point and record the failure. Optimize the measured bottleneck before rerunning;
raising limits or moving work into an unmeasured queue is not a capacity gain.
Use the same workload definitions across stages so a smaller history, lower frame
rate or fewer subscribers cannot silently improve the headline session count.

Keep the initial 500-stream RSS threshold as its own milestone. For larger stages,
record baseline memory plus incremental bytes per connected/resident/active session
and choose an explicit total host/cgroup budget before running. Do not infer a
10,000-session pass by multiplying the 500-session result. The candidate control,
delivery, fairness, cleanup and correctness outcomes below continue to apply;
any revised threshold requires an explicit review and a distinct reported profile.

Prefer efficient ownership, small resident state, shared I/O, incremental
persistence and bounded work on one local gateway first. Execution nodes can add
heavy-effect capacity without implying more gateway stream capacity. If profiling
later justifies multiple gateway owners, first design exclusive session ownership,
authority fencing, durable routing/replay, quotas, failover and recovery from
network partitions. Retain one mutating owner per session and never share a SQLite
WAL across hosts. Distribution is a future architecture decision, not an assumed
capability or an automatic consequence of choosing Rust.

## Current source constraints

Observed on 2026-10-24; re-audit these paths before implementing changes.

| Source | Observation | Consequence for the target |
| --- | --- | --- |
| [Chat routes](../packages/gateway-rust/src/routes/chat.rs), [application composition](../packages/gateway-rust/src/runtime/application.rs) | Route default and application manager use 8 active turns; route validation permits at most 128 | Raising only the manager or route limit cannot enable 500 active HTTP turns |
| [Event bus](../packages/gateway-rust/src/runtime/chat_events.rs) | 256 sessions, 256 total receivers, 64 retained frames per session; frame bodies are Strings | Even 500 idle SSE subscribers exceed admission; item bounds also need aggregate byte accounting |
| [Auth state](../packages/gateway-rust/src/routes/auth.rs), [DB worker](../packages/gateway-rust/src/db/worker.rs) | One shared connection worker, 64 queued jobs, immediate busy rejection | Simultaneous turn starts, replay and auth compete for one lane; 500 sessions need not mean 500 queued DB jobs |
| [Turn store](../packages/gateway-rust/src/runtime/chat_store.rs), [message projection](../packages/gateway-rust/src/runtime/chat_projection.rs) | Appends aggregate retained history size and rebuild the session projection inside the transaction, deleting/reinserting native message rows | Work per append grows with session history; profile realistic long histories before increasing admission |
| [Model configuration](../packages/gateway-rust/src/runtime/chat_config.rs), [HTTP adapter](../packages/gateway-rust/src/providers/openai_stream.rs) | Preparation constructs a new HTTP client per turn; configured history limit is 1 MiB | Reuse policy-compatible clients; measure history parsing/serialization and copies across 500 turns |
| [Turn admission](../packages/gateway-rust/src/runtime/chat_sessions.rs) | One global count and busy-session set; no owner/provider fair scheduler | Add explicit scheduling policy if needed; a global semaphore alone cannot allocate fair shares |

These observations identify investigation priorities, not measured bottlenecks.
The architecture guide's provisional DB queue suggestion is 128; the actual
current auth worker uses 64. Neither number is a 500-session capacity result.
Do not merely raise constants, enlarge queues or weaken persistence guarantees.

## Design work to prioritize

1. **Separate residency from work admission.** Give each active session a small
   owner and bounded mailbox. Admit provider streams, processes, CPU work, DB
   commands and remote effects separately. Approval waits release CPU/DB permits;
   any still-live provider or child process stays accounted for. Bound total
   waiting sessions and admission duration. Interactive commands need a bounded
   responsive path during bulk work; status should use an authorized owner
   snapshot when possible, with durable state still authoritative.
2. **Make scheduling fair across owners and providers.** Track concurrent streams
   separately from requests/minute and tokens/minute. Admission across budgets
   must avoid holding one scarce permit indefinitely while waiting for another;
   use a consistent acquisition/release protocol or central scheduler. A FIFO
   semaphore is not owner fairness, and weighted acquire-many requests can block
   smaller requests behind them. Preserve queued position across control-message
   handling instead of repeatedly cancelling and recreating acquisition futures.
3. **Bound aggregate memory.** Account for serialized and parsed histories,
   provider accumulators, pending tool results, replay, mailboxes and fan-out.
   Share immutable serialized frames where helpful; Tokio broadcast stores one
   value but clones it for receivers, so String payloads still copy. Keep explicit
   lag/replay behavior. Paginate persisted history and load only reviewed context;
   context compaction must preserve the existing transcript and tool semantics.
4. **Reduce DB work before adding connections.** Measure queue delay separately
   from transaction service time. Investigate incremental message projection with
   an explicit revision/cursor and atomic event-plus-projection updates; retain a
   bounded rebuild/recovery path and differential message/timestamp tests. Avoid
   reparsing and rewriting all prior messages on every append where equivalent
   incremental updates are possible. Only add bounded read connections after
   profiling; preserve commit-before-publish and subscribe-before-replay behavior.
5. **Reuse I/O resources within policy boundaries.** Share compatible HTTP clients
   and pools, keeping credentials and session headers request-scoped. Do not merge
   clients with different proxy, certificate, redirect or authorization policies.
   Measure sockets, FDs, TLS/connect churn and provider-side stream limits. Keep
   CPU-heavy parsing/serialization bounded and off async workers when profiling
   shows it stalls them; async scheduling remains cooperative.
6. **Keep the UI and execution nodes separate capacity claims.** A gateway with
   500 streams need not render 500 chat panes continuously. Test a selected chat
   plus a virtualized/throttled session overview. If heavyweight work exceeds one
   host, use explicitly authorized nodes with per-node budgets and supervised
   leases; do not share SQLite WAL over a network filesystem or shard the gateway
   until measurements justify the extra ownership/recovery complexity.

## Capacity arithmetic to record with results

These are illustrative calculations, not measured Jait costs:

- 500 turns retaining 1 MiB each already require 500 MiB for just those buffers,
  before parsed JSON, copies, replay, TLS, allocator overhead or child processes.
- 500 streams × 10 frames/second × 256 payload bytes is about 1.22 MiB/second
  before protocol overhead. Large tool payloads and multiple subscribers change
  this substantially. Stream deltas and durable turn events are different rates.
- Concurrent active turns = turn starts/second × mean active duration. At 60
  seconds per turn, sustaining 500 needs about 8.33 starts/second (500/minute).
  At 20 output tokens/second per turn that is 600,000 output tokens/minute,
  plus input tokens and tool-driven provider rounds. Real quotas may bind first.
- One SQLite writer has finite service capacity: if an illustrative transaction
  occupies it for 5 ms, its ideal ceiling is 200 such transactions/second before
  other work. Measure actual duration, durable event rate, history size and burst
  behavior; a larger queue cannot increase writer throughput.

Report gateway RSS and process-tree/cgroup memory separately. A fake provider's
memory must be outside the gateway RSS figure but still included in host usage.
Record worker threads, runnable CPU, FD limits, active sockets, child counts,
queue items/bytes, WAL size, checkpoint time and per-owner progress.

## Proposed initial 500-session acceptance profile

Initial reference profile: 8 logical CPUs, 16 GiB host memory and local SSD,
release build, fixed cgroup limits, warm and cold runs. This is a candidate test
profile, not hardware purchasing guidance or an established minimum. Record CPU,
OS, filesystem, CPU/memory limits, Rust/TS/scanner versions, source fingerprints,
SQLite pragmas and load-generator placement. Do not load-test the live workbench
or make paid provider calls for this gate; use an isolated project-local database
and controlled providers/effects. Real integrations require their own bounded run.

Proposed thresholds below must be approved in the migration review before becoming
release gates. If they fail, publish the failure and capacity curve; do not adjust
them silently. They describe gateway overhead, excluding intended provider/human
waits, and do not change existing API/overload contracts by themselves.

| Signal | Initial candidate threshold or required outcome |
| --- | --- |
| Control responsiveness | Authorized status/health p95 ≤100 ms, p99 ≤250 ms; cancellation acknowledgement p99 ≤250 ms under the defined load |
| Delivery | Provider-emitted frame to reading client p99 ≤250 ms; durable event commit p99 ≤500 ms; report DB admission wait separately |
| Memory | At 500 controlled streams, gateway RSS increase ≤1 GiB over warm idle; separately report absolute RSS, children, provider and host totals |
| Cleanup | Controlled fake effects terminate and release capacity within 2 seconds of cancellation; real adapter cleanup deadlines measured separately; shutdown respects the documented process deadline |
| Correctness | No mixed-owner data, duplicate mutating turns, stale completions, unacknowledged durable-event gaps or abandoned admitted effects |
| Fairness/overload | Every admitted owner makes progress; excess load meets reviewed bounded queue/rejection policy without starving control traffic |
| Recovery | Restart/reconnect replays durable cursors correctly; ambiguous external effects stay visible and are not blindly retried |

Use a deterministic barrier provider for lifecycle/race assertions and a separate
real loopback HTTP/SSE provider for transport/load measurements. A sleep-only
mock or 500 idle tasks does not establish end-to-end capacity. At each ramp step,
run a 2-minute warm-up and 10-minute sample; at the highest passing step, run a
60-minute soak and repeated cancel/reconnect cycles. Compare post-cleanup live
resource counts to baseline and RSS after equivalent repeated workloads; explain
allocator/cache retention and fail unexplained continuing growth.

Cover both steady arrivals and synchronized starts at the stage's target count
(500 turns in the initial profile). Use bounded synthetic
histories (for example 16 KiB, 256 KiB and 1 MiB), multiple tool rounds, 10% slow
readers, approval pauses, expired authority, provider throttling/errors, DB/CPU
pressure and disconnect/replay bursts. Record any profile rejected by current
limits as unsupported rather than shrinking the workload silently. Keep scanner
fixtures synthetic and retain target/rate/vantage limits; session capacity never
expands assessment authorization or conflicting resource access.

Run the same client-visible workload against TypeScript and Rust, report all
p50/p95/p99 and error counts, and retain the highest passing workload for each.
Keep load-generator saturation visible so it cannot masquerade as gateway
capacity. Write artifacts under `.jait/artifacts/gateway-rust/session-capacity/`
and UI captures under `.jait/shots/`. No capacity benchmark was run for the 500,
thousands or beyond-10,000 targets in this investigation. Native component
coverage, test reconstruction and these capacity stages remain separate
measurements.

## Primary references

Library semantics were checked against official documentation. The recommendations
and numerical targets above are Jait design proposals inferred from local source;
use Cargo.lock's versions when implementing, without upgrading implicitly.

- [Tokio spawning](https://tokio.rs/tokio/tutorial/spawning): lightweight tasks;
  this does not include the full application's retained state.
- [Tokio task scheduling](https://docs.rs/tokio/latest/tokio/task/index.html):
  cooperative scheduling and isolation of blocking work.
- [Tokio Semaphore](https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html):
  FIFO permit behavior, acquire-many blocking and cancellation queue position.
- [Tokio broadcast](https://docs.rs/tokio/latest/tokio/sync/broadcast/index.html):
  retained values, receiver cloning and lag detection.
- [reqwest Client](https://docs.rs/reqwest/latest/reqwest/struct.Client.html):
  reusable connection pools.
- [SQLite WAL](https://www.sqlite.org/wal.html#concurrency): one writer,
  checkpoint interactions and same-host shared memory requirements.
