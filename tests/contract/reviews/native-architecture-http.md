# Native architecture HTTP adapter

Reference: routes/architecture.ts. Target: gateway_rust_architecture_http.
Gateway::with_architecture explicitly mounts the adapter. Standalone startup
does not enable it. Real Fastify and native loopback HTTP endpoints compare
GET/PUT/HEAD, authenticated users, bearer/cookie behavior, deleted users,
origin denial, required values and JS whitespace, projection of only public
diagram fields, and file-first versus owner-specific legacy storage.

Framework cases cover null/array bodies, non-string properties, duplicate query
values, malformed/empty JSON, unsupported MIME and poisoning-property rejection.
A denied system path is rejected before filesystem access. A SQLite trigger
fails an update after the file write: both implementations return the same
trigger code/message and the next read sees the new file with prior DB metadata.
Only nondeterministic updatedAt values are normalized, after checking ISO format.
No response fields or errors in these cases are removed. Native errors preserve
the tested Bun TypeError text and common SQLite extended codes. Other platform-
specific filesystem messages and arbitrary prototype-shaped invalid values are
not established by this focused adapter contract.

Three domain tests and four transport checks pass. Initially the contracts
failed on runtime/SQLite error bodies and unsupported-media error text; the
adapter now matches those responses. Mutations removing owner scope or exposing
the private owner field fail assertions; sources are restored.
Evidence: .jait/artifacts/gateway-rust/architecture-http-tests.log,
architecture-http-owner-mutation.log, architecture-http-projection-mutation.log,
calendar-architecture-clippy.log.
