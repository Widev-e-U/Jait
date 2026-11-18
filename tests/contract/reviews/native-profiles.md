# Native assistant profiles

References: services/assistant-profiles.ts and routes/assistant-profiles.ts.
Native storage runs on the existing bounded SQLite worker; the API mounts explicitly
through Gateway::with_assistant_profiles. Production startup is unchanged.

The focused contracts compare the actual TypeScript service and real Fastify HTTP
responses with native SQLite and real Axum HTTP responses. Five scenarios cover
first/explicit defaults, nullable patches, string-array filtering, corrupted legacy
JSON and non-1 default flags, optional owner filters, foreign-owner get/update/delete,
latest-profile promotion, empty names, bearer/cookie auth, deleted users, cross-origin
cookie rejection, malformed JSON and prototype-pollution input rejection. IDs and
wall-clock timestamps alone are normalized in cross-process comparisons. List order
is preserved, including an explicit differing-timestamp promotion case.

SQLite triggers prove reference partial effects: clearing defaults is retained when
a subsequent insert or name update fails. We preserve this behavior rather than
introducing an unverified transaction change. Library create/update accept typed
JSON string/nullable/array fields; routes filter arbitrary input before storage.

Three surgical mutations (owner predicate, default clearing, nonempty skill filter)
fail the same existing assertions. Restored sources pass all nine target tests
(five domain tests plus four subprocess-boundary tests). Logs:
.jait/artifacts/gateway-rust/profiles-mutation-*.log and profiles-restored.log.

This establishes focused Linux parity, not provider execution or full application
readiness. SQLite exception text is normalized to a database-error category for
service failure comparisons; HTTP error envelopes retain exact comparisons.
