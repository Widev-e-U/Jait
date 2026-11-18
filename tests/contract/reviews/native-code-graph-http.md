# Native code-graph HTTP review

The opt-in Rust adapter implements the six code-graph HTTP endpoints. Component
credit is controlled by the source-bound native gate; production startup remains
on the existing gateway composition.

## Reviewed behavior

The contract driver starts the actual TypeScript Fastify server, database/auth,
and `registerCodeGraphRoutes`. Only the graph service and active-project listing
ports are scripted. Rust runs a real Axum listener with its database/auth adapter.
The comparison checks status, complete JSON body, content type, ordered project
lookups, service method, every forwarded argument, and cancellation-signal presence.

Seventy-five differential HTTP requests cover authentication, deleted users,
cookies, owner forwarding, missing and unowned projects, remote-node refusal,
body-over-query precedence, lexical path resolution, Windows-style root matching
on Linux, repository metadata fallback, all six endpoint results, graph-unavailable
and not-indexed errors, synchronous getIndex failures, missing paths, duplicate
query keys, invalid field types and validation short-circuit order. Numeric
prefix cases include BOM/plus prefixes, negative zero, decimal-only parsing and
rounding beyond the safe-integer range. Response comparisons are exact; no error
message or numeric normalization is applied in the test harness.

Malformed non-null field types produce the reference framework's 500 envelope;
missing, null and blank required fields retain their 400 behavior. The diagnostic
text follows the pinned Bun reference, including its inlined project expression.
That text may need updating if the reference runtime changes. Ownership and remote
checks still precede query/path validation, and denied requests have no graph
service effects.

A real TCP disconnect test verifies cancellation of the scoped index signal and
cleans up its listener even on assertion failure. Cancellation is forwarded only
to indexing, matching the reference. This adapter does not grant permission to
install Graphify or access arbitrary filesystem paths.

## Evidence

`gateway_rust_graph_http` passes nine tests: four differential batches (75 requests),
one native disconnect check, and four internal-driver bounds/protocol checks.
The new malformed-input regression failed before the implementation fix. A second
regression exposed the decimal representation of large parsed integers and passes
after using the existing ECMAScript number formatter.

Four deliberate changes in an isolated source copy were rejected: bypassed
project ownership, inverted remote-node refusal, treating invalid numeric fields
as missing, and disabled disconnect cancellation. The restored HTTP suite passes.
The snapshot and mutation logs are under
`.jait/artifacts/gateway-rust/runs/code-graph-http-20261024/` and
`.jait/artifacts/gateway-rust/code-graph/`. In the latter directory see
`http-mutations.json`, `http-mutations-restored.log`, `http-malformed-before.log`,
`http-numeric-boundaries.log`, and `http-numeric-boundaries-after.log`.

## Limits

This is HTTP-adapter evidence, not service implementation credit. Graph storage,
query algorithms and raw Graphify JSON handling have their own contracts; the
service's lone UTF-16 surrogate/deep-property and SQL-diagnostic gaps remain open.
Remote graph execution is explicitly refused. These Linux checks do not establish
Windows path/process parity, cross-platform readiness or replacement readiness.
