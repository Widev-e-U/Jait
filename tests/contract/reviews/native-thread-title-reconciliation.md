# Native thread-title generation reconciliation

Reference: `packages/gateway/src/services/thread-title.ts`. Canonical native
implementation: `src/services/thread_title.rs` and its `thread_title_generation.rs`
child. The existing normalizer is reused; generation is implemented natively,
with explicit provider, HTTP and shared-LLM ports. This is one source component.

The actual TypeScript implementation is transpiled with only its shared-LLM
imports and 30-second timer replaced by fixture ports/virtual time. No handwritten
reference copy is used. The driver guards both substitutions and restores timers,
fetch and globals. Successful strings compare UTF-16 code units, including an
unpaired surrogate produced by JavaScript's 80-unit truncation.

Focused contracts compare provider session filtering, streamed tokens, full
assistant-message replacement, both completion events, event/send errors, thrown
values, completion-before-send-error ordering, prompts and unsubscription. Native
paused-clock checks enforce pending at 29,999 ms and ready at 30,000 ms; dropping
the caller unregisters its subscription. The deadline assertion polls directly;
awaiting it previously allowed Tokio to auto-advance past a regressed deadline.

API comparisons cover shared configuration forwarding, absent/null model fields,
key/base URL/model precedence, trailing slash cleanup, OpenAI content parts,
Ollama content, status/JSON/dependency failures, malformed responses, missing keys,
512-token headroom, whitespace, protocol rejection and word/UTF-16 truncation.
The asynchronous event-before-send-rejection case failed before reconciliation
and passes with queued events settled before the later send error.

Compatibility decision: preserve TypeError versus ordinary Error versus thrown
JSON. Only engine-generated TypeError source-expression spelling is canonicalized
by the oracle: null access retains the failing `choices`/`message` property, and
non-string Ollama content retains the missing `trim` operation. Bun's transpiler
can inline or rename local variables, which changes those diagnostic strings.
Application errors and host dependency messages remain exact. Existing session
HTTP title/fallback comparisons retain the client-visible route behavior; this
module does not register a route or alter fallback policy.

Limits: supplied provider/HTTP/completion ports retain ownership, consent,
credentials, destination/DNS/redirect policy, byte/rate limits and cancellation
of external effects. Subscription cleanup is not proof a provider turn stopped.
The local title event receiver mirrors callbacks; production integration still
needs bounded delivery and supervised provider resources. No transport/provider
engine, production activation or replacement readiness is credited here.

Evidence is under `.jait/artifacts/gateway-rust/chat-loops/`:
`thread-title-race-before.log`, `thread-title-race-after.log`,
`title-reconciled-focused.log`, `title-typescript-focused.log` (20 tests).
`title-mutations.json` and `title-mutations-restored.log`: all eight isolated
regressions caught (session identity, assistant replacement, completion ordering,
unsubscription, exact timeout, token budget, credential precedence and HTTP status);
restored suite passes all 11 checks (seven title contracts plus four harness checks).
`title-client-fallback.log`: client title/fallback comparison passes. A complete
frozen-source gate is required before advancing the passing checkpoint beyond 225.
