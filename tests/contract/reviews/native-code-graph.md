# Native code graph review

The Graphify runtime, extraction runner, and five tool adapters are implemented
beside the TypeScript gateway. Production still uses TypeScript. Native component
credit is pending the full frozen-source gate. Seven isolated mutations were caught, and restored contract/native suites pass.

## Boundaries

- `services/code_graph/runtime.rs` preserves the pinned package/version, Python
  selection, managed and explicit executable probes, installation argv, metadata,
  and shared install lifecycle. Different native runtime handles use one process
  registry, matching the reference module's shared promises. Dropping a subscriber
  does not stop shared work; completion clears the registry key.
- `services/code_graph/runner.rs` preserves runtime preparation, version fallback,
  code-only extraction argv, query-log suppression, project cwd, cancellation,
  unavailable-executable errors, and modern/legacy output selection.
- `tools/code_graph.rs` preserves all five definitions and metadata, trimmed
  project requirements, optional owner/limits/mode forwarding, ranked summaries,
  path presentation, error conversion, and opaque context identity.
- The executor requires an explicit authorized cwd, environment, timeout, and
  concurrency limit. It uses argv directly, clears ambient environment, captures
  stdout/stderr separately with 16 MiB limits, and terminates the process group
  on Unix cancellation, output overflow, deadline, or dropped execution.
  This does not authorize installation or filesystem access.
- Installation state, project roots, output roots, engine execution, and package
  installation remain caller-authorized capabilities. The new modules do not
  activate a production route or discover credentials.

## Focused evidence

The reference drivers import the actual TypeScript modules. Extraction, Git
revision, and service ports are scripted where stated; graph algorithms and
SQLite/GraphRAG persistence run the real implementations.

- `gateway_rust_graphify`: 100 fixture cases cover managed runtime paths,
  configuration, version/Python selection, errors, installation, callbacks,
  sharing, extraction argv, cancellation forwarding, and output selection.
- `gateway_rust_code_graph`: 122 comparisons cover parser aliases, duplicate
  nodes/edges, dangling edges, numeric coercion, provenance, inert representations
  of JavaScript object-counter quirks, stable traversal order, ranking, path
  selection, bounds, and context caps.
- `gateway_rust_graph_store`: real SQLite lifecycle comparisons cover owner
  isolation, missing indexes, concurrent builds, full saved rows, GraphRAG JSONL,
  failed-build retention, retry/export reset, missing output, malformed JSON,
  UTF-8 replacement before hashing, and SQLite write failures.
- `gateway_rust_graph_tools`: 47 comparisons cover exact metadata, each method,
  project/owner arguments, errors and thrown values, empty paths, stable summaries,
  and execution-context identity.
- Eight native checks cover separate runtime handles, dropped subscribers,
  cancellation capability identity, retries, scope-separated paths, Git argv,
  subprocess environment/output channels, deadlines, capacity, and output limits.

Logs and isolated mutation artifacts are under
`.jait/artifacts/gateway-rust/code-graph/`. The sharing regression fails in
`code-graph-sharing-before.log` and passes in `code-graph-native.log` after
using the process-wide installation registry. Strict native Clippy passes in
`code-graph-clippy.log`.

## Pending service work and limits

`graph.rs`, `store.rs`, and `service.rs` implement the storage/query lifecycle
but do not yet receive service-component credit. The service currently passes
graphs through `serde_json::Value`; exact handling of lone UTF-16 surrogates and
deeply nested raw properties needs review and additional implementation before
claiming complete parser parity. SQL failure diagnostics beyond the tested trigger
case also need reconciliation.

The code-graph HTTP ownership/remote-node adapter is reviewed separately in
`native-code-graph-http.md`; its credit is controlled by the full native gate.
Supported Windows process behavior, full platform/resource/recovery gates, and
production activation are separate from these focused Linux checks. The process executor
adds explicit bounds; it does not establish filesystem authorization by itself.
