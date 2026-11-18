# Candidate native authenticated chat application

This slice composes existing native services; it adds no whole TypeScript
`routes/chat.ts`, `tools/agent-loop.ts` or bootstrap-component credit.
The independently reviewed remote provider and consent executor are separate
inventory entries with their own actual-source comparisons and mutation controls.

`routes/chat.rs` authenticates through the existing AuthState helper (including
origin and current-user checks), loads active owned sessions on the bounded
SQLite worker, and constructs guarded execution context from server/DB state.
A trusted factory supplies model/tool configuration. Request bodies, text,
queries, in-flight sessions, individual/total stream bytes, channel capacity,
consumer waits and factory preparation are bounded. Both cancellation endpoints
check current ownership. Body drop cancels a retained turn task rather than
aborting its persistence cleanup. A separate terminal slot drains pending tokens
and completes even if a provider retains a sink clone. Shutdown closes admission,
cancels all active turns and drains before the shared database worker closes.

`runtime/chat_config.rs` requires explicit application/chat activation and
model endpoint/model configuration. Secrets are not Debug/Serialize; errors do
not echo supplied values; no dotenv, home directory or provider key is read.
The executable factory injects a fixed server prompt and advertises no tools.
User request fields cannot grant execution authority. Tool activation still needs
the appropriate registry/sandbox/node/scope adapters.

`chat_projection.rs` materializes bounded versioned native log records into
compatible user/assistant messages, toolCalls and segments in the same
transaction as each append. Same-clock records retain chronological visible
ordering and stable UI IDs. Projection failure rolls back events/activity/rows.
The read endpoint repairs old native development logs and windows visible rows.
Foreign TypeScript rows can be read with per-page raw and serialized byte caps,
but native model execution refuses them until an explicit importer exists.
A mixed foreign/native transcript fails closed. No schema migration is added.
Native tool replay continues from the event log, not lossy UI projections.

Tool lifecycle events use actual advertised names and validated arguments.
`tool_start` precedes dispatch; `tool_result` follows durable result acceptance.
Consumer failure at either boundary prevents subsequent effects and closes the
remaining batch with bounded failure records. Cancellation/timeout never converts
an unknown effect into a successful outcome. A timed-out started SQLite operation
may have committed; every later turn reloads the durable log under session lease.

Focused native evidence includes real TCP HTTP auth/origin/ownership tests,
concurrency/cancel/resume, output/backpressure bounds and retained-sink cleanup;
materialization/order/pagination/foreign-history/byte-limit and rollback checks;
and the complete configured Application with a real loopback HTTP model fixture,
auth registration and session creation, SSE completion, SQLite close/reopen,
model-history replay and active-stream shutdown with durable partial text.
The existing real model/consent/subprocess flow also checks tool event ordering.
All generated fixtures/logs are under `.jait/artifacts/gateway-rust/`.

The main browser is not yet connected: it intentionally cancels POST after
acceptance and relies on a separate subscription. This candidate uses consuming
POST SSE. It does not implement full rich request selectors, external CLI
activation, trajectory replay, main-UI compatibility, platform/resource acceptance
or operational cutover. The production TypeScript gateway is not replaced.

## Independent subscription continuation

The optional native router now exposes authenticated owned-session subscriptions
with durable IDs, Last-Event-ID replay, live fan-out and a deferred 15-second
heartbeat. Queue lag, byte ceilings, row ceilings and corrupt replay terminate
with `replay_required`; replay never skips a missing prefix and resumes live at
a later event. Subscribers are bounded globally as well as by active session;
disconnected entries are reclaimed during subsequent admission. Publication
follows SQLite commit on the same database worker.

The live-delivery regression holds the POST response until the independent
subscriber observes its event: dropping POST after headers cancels the current
development turn, so using only its response status tested cancellation instead.
Replay/resume/auth/ownership and live-delivery TCP tests pass. Additional native
regressions cover connection exhaustion/reclamation, fan-out/shutdown and explicit
replay truncation. This subscription transports native log records; the browser
protocol and detached POST lifecycle still require further integration and do
not earn whole chat-route or agent-loop credit.
