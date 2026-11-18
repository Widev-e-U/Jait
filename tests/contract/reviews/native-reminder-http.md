# Native authenticated reminder HTTP

Reference: `packages/gateway/src/routes/reminders.ts`. `routes/reminders.rs`
implements list, Markdown export, create, patch and delete on the native reminder
store. All SQL uses the existing bounded AuthState database worker. Construction
and mounting are explicit. Verified user IDs select rows and create ownership;
request userId fields cannot override them. Optional memory/project/session/thread
capabilities are caller-supplied and receive the same method arguments as source.
Their implementation or activation receives no extra credit from this adapter.

`nativereminderhttp.ts` runs the actual route registration and actual reminder,
user and migrated SQLite services in the existing production Fastify server.
Only optional service ports and a fixed fixture clock are scripted. Rust mounts
its real Axum router and uses independent migrated storage. Both sides execute
real loopback HTTP with bounded clients and consumed responses; no live data or
external service is used. The initial Fastify inject experiment hit a Bun /
light-my-request double-header failure, so the fixture now uses the same network
transport as the other native HTTP contracts.

The comparison includes every status/body, JSON and Markdown content types,
export disposition, final stored rows and exact optional-port calls/order. Cases
cover bearer/cookie/missing/deleted users, cookie-origin rejection, authorized
bearer origin behavior, request user spoofing, foreign reads/exports/patch/delete,
create content and source defaults, nullable patch fields, invalid statuses,
missing-record precedence, malformed/primitive JSON inputs, mixed tags, active /
archived / all and project/session filters, duplicate query parameters and parseInt
limits. Optional dependencies enforce owned project/session checks on creation,
engine-memory inclusion/exclusion and shape, project counts/pagination, thread
metadata, native-delete short circuit, engine-forget fallback and failures at
every optional port method. Reference behavior does not revalidate project/session
ownership on patch; the existing behavior is preserved and earns no stronger
cross-resource authorization claim.

The unauthenticated malformed-body test first failed: native parsing ran before
authentication, unlike the existing server's request guard. The native adapter now
requires authentication first. Evidence: reminders-http-expanded.log and
reminders-http-auth-precedence-fixed.log. Seven deliberate regressions fail their
intended assertions and are restored: list/export/patch ownership, engine-memory
filtering, target ownership, delete fallback and authentication precedence. See
reminder-http-mutations.json and reminders-http-restored-final.log under
`.jait/artifacts/gateway-rust/`. All workspace typechecks and artifact checks pass.

Limits: Linux valid typed optional-port replies and serial HTTP flows. Unexpected
DB failures use the existing native server's redacted error policy; arbitrary
Drizzle/SQLite error-message equivalence, concurrent cross-service snapshots,
resource/platform acceptance and production mount remain separate replacement
checks. Invalid optional memory-list replies fail explicitly. Global engine
memory, when supplied, retains the reference dependency's own scope policy; the
adapter does not widen that capability or infer ownership from a reminder ID.
Full frozen validation controls source-bound component credit.
