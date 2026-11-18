# Native TCP assessment baseline

Reference: `packages/gateway/src/security/assessment.ts`. Native scope validation,
service execution and SQLite persistence are in `assessments/{scope,service,store}.rs`.
This component covers the TCP baseline, not the separate workbench scanners,
HTTP routes or assessment tool adapters. Production continues to use TypeScript.

The actual-source scope driver compares 89 validation cases. The service driver
compares snapshots, ordered dispatch, results, errors, ownership, exclusions,
method/node/expiry rejection, pre-aborted and in-flight cancellation, first stop
cause, probe errors, rate/duration limits, completed-result persistence failure,
initial write failure and lease release, history limits and restart recovery.
UUIDs, engine/runtime identity and trusted execution-host names alone are normalized.
A real connection comparison uses only the contract-created loopback listener.
Injected clocks and probe ports make lifecycle failures deterministic; the native
monotonic run budget survives a backwards wall-clock jump. Independent native
service instances share the existing process-wide execution lease.

Two reproduced defects were fixed: the eagerly started first probe was discarded
and dispatched again, and a clock jump during that probe incorrectly erased its
completed observation. The first future is now consumed once, while policy still
precedes every new dispatch. Four deliberate native mutations (duplicate dispatch,
owner bypass, budget cause, exclusion bypass) fail assertions and restore exactly.
Evidence: `.jait/artifacts/gateway-rust/assessment-draft/`.

Native transport identity is explicit (`tokio-tcp-connect`, native package/profile
version), rather than misreporting a Node engine. The configured host identity is
trusted configuration; persisted scope node/profile/vantage must match before
native execution. No DNS, redirect, URL or shell path reaches this connector.
Per-dispatch permits cannot be constructed/deserialized outside the service and
carry a single literal IPv4/port plus scope/operator/expiry. Cancellation drops
owned pending connector work. Runtime options and injected ports are trusted host
configuration, not public request fields. Non-JSON JS values and malformed
persisted records are outside the JSON DTO equivalence claim. Supported-platform
network behavior and full application wiring remain separate readiness gates.

DeepSeek via Ollama provided a source-free, general test-scenario checklist; its
suggested cancellation/persistence semantics were checked against the actual
reference rather than adopted as requirements. No repository source was sent.
Full source-bound validation controls component credit.
