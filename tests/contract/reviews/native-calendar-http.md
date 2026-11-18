# Native calendar HTTP routes

Reference: packages/gateway/src/routes/calendar.ts.
Native: packages/gateway-rust/src/routes/calendar.rs, mounted explicitly through Gateway::with_calendar.

The native route adapter calls the already reviewed CalendarService through its bounded database worker. Six HTTP scenarios compare real Fastify and native loopback servers, with disposable migrated SQLite databases; only external Google responses are injected. The adapters do not reproduce the route logic. Assertions compare status, content type, complete response JSON or OAuth callback HTML, outbound Google requests, account rows and device snapshot rows. IDs, timestamps, OAuth state/challenges and PKCE verifiers are normalized; entropy shape is asserted, while PKCE derivation and state lifetime have separate service contracts.

Coverage includes:
- Required bearer/cookie login, deleted users, origin policy, credential owner separation and credential trimming/type errors.
- Redirect URI precedence (public URL, forwarded protocol/host, request host), JSON charset and exact callback content type.
- Device validation, inclusive 500-calendar/5000-event ceilings, persisted upserts, owner-filtered list/disconnect and failure effects after account insertion.
- Event query forwarding, decimal parseInt semantics (prefix, sign, hexadecimal-looking text, empty, invalid and overflowing input), dates, calendar selection and returned limits.
- Public callback error/success HTML, all five HTML escape characters, missing code, unknown/reused state, failed provider exchange, Google list failures and cross-owner access.
- Invalid JSON, prototype keys, invalid bearer precedence and origin checks on public callbacks.

A root service regression was reproduced: invalid limits returned two events in Rust versus none in TypeScript. The same HTTP and service coercion assertions pass after preserving JavaScript NaN behavior and numeric conversion; the Google request carries maxResults=NaN and final slice produces no events. Evidence:
.jait/artifacts/gateway-rust/calendar-http-before.log
.jait/artifacts/gateway-rust/calendar-limit-before.log
.jait/artifacts/gateway-rust/calendar-http-after.log

Three reversible mutations independently change the owner identity, reject the valid 500-calendar boundary and omit HTML escaping. Each fails the intended differential assertion; sources are restored in a finally block. Evidence:
.jait/artifacts/gateway-rust/calendar-http-mutations.json
.jait/artifacts/gateway-rust/calendar-http-mutation-{owner,snapshot-boundary,html-escape}.log

Focused tests cover JSON data and ordinary single-valued account/date/text query fields; repeated non-limit fields and runtime-specific malformed provider shapes are outside this slice's evidence. Runtime-generated TypeError wording follows the Linux Bun reference used by the contract driver. Public URL configuration is captured explicitly when constructing the native route state. Production startup remains unchanged. The source-bound native-progress/report.json determines credit and freshness.
