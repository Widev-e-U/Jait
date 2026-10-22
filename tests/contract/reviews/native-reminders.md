# Native durable reminders

Reference: `packages/gateway/src/services/reminders.ts`. The native service in
`services/reminders.rs` implements create/get/list/listByIds/update/delete,
retrieval usage, Markdown export, hygiene, old-chat scan and project counts on the
existing migrated SQLite schema. It accepts an explicit connection; async callers
must invoke it on the bounded database worker. Omitted/empty owner filters retain
the source's trusted internal API, so HTTP/tool adapters must supply verified
ownership. No live data, scan, export or deployment is performed by these tests.

`nativereminders.ts` imports the real service and migrated in-memory database;
Rust runs the native service against an independently migrated database. Every
operation result and complete stored row state is compared after each step.
UUID entropy/clock injection keeps unordered SQL lookup fixtures deterministic;
identifiers are validated as v7 and normalized. Directory/SQL result sorting is
not introduced. The 503-row ceiling fixture compares canonical SHA-256 of every
row and full list result, retaining the existing 64 KiB input/256 KiB output
transport bounds. Smaller lifecycle/hygiene/scan fixtures compare full values.

Coverage includes owner isolation and trusted unscoped calls, null/omitted patch
fields, normalization/deduplication/20-tag limit, Unicode casing and ECMAScript
whitespace, invalid empty content, retrieval uniqueness/counts, no-result cases,
status/project/session queries, default/floor/500-row limits, malformed stored tag
JSON, Markdown metadata, active per-project counts, exact 180-day aging, invalid
dates, user/used-entry retention, conflicts in the original active snapshot,
scanning owner/role/join/order, repeated scans and UTF-16 clipping.

The Unicode boundary test exposed a reference bug: slicing at 279 units could
leave a high surrogate. SQLite adapters then replaced or corrupted it, and later
scans could recreate the same memory. A colocated reference regression fails
before the fix and all six reference tests pass afterward. Both implementations
now back off one unit when the clipped prefix ends on a high surrogate, keeping
the candidate valid and repeat scans stable. Source/native fail/pass evidence is
in reminders-unicode-reference-{before,after}.log,
reminders-surrogate-boundary.log and reminders-unicode-native-after.log under
`.jait/artifacts/gateway-rust/`. Existing stored rows are not rewritten.

Eight deliberate regressions are caught and restored: owner bypass, tag/row
ceilings, usage increment, exact age cutoff, conflict detection, scan dedup and
surrogate clipping. See reminders-mutations.json and restored logs. The full
frozen gate controls native credit. Source-test reconstruction freshness remains
a separate audit; the added reference regression does not grant translated-test
credit by changing an inventory fingerprint.

Limits: typed JSON/string inputs, serial service calls, ordinary integer usage
counters and the reviewed native JSC date-parser domain on Linux. Non-JSON values,
malformed SQL columns, arbitrary trigger/driver error envelopes, concurrent
writers, resource acceptance and supported-platform replacement require separate
checks. Extreme native counter overflow produces an explicit error. Reminder HTTP
integration and model-memory consent/registry activation are separate components.
