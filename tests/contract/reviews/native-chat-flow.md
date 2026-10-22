# Candidate native chat/tool composition

This continuation connects the previously separate provider transport, consent
executor, bounded process runner and persistent session storage. It is an opt-in
Rust composition, without a mounted chat HTTP route or production activation.
It does not earn the TypeScript chat route or full agent-loop component credit.

`runtime/chat_turn.rs` accepts only server-configured model/tool definitions and
an authenticated execution context. Model function names map through the exact
advertised tool map; ambiguous dot-to-underscore aliases, malformed JSON objects,
conflicting IDs and incomplete tool batches cannot dispatch. Bounded rounds,
tool calls, elapsed time, history, output and cancellation limit the turn. Tool
results retain their correlation IDs, including rejected or interrupted calls.
Streamed content/thinking is capped at 128 KiB combined (and reduced near the
history ceiling). Partial text is saved on cancellation, timeout or provider
failure using a bounded cleanup grace of at most five seconds. Tool batch
admission checks exact serialized event overhead and worst-case escaped result
space before any external effect. Predictable storage exhaustion therefore
rejects the batch before execution.

`runtime/chat_store.rs` binds ownership to an explicit AuthState worker, owner
and session. Every read/write checks that the session remains active and belongs
to the owner. Versioned `rust.chat.message` records use the existing
`session_events` schema and its shared monotonically increasing log IDs.
Transactions update activity time. Event/count/byte limits reject excess data;
corrupt or unsupported logs fail without exposing SQL. This development log is
separate from the production UI messages projection and does not import existing
TypeScript conversation history. No database migration or environment variable
is added by this slice.

`runtime/chat_sessions.rs` holds bounded shared application admission and a
session lease across load, execution and persistence. Clones share admission;
abort/error/cancellation releases the lease. It rejects context/store identity
mismatches before provider or tool work. Applications must share this manager
for the candidate log; it is not a distributed/multi-process lock. A timed-out
SQLite write may have committed: a subsequent turn must reload the log, and
incomplete tool history fails closed rather than replaying an unknown effect.

The concrete integration check in `runtime/chat_flow_tests.rs` uses an actual
owned loopback HTTP SSE fixture, a real ConsentManager approval, an actual
bounded argv subprocess (`/usr/bin/printf`), persistent SQLite close/reopen, and
a second model request built from the saved history. All commands and network
traffic stay inside the explicit fixture. This verifies the candidate turn
path, not browser, WebSocket, external provider credentials or cutover readiness.

Focused contracts also compare consent dispatch with the real TypeScript
executor. Provider regressions exercise chunk boundaries, reasoning separation,
multiline SSE, finish signals, completion without socket EOF, conflicting tool
slots, malformed/oversized output, cancellation, redirects and redacted errors.
Evidence logs for this continuation live in
`.jait/artifacts/gateway-rust/chat-workflow-*.log` and
`.jait/artifacts/gateway-rust/consent-executor-continuation.log`.
