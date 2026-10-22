# Native session and project UI state

`gateway_rust_ui_state` compares production TypeScript services with native SQLite
services on isolated, fully migrated databases. It checks exact JSON values,
serialized stored text, row order, timestamps, filtering, upsert/deletion,
malformed legacy JSON, cross-session key lookup, partial failures, and reopening
native file databases. Project legacy migration checks first-read response versus
subsequent durable state, missing versus empty key filters, truthy unified state,
nullish layout fallback, inherited legacy property data, and cleanup failures.

The two state services were already credited at the 45-component checkpoint.
This batch strengthens their implementation and contracts without new component
credit, and consolidates into the existing `json_state` module. These services intentionally have no owner check;
callers authorize the containing session or project. The HTTP tests exercise
session ownership before state access. The stored JSON corpus uses finite numbers
and well-formed Unicode. Legacy nonfinite numeric JSON and lone-surrogate parsing
are not established by this review.

`gateway_rust_session_http` exercises actual loopback HTTP against Fastify and
Axum with real migrations, users, sessions, projects, state, and audit storage.
The reference busy predicate, node lookup/access, hook/broadcast sinks and title
HTTP peer are explicit fixtures. There are no external requests or paid provider
calls. Responses, stored records and ordered events are compared exactly; only
validated generated UUIDv7 identities are replaced with stable symbolic values.
Title normalization additionally compares all UTF-16 code units for 125 cases.

The HTTP component was **candidate** at this checkpoint. The later review in
`native-session-http.md` closes the concrete optional-route, HEAD, framework
parser and reduced-ISO/legacy-date gaps with actual-source differential tests.
Its source-bound gate now determines focused component credit. Exhaustive legacy
ECMAScript Date.parse input coverage and provider/platform integration remain
separate limitations. The typed title/runtime adapters do not
constitute implementations of provider transport, live chat execution or WebSocket
transport. The standalone entry point remains unchanged; session routes require
explicit opt-in via `Gateway::with_sessions`.

The initial HTTP contracts exposed native metadata key reordering: native
`{"chat":{"model":...,"nodeId":...,"provider":...}}` differed from the
TypeScript insertion order. Ordered raw JSON objects now preserve insertion and
ECMAScript numeric-key order while retaining raw UTF-16 values. Existing session
contracts continue to pass. No JSON-text assertion was normalized away.

The inherited-project-state regression fails against the previous native store:
`project.ui` is missing, while the reference migrates the inherited panel data.
The consolidated store passes the same assertion.

Five mutations prove that assertions detect cross-session state reads,
incorrect empty-filter migration, metadata reordering, missing HTTP ownership,
and title overwrite after a concurrent rename. Each mutant failed the relevant
unchanged contract; restored sources passed. Logs and structured mutation results
are under `.jait/artifacts/gateway-rust/`. The first UI-state run also rejected two
invalid duplicate-row fixtures because current migrations enforce unique keys;
those setup fixtures were corrected before the behavior checks passed.

Run `RUST_TEST_THREADS=2 bun run test:gateway:rust` for the source-bound gate.
Production replacement readiness and the 181/361 implementation milestone remain
open.

## Conversation tools

The native list-preview helpers, session.search adapter and chat.traces adapter
are new components. Tool names, descriptions, parameter schemas and permission
metadata are embedded declarative data checked against the actual TypeScript
constructors. The native implementations call the real ported history services;
there is no TypeScript runtime dependency. Tests use schema-valid tool inputs,
real SQLite FTS and migrated records, with context ownership replacing any
input-supplied owner. Search previews retain full returned data; trace messages
limit displayed threads to six without truncating data. Shared preview contracts
check ECMAScript whitespace, UTF-16 surrogate boundaries, default/fractional/
negative/nonfinite budgets, summaries and memory/reminder suffixes. The three
components remain separate from tool registry, consent and production dispatch
integration, which are still pending.

`gateway_rust_conversation_tools` passes 11 tests (including four subprocess
transport checks). Preview-budget, search-owner and trace-owner mutants fail the
same assertions; restored sources pass. The contracts inherit the native history
services' documented finite-JSON and database-timestamp coverage limits.

## Storage gate workload bound

The full candidate gate and the isolated 76-prefix storage test both exceeded the
unchanged ten-second reference-driver deadline while generating all database
pairs in one request. Reference fixture generation now uses batches of eight.
The test verifies that every requested prefix appears exactly once, in order,
and retains every schema/data/backfill/integrity/foreign-key/idempotence
assertion. Each subprocess still has its ten-second deadline. The same 76-prefix
comparison passes after batching (28.62 seconds across the full multi-call test).
No migration code or timeout was changed. Host resource pressure is not proven.

## Title protocol rejection regression

The source now rejects tool-protocol payloads after title cleanup and before
truncation. Running the previously ignored contract with `--ignored` reproduced
native output `<tool_call>` instead of the source's fallback. The native normalizer
now matches the case-insensitive protocol-prefix and boundary rules. The test is
enabled, and an additional real-source comparison preserves similar legitimate
titles, non-ECMAScript whitespace and ordinary prose. All 21 session HTTP checks
pass, including both protocol tests; `title-protocol.before.log`,
`title-protocol.after.log` and `graphrag-mutations/restored.after.log` record evidence.
The thread-title source component still receives no credit: provider turn/API
execution remains unported. Session-route candidate limitations above remain open.
