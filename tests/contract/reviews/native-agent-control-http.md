# Native agent-control HTTP routes review

Reference: `packages/gateway/src/routes/agent-control.ts`. Native: `routes/agent_control.rs`.
Candidate for the complete source-bound gate; these routes require explicit native mounting.

GET state and POST halt/resume use the existing authentication/origin policy and durable
owner-isolated service. Halt persists before asynchronous runner teardown; SQLite is released
while stopping, so reads and resume remain available. Service errors preserve committed state;
audit writing is optional and best effort. Audit inputs, outputs, action identities and partial
status match the reference. Validation uses installed Zod v4 code-point length after ECMAScript
trim; storage retains the service's independent UTF-16 limit. Unknown keys and nullish bodies,
malformed JSON, unsupported content types and poisoned fields have focused coverage.

`node tests/contract/run.mjs test --test gateway_rust_agent_control_http` passes seven
component tests plus four transport checks. Six scenarios compare real native HTTP requests,
SQLite rows, hook traces and audit records with the real Fastify/TypeScript route and service.
A native lifecycle test holds teardown pending while reading and resuming over HTTP. Failures,
missing/deleted/foreign users, hostile origins and optional/failing audit callbacks are covered.

Two restored mutations (reject exactly 500 characters; change partial audit status to success)
fail unchanged differential scenarios. The first mutation initially survived and prompted
explicit 500/501 ASCII and emoji cases. Those now catch the off-by-one defect. Restored source
passes all 11 checks. Evidence: `.jait/artifacts/gateway-rust/continuation-mutations/` and
`continuation-model-route.log`. Earlier code-point-vs-UTF16 parity reproduction is saved under
`agent-control-http/`.

No production TypeScript changes, live runner control or live transport activation. Teardown is
an injected asynchronous runner boundary, with the real native state service and database.
