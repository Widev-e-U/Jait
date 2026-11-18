# Native Google Calendar and OAuth clients

References: services/calendar/google.ts and services/calendar/oauth.ts.
Target: gateway_rust_calendar. Ten tests (six domain and four transport) compare
actual TypeScript clients with native behavior at the external HTTP boundary.

OAuth contracts cover independent primary/legacy environment credential fallbacks,
JS whitespace, form encoding and field order for authorization, code exchange and
refresh, scopes, deterministic PKCE hashing, 50 random native and 50 reference
PKCE verifier/challenge pairs, and refresh-token fallback. Token cases cover empty
responses, optional scope, negative/zero/fractional expiry, finite-number String
conversion (including exponent thresholds), non-string access tokens and provider
error-description precedence. Calendar contracts compare profile fallback,
hidden/ID filtering, selected/primary semantics, nullable optional fields,
all-day versus dateTime precedence, organizers, attendee labels, URI-component
encoding and query encoding, malformed JSON/response shape and network failures.
Both clients propagate provider errors; malformed shape TypeErrors are normalized
to one invalid-shape category because engine-specific TypeError text is not a
native API contract. JSON numbers compare by value, normalizing only exact
integer/floating representations.

The native transport uses reqwest with Rustls, redirect following, JSON decoding
and gzip/Brotli/deflate/zstd support. A real loopback HTTP server proves successful
JSON, redirects, gzip decoding and JSON decode errors; all external Google
requests are replaced with deterministic test transports and dummy credentials.
Finite JSON numbers and Unicode scalar input strings are the tested contract.
No OAuth grants, tokens or external requests are made in these tests.

A real malformed failed-response mismatch (HTTP error with JSON null) fails
before correction and passes after correction. Four further mutations
(hidden-calendar inclusion, expiry default, refresh grant type and PKCE hash
input) cause assertions to fail. Restored sources pass focused tests and strict
Clippy. Evidence: .jait/artifacts/gateway-rust/calendar-tests.log,
calendar-null-before.log, calendar-clippy.log and calendar-*-mutation.log.
