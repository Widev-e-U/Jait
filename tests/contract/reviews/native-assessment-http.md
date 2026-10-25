# Native assessment HTTP routes

Reference: `packages/gateway/src/routes/security-assessments.ts`.
Implementation: `routes/security_assessments.rs`, explicitly mounted through
`Gateway::with_security_assessments`. The standalone default remains health-only;
production TypeScript mounting is unchanged. The host supplies an assessment
registry and an optional project-session database independently of authentication.

The actual TypeScript server and native loopback HTTP server compare all five
registered operations: history, scope creation, run creation, run lookup and
cancellation. Fixtures use real migrated SQLite storage in both implementations;
the native auth/project and assessment workers share a fixture database. The
only injected service behavior is a blocked/cancellable TCP probe: these route
contracts never assess any external target. The service target separately tests
the actual connector against a test-owned loopback listener.

Contracts cover anonymous/deleted callers, owner isolation, cookie/origin rules,
202/400/401/403/404 status and bodies, scope validation, absent/null/malformed
bodies, missing runs, cancellation, unavailable project database, absent/foreign/
deleted project sessions, cross-owner projects, remote metadata/project nodes,
invalid/null persisted metadata, relative path escape and SQLite read failure.
Request body fields never supply the project root or bypass the session lookup.
Bound SQL retains session owner, live session and project-owner predicates.
Generic HTTP transport/unknown-route/platform fallback behavior is not credited
by this target. The native auth/body-parser contracts retain their own coverage.

Random IDs, trusted host/engine identity and observation timestamps are normalized.
JSON parser diagnostic wording alone is normalized for malformed stored metadata;
both engines must still return the matching rejecting status. Null metadata and
null versus absent request bodies retain exact property/error ordering. Raw
non-JSON JavaScript input objects are outside the DTO boundary.

Sensitivity checks deliberately remove the session owner and project owner
predicates, permit a remote project node, and change the start response status.
The assertion failures and source restoration are recorded under
`.jait/artifacts/gateway-rust/assessment-http-draft/`. The restored differential
contracts, strict Clippy and full source-bound gate control component credit.
No model-generated draft is accepted as parity evidence.
