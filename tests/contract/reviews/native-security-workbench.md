# Native security workbench

References: security/workbench.ts, routes/security-workbench.ts,
tools/security-tools.ts and tools/security-workbench-tools.ts in the TypeScript
gateway. These are four source components. The assessment scope validator,
TCP service, shared execution lease and underlying scanner/protocol engines
are separate inventory rows and receive no duplicate credit.

The native service uses the existing owner-scoped AssessmentService and
process-wide assessment lease. Authorize checks method, gateway execution,
expiry, target/exclusion, port, SNI, SSH identity, filesystem path and profile
requirements. Private-field permits reach adapters and closed engine requests.
The dispatcher preserves each protocol/engine call, Nmap target filtering,
Nuclei's deterministic HTTP follow-up and single-file telemetry cleanup.
Native scanner/OS/transport implementations are separate typed ports; these
ports must retain the permit, bound I/O and honor cancellation. They neither
discover targets nor confer permission, and no scanner is activated by this
batch. External engine integration remains uncredited until implemented.

The orchestration includes initial persistence and admission rollback,
first-stop cancellation versus run-budget expiry, result/finding limits,
SHA-256 evidence identities, finding snapshots, retained risk decisions,
remediation and rollback plans, repeated verification, baseline comparisons,
report aliases, raw artifact byte limits and owner-scoped deletion. SQLite
operations use fixed SQL on the bounded database worker. Finding history
survives raw-evidence deletion. Restart marks running persisted checks
interrupted. Replacing a configured service retains the original task's lease.

Differential service checks exercise the actual TypeScript class with its
existing overrideAdapter seam, actual SQLite, controlled wall time and IDs.
Only the assessment dependency, randomness and clock are substituted. The
default-dispatch suite invokes the actual dispatch method with owned engine
and snapshot dependency ports; branch/merge/finally logic is unchanged.
Environment-only substitutions bind readFile/readdir to fixture-owned snapshots.
Assertions compare complete results and ordered calls. IDs and time are
deterministic; no field normalization weakens scope or verification checks.
Typed adapter outputs use JSON-compatible records and scalar strings. Malformed
persisted JSON is rejected; engine-specific parser diagnostics are not part of
the portable native API.

The tool suite compares full metadata plus 199 scripted scenarios against the
actual two factories. It checks owner/node and original cancellation capability
forwarding, summaries and limits, errors/non-Error throws, saved-result fallback
and monitor lifecycle. Monitors authorize before creating a job, retain stored
inputs on update, use the first baseline and disable expiry at its exact boundary.
Scheduler and assessment services remain independently responsible for execution
authorization; presentation adapters grant no underlying engine credit.

HTTP contracts use actual authenticated loopback requests against Fastify and
Axum, with explicitly scripted service/monitor ports. They compare success and
failure statuses, both users, cookie/bearer denial, input forwarding, encoded IDs,
null/missing body short-circuits and monitor attribution. Monitor request IDs and
the fixture project path alone are normalized; the gateway node and operator
are compared exactly. The registry port connects these routes to the native
service. The router is opt-in and production mounting remains unchanged.

Evidence: .jait/artifacts/gateway-rust/security-workbench/. The service and
dispatch suites catch ten deliberate regressions and restore sources; the tool
suite catches thirteen. The HTTP suite has a separate three-mutation run.
Required focused checks, strict Clippy and the frozen full gate must pass before
this review earns component credit. Reference test-declaration reconstruction,
supported platforms, resource measurements and production replacement remain
separate gates. No live network probes, external messages, job execution,
deployment or production database access occur in these contracts.
