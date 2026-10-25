# Native thread-title generation review

Reviewed 2026-10-24. Reference: `packages/gateway/src/services/thread-title.ts`.
Native credit remains contingent on the complete source-bound gate.

`services/thread_title.rs` and `thread_title_generation.rs` implement title normalization,
provider-turn collection and direct API dispatch policy. Provider subscriptions,
turn sends, authorized HTTP transport, and the existing shared Jait LLM configuration
and completion helper are explicit dependency ports. This grants no provider, HTTP
engine, shared-LLM implementation or production activation credit. Ports retain
session ownership, credentials, URL policy, connect/overall deadlines, output limits
and cancellation. No endpoint, credential or running session is discovered.

The turn collector subscribes before sending, filters session identity, appends tokens,
replaces them with full assistant messages, accepts either completion event, preserves
event-before-send-rejection precedence and propagates provider errors. Its 30-second
deadline and subscription cleanup also apply when the caller drops the native future.
The HTTP policy preserves OpenAI/API-key selection, model and base-URL precedence,
request headers, prompt trimming, the 512-token reasoning allowance, response content
selection and title cleanup. Shared backend resolution and completion arguments are
compared without granting completion-helper credit. Ollama uses its configured model
and non-streaming chat request. HTTP errors are checked before parsed content.

`gateway_rust_thread_title` imports the actual TypeScript module through a test-only
transpilation that replaces only its shared-LLM dependency binding and shortens its
30-second timeout to 5 ms. The original timeout binding is checked before replacement;
native paused-time checks independently verify 29,999 ms pending / 30,000 ms rejection.
Six differential batches check provider callbacks, asynchronous ordering, subscription
and send failures, credentials/model/request arguments, successful/error HTTP responses,
malformed JSON response shapes, shared-LLM dependencies, protocol rejection, whitespace,
Unicode and truncation. Error names and messages are compared; only engine-specific
source-expression spelling for null-property/invalid-trim TypeErrors is canonicalized,
retaining the failing property and operation. API results are compared as UTF-16 code
units so truncation through a surrogate pair cannot be lost in the test JSON transport.
Existing `gateway_rust_session_http` title checks provide additional normalizer coverage.

The TypeScript continuation also fixes cleanup when provider subscription or synchronous
send throws, and makes repeated cleanup idempotent. Twenty title unit cases pass,
including regression checks for both failure paths and completion preceding a rejected
send. Workspace typechecking passes. Existing unchanged reference test AST calls were
matched byte-for-byte against the prior fingerprint-matching HEAD before retaining
review mappings; the three new cleanup declarations remain pending in the separate
translated-reference ledger. The changed source-policy row also remains pending there.

Typed string inputs from dependency ports use Rust Unicode scalar strings; UTF-16
output truncation is preserved. Arbitrary raw JSON string transport with lone input
surrogates remains a separate parser/transport boundary and receives no credit here.
Six frozen mutations were caught: wrong-session acceptance, full-message append,
wrong deadline, listener leak, direct API token budget and shared completion budget.
The restored 11-test target passes. Evidence: `title-mutations.json` and
`title-frozen-restored.log` under `.jait/artifacts/coverage-goal/`. The existing
source-review timeout vector now expects the shared cleanup to clear its timer
handle, while retaining exact unsubscribe and pending-timer assertions.

See `.jait/artifacts/coverage-goal/` for focused checks, frozen mutation evidence and
subsequent full-gate reports. No production deployment or public release is included.
