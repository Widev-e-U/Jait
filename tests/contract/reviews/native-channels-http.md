# Native channel HTTP review

Scope: `packages/gateway/src/routes/channels.ts` maps to the opt-in native
`routes/channels.rs`, reusing native channel status and transient pairing types.
No channel-manager/connector component is credited here. The host trait explicitly
owns list/config storage, shared managed records, setup guides, connector QR and
start/stop/pair effects. Mounting performs no effects. Sync host methods must be
nonblocking; slow persistence belongs in the existing execution/storage lanes.

Authentication precedes every host access. Requests preserve missing-channel
404s, setup 404 versus start/stop/pair 400s, and uncaught host failures as 500s.
In particular, pair's initial get is outside the TypeScript catch. Credentials
are write-only in list, status and config responses: tokenSet uses ECMAScript
trimming; absent/blank/non-string patches retain the token; null clears; pasted
BotFather replies use ASCII token boundaries. Unknown config keys are preserved.
Only a string returnUrl reaches start/pair. QR nullish fallback stays lazy; empty
QR/link/error fields remain distinct from missing fields. Pair retains shared
managed-record identity across await and reads its updated state without holding
any lock during the host effect. No automatic retries or ambient effect authority.

Seven actual TypeScript comparison groups exercise real loopback HTTP with scripted
inert host ports, preserving response objects, effect order/arguments and final
config. These include all seven routes, bearer/cookie/invalid/missing auth,
missing managed records, foreign-looking and encoded ids, malformed JSON/media
and URL components, config spread/credential transitions, astral-string patches with both UTF-16 units retained in raw config JSON, lazy QR failures,
transient-option filtering, setup and post-pair updates, thrown values and host
failures at every route seam. Four bounded subprocess transport checks are also
included. Only lone UTF-16 surrogate comparison strings receive code-unit markers (the native raw code-unit serialization is also asserted); other response fields are compared directly. Fastify options match createServer;
the route fixture deliberately avoids importing the full server's unrelated
connectors (the installed Matrix HTML parser import can race in Bun). The shared test bridge settles that real ESM parser before adapter imports to prevent CJS/ESM loader races; it neither replaces modules nor starts connectors.

The parser comparison exposed the installed Fastify 5.12.5 media-error message;
the shared native parser now returns its generic message. No TypeScript production
source was changed by this port. The user-question source drift is reconciled by
native per-wait timeout options and explicit actual-TypeScript comparisons of
measured custom deadlines, indefinite waits beyond the default deadline, indefinite attached waits, ownership and detached notifications.
This refresh earns no additional component credit.

Validation and deliberate mutation evidence are recorded under
`.jait/artifacts/gateway-rust/channels-http/`. Full source-bound evidence is the
234-component checkpoint when that gate and restored controls pass. Component
parity does not compose connector transports, persistence, outbound policy,
production ownership/audit or supported-platform behavior. Production remains
TypeScript; replacement, load, recovery/rollback and activation gates remain open.

The full gate also exposed an assessment-history error-envelope regression:
SQLite's original code was erased by a String-only storage port. A typed detailed
history result now retains SQLite error provenance to the HTTP adapter while the
existing String-returning service API remains compatible. Missing-table failures
match the actual TypeScript SQLITE_ERROR field. JSON/worker failures never acquire
an invented SQLite code. Assessment scope, auth, engines and execution authority
are unchanged. This existing-component repair receives no coverage increment.
