# Native Jait steering compatibility

Native Jait steering now retains the original text as user input, matching
Codex CLI's pending-user-input semantics. Previously it inserted a system-role
`[STEERING]` instruction. Hidden internal notifications retain their existing
system-role handling. The change applies to the shared native chat loop and the
Jait worker provider; it does not depend on Codex or ACP.

Delivery remains FIFO at model-request boundaries after the current round's
tools finish. Steering during a final answer causes a continuation within the
same turn. It does not interrupt a stream, cancel tools, or undo prior effects.
The consumed event remains the transcript promotion point.

The worker provider now exposes `steerTurn(sessionId, message, expectedTurnId?)`
and emits its turn id on `turn.started`. It rejects empty input, idle/finished
or cancelled turns, and mismatched turn ids. Each turn gets a fresh queue.

The chat steer route accepts an optional `expectedTurnId`; malformed targets
return 400, mismatches and cancelled/inactive turns return 409. The current id
is included in the request SSE event, reconnect snapshot, durable active-turn
marker, and successful steer response. Existing callers omitting the expected
id retain their current session-targeted behavior. Callers requiring stale-turn
protection must send it explicitly.

Rust owns the scenarios and assertions in `tests/jait_steering.rs`. A bounded
internal-reference driver invokes the real `JaitProvider` and `runAgentLoop`,
replacing only model transport and a read-only fixture tool. Tests assert roles
and exact-once FIFO delivery in actual model requests, final-answer continuation,
tool-result ordering, invalid-turn rejection, and cancellation without leaking
pending input into a later turn. `tests/provider_steering.rs` also covers route
validation through real HTTP injection. This is TypeScript reference behavior
coverage; it does not establish native Rust gateway implementation parity.

Run:

```sh
node tests/contract/run.mjs test --test jait_steering --test provider_steering -- --test-threads=1
```
