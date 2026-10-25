# Native nested-agent history persistence review

Reference: `lib/sub-agent-persistence.ts`. Native: `services/sub_agent_history.rs`
with `contracts/ecmascript_json.rs`. All three exports are implemented: extract full
payloads, replace full message bodies with lightweight stubs, and persist full rows.
This stores records only; it never starts or messages another agent.

An iterative JSON parser/stringifier preserves ECMAScript's UTF-16 strings (including
lone code units), f64 rounding/overflow/negative-zero semantics, duplicate-property
replacement, integer-index key ordering and serialization. It is native code, never
an eval or a JS process. Deep values do not depend on Serde's recursive Value parser.
The source's metadata typing, empty-content fallback rule, array-only segments/tool
calls, nonempty ID condition, root object/array handling and omitted fields are
compared through the real exports. Full JSON is stored separately while message
stubs retain only ID/performative/round/duration fields.

Persistence uses parameter binding, per-row non-fatal failure, one createdAt per
batch, and upserts that preserve original creation time. Trigger rejection does
not skip later records; a missing table never breaks the message write. No payload
means no clock access. Invalid dates propagate before any row writes. Date-engine
exception wording varies (Bun `Invalid Date`, native/Node-style `Invalid time value`),
so that supplemental test compares the error outcome and exact empty database
state, not engine wording; `sub-agent-date-error-wording.log` preserves the evidence.

Thirteen checks pass: nine component checks plus four bounded bridge guards. These
run actual source exports with real SQLite, compare exact extraction/stub wire JSON,
row values and raw stored hex bytes, exercise a 1500-level payload differentially,
and run a native 20000-level no-stack-growth regression. SQL injection text remains
data. Source and native agree on duplicate keys, JSON numeric overflow/underflow,
BOM/invalid grammar and UTF-16 escapes. Unicode storage initially failed (native
replacement character vs the source SQLite binding). The same test now passes
without changing its data assertions; raw hex comparisons strengthen it.

The reference Bun binding uses SQLite's legacy UTF-16 conversion, including BOM
removal/byte swapping and malformed-surrogate pairing. The native adapter preserves
those stored bytes using a safe ToSql implementation; JSON columns remain lossless.
The test read adapter separately models the current Bun runtime's replacement-
character decoding of invalid UTF-8 (the earlier runtime returned an empty string).
Raw hex comparisons remain intact, so read presentation cannot hide storage
corruption. The concurrent adapter correction is rechecked in
`.jait/artifacts/gateway-rust/channels-http/sub-agent-history-recheck.log`. Actual probes:
`sub-agent-binding-probe.jsonl`; before failure: `sub-agent-binding-before.log`.
SQLite's bundled sqlite3VdbeMemTranslate implementation was inspected to verify
conversion behavior. Node-specific SQLite binding behavior is a separate supported-
runtime validation boundary; no claim is made that malformed text has identical
read presentation in every SQLite client.

Two caught/restored mutations prove removal of full message data and preservation
of creation timestamps (`history-payload-mutations/`). Restored standard suites pass
in `policy-history-restored.log`; strict native Clippy passes. The JSON helper earns
no separate component credit. JavaScript engine stack-exhaustion thresholds/messages
are not treated as a portable data contract; native traversal is iterative.
Production message-write wiring remains separate. No migration, default DB access,
production source edit, external traffic, messaging or runtime activation.
