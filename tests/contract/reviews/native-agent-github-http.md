# Native per-agent GitHub App HTTP adapter

Reference: `packages/gateway/src/routes/agent-github-apps.ts`. Native candidate:
`packages/gateway-rust/src/routes/agent_github_apps.rs`. Focused comparisons pass; the completed frozen checkpoint remains pending.
Production remains TypeScript; the credential service is not implemented by this
adapter. The existing shared GithubPort owns key storage, signed state validation,
owner lookup, credential verification, connection persistence and outbound effects.

Reviewed boundaries: authenticated routes resolve the session owner before service
calls and check optional agent existence (except disconnect, matching reference).
Callback and webhook remain public because signed state and per-owner HMAC are
their authority. Callback never uses an ambient browser identity. Webhook resolves
App owner before installation fallback, verifies the exact raw bytes with a
constant-time equal-length SHA256 signature comparison, and forwards a delivery
only after verification. The optional awaited delivery sink may fail without
changing GitHub acknowledgement; its supervision belongs to the composing host.
The parser is local to the webhook adapter and does not change other JSON routes.

The HTTP presentation preserves request defaults, setup base-URL forwarding,
installation syntax, service-call ordering, redirect encoding and caught versus
uncaught service errors. Connection projection and secret omission rely on the
credential-service contract; the adapter must not grant authority to arbitrary
client identity or an untrusted service implementation. Host integration, real
GitHub delivery, production routing and platform acceptance remain open gates.

`tests/contract/drivers/nativegithubhttp.ts` imports the actual reference route;
only its service and delivery ports are scripted. Native tests compare HTTP
responses, redirect locations and ordered port events. Credential fixtures are
synthetic. Independent node:crypto and hmac crate signing constructs request
signatures; native verification uses the existing jsonwebtoken crypto backend.
Ten HTTP comparison groups and five existing tool comparison groups pass (24 checks
including eight repeated subprocess transport checks). Edge cases include callback
repeated parameters and UTF-16 truncation across a surrogate pair, explicit parser
isolation and malformed URLs/bodies, absent checker/sink, owner identity and duplicate
signature rejection. The fixture serializes header arrays to Node's joined wire
representation before either implementation receives them. Bun's null-payload and
invalid UTF-16 diagnostics are intentional compatibility behavior, not generalized
Node error text. Full frozen validation and six native/reference security/ordering
mutation controls are required before recording a completed checkpoint.
