# Native Gmail and Outlook OAuth helpers

Reference: services/email/oauth.ts. Target: gateway_rust_calendar (companion
mail tests plus the already-verified native HTTP transport).
The actual TypeScript module compares independent provider credentials, missing/
blank credentials, provider-specific URLs/scopes/authorize parameters, URL/form
encoding, code and refresh grants, PKCE SHA-256 hashing and 50 native/reference
random verifier pairs. Thirty-eight token-flow cases cover provider errors,
malformed JSON, null response shapes, empty/partial token data and transport
failure. Email refresh-token and scope values retain the reference's nullish
semantics, which deliberately differ from calendar's string-only fields.

The module reuses the native reqwest transport and PKCE primitives; it contains
no TypeScript/Bun subprocess or token storage. External HTTP is replaced at the
network boundary with fixture responses, and provider requests/ordering are
compared. Only finite Unicode-scalar JSON and declared provider identifiers are
in the contract; engine TypeError messages from invalid response shapes are
normalized to an invalid-shape category. Exact integer/float JSON representation
is normalized by numeric value. No external OAuth requests or grants occur.

Mutations of Outlook's scope and email refresh-token semantics fail assertions.
Restored sources pass and strict Clippy passes.
Evidence: .jait/artifacts/gateway-rust/calendar-tests.log,
mail-oauth-refresh-mutation.log, mail-oauth-scope-mutation.log and
calendar-architecture-clippy.log.
