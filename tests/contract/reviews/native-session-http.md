# Native session HTTP routes

Reference: `packages/gateway/src/routes/sessions.ts`. The opt-in Axum router
preserves create/list/get/patch/archive/delete/move/viewed/state/title endpoints
and agent helper endpoints. Storage uses the existing bounded SQLite worker;
chat activity, node ownership, WebSocket events, hooks and title generation are
explicit runtime ports. The standalone executable does not mount these routes.

Real HTTP comparisons run the actual TypeScript route registration, Fastify
server hooks, SQLite migrations and domain services. Only external chat activity,
node/event delivery and title network requests are fixtures. Responses, database
rows, audit records and event order are compared. UUIDv7 values are validated
before correlation aliases replace them; fixture time is fixed. Title requests
can mutate storage while awaiting the result to test rename and deletion races.

The focused target covers authentication (including deleted identities), origin
checks, ownership, missing records, project creation/reuse and optional services,
list pagination and JavaScript integer parsing, repeated query parameters,
node selection and busy/foreign/project restrictions, nullable metadata order,
move noops and project scope, viewed watermarks, state validation/null deletion,
generated-title normalization/fallback/races and partial SQLite failures.
The agent helpers retain their reference global authentication gate and existing
cross-session read behavior; they are not silently restricted to owner scope.

A new Date.parse differential battery reproduced rejection of valid reduced ISO,
legacy and rollover dates. Validation and the session storage watermark now reuse
the existing JavaScript-compatible parser rather than mixing RFC3339 validation
with SQLite date parsing. The battery covers reduced ISO, rollover days, 24:00,
zone offsets, fractional seconds, lowercase ISO, numeric/month-name/RFC legacy
forms, local datetimes and malformed dates. The existing session storage target
passes after that change; ISO output uses integer millisecond calendar formatting.

Caught and restored mutations remove the HTTP ownership filter, reorder stored
metadata keys and overwrite a user rename during title generation. Logs and
mutation results live in `.jait/artifacts/gateway-rust/session-http-*`.
The new timestamp case fails against the previous native implementation and
passes after the fix. The focused HTTP target has 19 behavioral cases and four
shared driver checks; the session storage target adds eight behavioral cases.

Boundaries: focused behavior coverage is not production activation or whole-app
readiness. Title transport, hooks and WebSocket implementations need their own
component evidence. JavaScript Date.parse outside the exercised host/format
battery and arbitrary non-scalar JavaScript strings remain compatibility limits.
The final source-bound gate determines credit; a focused pass alone does not.

HEAD and framework regression: HEAD on the list route previously selected the
create branch, returning 201 and mutating storage. HEAD now follows the read
path; complete database and event comparisons prove it has no write effects.
Optional state routes and unsupported methods retain authenticated JSON 404s;
unknown session subpaths and malformed/empty/poisoned JSON are checked too.
Unsupported content type errors now match the server's sanitized 415 message.
The additional framework test passes with and without the state service.
