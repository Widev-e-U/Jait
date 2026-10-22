# Native jobs HTTP adapter

Reference: `packages/gateway/src/routes/jobs.ts`.
Native: `packages/gateway-rust/src/routes/jobs.rs`.

The adapter explicitly mounts the jobs collection, single-job operations, manual
trigger, run history and available-provider catalogue. It uses the native durable
scheduler, shared authentication and bounded SQLite worker. All routes enforce
owner identity, including the source's shared system-job rule. Trigger calls the
supplied authorized tool dispatcher; mounting does not start a scheduler timer.

API mapping preserves snake_case records, nullable metadata, agent-task inference
from cron-tool records, legacy agent_thread_job spelling, payload/title handling,
creation defaults and semantic patches. Clearing model removes it from both
metadata and a rebuilt agent payload. Nonsemantic edits retain existing input.
Semantic edits replace the source metadata subset, including its existing loss
of unrelated timeZone/once metadata; no stronger preservation policy is claimed.

Query parsing preserves repeated values, parseInt prefixes, default and bounded
sizes, negative and zero inputs and overflowing pages. Creation and patching
deliberately differ in boolean parsing and trimming as in the source. The route's
underscore normalization is distinct from the scheduler's dotted-name rule.

Provider visibility uses the native registry. Catalogue callbacks represent the
provider listModels seam; one failing catalogue yields an empty list for that
provider. Native list_jait_models expands the Jait catalogue with includeCloud
true and owner-specific settings through an explicit adapter. The optional,
unused providerAccountService parameter adds no behavior to the source route.

The reference driver calls the actual TypeScript routes, SQLite/Drizzle scheduler,
registry and server authentication hooks. Provider processes and network
catalogues are scripted at their existing component seams. No live provider,
credential file or network target is used. A deterministic clock makes all wire
timestamps comparable. Only generated UUIDv7 values are aliased; their version is
asserted. Responses, content types, dispatch input, callback traces and catalogue
call order are compared without dropping fields.

Focused validation currently includes nine component tests and four shared
transport checks. The ten original jobs route tests pass. Coverage includes
foreign-owner denials, shared jobs, cookie authentication, poisoned/malformed
JSON, primitive/array bodies, bad cron, legacy inputs, agent/system conversion,
model clearing, one-shot manual runs, pagination, callback and execution errors,
provider failure/visibility and injected SQLite create/update/delete/run failures.

Observed discrepancies corrected by the focused suite:
- Native floating-number JSON emitted integer page/size values differently.
- Error text containing generated job IDs needed the same precise aliasing as
  those IDs, without normalizing arbitrary user strings.
- SQLite statement errors and constraint errors have different Fastify envelopes:
  a missing table has no code field while trigger constraints retain theirs.
- All JSON outcomes, including early auth/parser errors, carry the reference
  content type; 204 deletion has no content type.
- A separate scheduler regression exposed split disarm writes; its correction
  and fail-then-pass evidence belong to the scheduler review.

Typed boundary: JSON bodies, scalar path IDs, provider model records and explicit
adapter errors. JavaScript prototype behavior is restricted by the shared body
parser. Generic malformed providers and panics remain adapter failures.
Asynchronous database admission can fail under load; it is surfaced as an error.
Job authorization, agent control, assessment scope and credentials remain the
responsibility of the supplied executor and existing preflight checks. No live
execution or production activation is enabled by this port.

Strict native Clippy passes with all targets and warnings denied. Six deliberate
mutations fail behavioral assertions: owner lookup, provider visibility, title
removal, model clearing, page-size cap and malformed-URL validation. The restored
full suite passes with the original native source hash. Logs and hashes are under
`.jait/artifacts/gateway-rust/jobs-draft/mutations/`.

Additional fail-then-pass cases cover the 1 MiB body ceiling, unsupported media
types and invalid percent/UTF-8 path components. Bad URL errors retain Fastify's
application/json content type and precede authentication; other JSON responses
carry charset=utf-8. This route-specific handling leaves shared parser behavior
for other adapters unchanged. The complete source-bound gate controls credit.
