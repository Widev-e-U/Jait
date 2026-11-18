# Persistent migration runtime bootstrap

The default native executable remains a stateless loopback health service.
`JAIT_RUST_APPLICATION=1` explicitly selects account/session composition and
requires absolute `JAIT_RUST_DB`, absolute `JAIT_RUST_PROJECT_ROOT` and nonblank
`JWT_SECRET`. No dotenv file, default home directory, provider credential, node,
scanner or command is discovered or activated. This development opt-in does not
activate a production service or establish full application readiness.

The composition uses the existing native AuthState, bounded SQLite worker,
SessionRoutes and all native migrations. Migration/open runs off the async
executor. Session and account requests share one worker. Health reads current
schema/users/active sessions through that same worker; a failed or saturated
worker returns 503 with only healthy:false. Normal shutdown drains HTTP then
closes the worker. Invalid configuration and non-loopback addresses are rejected
before a database is opened. Bind failure closes the newly created worker.

Rust-authored contract scenarios compare actual TypeScript createServer with
UserService, SessionService, SessionStateService, ProjectService and AuditWriter
against the native composition. They exercise first registration, invalid
password, unauthenticated access, bearer/cookie login, session creation, live
health updates, shutdown/restart with persistent cookies/data, invalid login,
session lookup/deletion and active count changes. The actual native SQLite file
is reopened by production TypeScript services and its owner/session state checked.

Normalization verifies signed tokens before removing nondeterministic bytes;
UUID identities remain consistent across responses and restart; timestamps and
uptime are normalized. Fault tests verify non-loopback/malformed opt-in/blank
secret do not create state and a broken schema fails health without exposing SQL.

This does not migrate the whole TypeScript server or config component. Provider
execution, chat orchestration, live WebSocket/SSE, static SPA, tool registry,
consent dispatch and operational cutover remain separate. No component credit
is added by this composition. Exact focused test results and source fingerprints
are recorded under .jait/artifacts/gateway-rust/.
