# Context and cost controls

Jait keeps full tool results for the UI and durable conversation record while projecting a smaller, recoverable view into the model context. This applies to Jait's native loop and authenticated MCP results used by external providers. It does not change assessment authorization, tool consent, redaction, path boundaries or the model selected by the user.

## Tool evidence

The default model-facing result budget is 8,000 UTF-16 characters. Complete text evidence is kept under the existing session-state namespace `context.evidence.v1`, scoped to user and session. The deferred `context.read` tool retrieves pages using an opaque reference, an offset and a 2–8,000 character limit (4,000 by default). Pages are untrusted data. Explicit recovery pages retain their complete requested content instead of being shortened a second time; JSON escaping can put their wire size above the ordinary result budget. Unicode boundaries are preserved. The original action is never repeated to recover its output.

Evidence expires after 24 hours. Each session ledger retains at most 2 million characters and individual items at most 1 million. Old records are evicted when a new write exceeds that budget. Unauthenticated callers, storage failures, oversized items and expired/evicted references never claim that recovery is available. Their complete UI/persisted tool records remain the fallback; model projections disclose the recovery gap. Memory-only fixtures cap the number of cached sessions at 128. Persistent ledgers are session state and are removed with their session; reads enforce expiry, and subsequent writes reclaim expired entries.

At context pressure the native loop demotes older recoverable tool bodies to short references and deduplicates repeated evidence. The newest tool results, user messages and tool call arguments stay intact. Pruning never reruns an action or replaces canonical UI evidence.

## Accounting and compaction

The native loop anchors context decisions to provider-reported request/completion usage. Only appended messages are estimated. Fingerprints bind the anchor to provider/model/tool identity and the provider-visible prefix. A changed prefix, model/tool set or rewind rejects the anchor. Small anchors persist separately in `context.accounting.v1`; unavailable or invalid anchors fall back to explicit estimates until fresh usage arrives.

Default compaction pressure is the lower of 75% of the window and 64,000 tokens. Deterministic evidence pruning runs before paid summarization. Completed-turn and active-turn summaries are staged in a candidate history; growing or insufficiently useful summaries are not committed. The 60-second attempt cooldown prevents repeated paid work; a structural no-op does not arm it, and 85% window pressure bypasses it. Emergency overflow recovery remains bounded. Recent rounds and the active user request are preserved.

External ACP providers own their context. Jait watches their actual context occupancy and advertised commands. Only an advertised `compact` or `compress` command can trigger a native compaction; a missing capability/occupancy leaves provider history alone. Calls have a 60-second deadline and cancellation on failure. Local transcript shortening is never treated as native provider compaction. Other external transports retain their native context management; unsupported controls are not simulated with free-form summarization prompts.

## Caching, auxiliary work and costs

OpenAI requests use a stable hashed session cache affinity key. Claude through OpenRouter uses a static system breakpoint and up to three recent eligible message breakpoints. Stored history is not mutated, and message content-part shapes remain stable as rolling markers move. Tool messages are excluded from unsupported envelope markers. Other backends receive no speculative cache extensions.

The conversation model never silently changes. An explicitly configured auxiliary model can perform summaries, whose input is independently bounded with a recovery notice. On-demand tool discovery remains enabled and external-provider instruction scaffolding is shortened. Per-request cost estimates are emitted only when the caller configures prices and the provider supplies the complete input/cache-read/cache-write/output partition. Unknown counters are not zero, estimates are not invoices, and no percentage saving is promised. Existing CLI cumulative/turn usage accounting remains in effect.

Configuration:

- `JAIT_CONTEXT_BUDGET`: JSON overrides for `toolResultChars` (1,024–30,000), `historyTokens` (4,096–1,000,000), `tailToolResults` (1–64), `compactRatio` (0.25–0.90), `compactCooldownMs` (0–900,000), `minimumSavingsRatio` (0.05–0.90), and `cacheTtl` (`5m`/`1h`). Invalid JSON/non-object input uses defaults.
- `JAIT_COMPRESSION_MODEL`: explicit summary model on the configured backend. No credential or provider switching occurs.
- `JAIT_COMPRESSION_CONTEXT_WINDOW`: auxiliary window, above 8,192 tokens; set it when the summary model has a smaller window. Programmatic callers may instead provide a complete `compressionLlm` route.
- `JAIT_TOKEN_PRICES`: configured per-million-token prices `{ "input": 2, "cachedInput": 0.1, "cacheWrite": 2.5, "output": 10, "currency": "USD" }`. These example numbers are not a current price list.

## Rust migration contract

`gateway_rust_context_budget` is a mandatory target of the native validation command generator. Rust owns each feature's vectors and expected assertions, compares production TypeScript with the native policies, and tests a combined native evidence/pressure flow. A separate Rust-owned acceptance fixture executes the real TypeScript agent loop and MCP recovery path. That reference-runtime test is not passed off as a native gateway runtime test.

Native policies live in `services/context_budget.rs`, `providers/context_control.rs` and `tools/context_evidence.rs`. Prompt prose is synchronized through the existing extraction tool and prompt parity target. Source fingerprints and mutation controls must remain fresh. Passing these component contracts does not establish that the complete Rust gateway is ready to replace the running TypeScript gateway.
