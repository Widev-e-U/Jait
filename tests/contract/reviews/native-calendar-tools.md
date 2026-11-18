# Native calendar tools

Reference: `packages/gateway/src/tools/calendar-tools.ts`. Native adapter: `src/tools/calendar.rs`, immutable definitions in `calendar-metadata.json`. Contract target: `gateway_rust_calendar_tools`.

Metadata is extracted from the existing factory, reviewed as immutable text and compared exactly with the real TypeScript factory. Both native tools bind authenticated user identity from execution context, forward only the documented query fields, and project account identity while preserving full calendars/events. CalendarTools::new connects directly to the native CalendarService; injected service boundaries exist for isolated presentation comparisons, not as a production TypeScript bridge.

Five focused tests plus four shared driver tests pass. Differential cases cover both tools, empty/null input, absent and explicit-null options, empty and foreign context IDs, account projection, empty lists, primary/selection flags, 20-item previews, omitted items, timed/all-day events, optional locations, Unicode, and Error versus non-Error rejections. The additional native integration invokes the actual service on migrated SQLite, proves device calendars do not request a remote provider, and rejects an account ID belonging to another user even if input claims the owner.

The initial implementation printed a literal backslash-n before previews; the unchanged comparisons failed before correction and pass with a real newline. Connecting the tool to the service also reproduced a compile-time integration failure: url::form_urlencoded::Serializer remained in OAuth futures across an await, making them non-Send. Calendar and email now complete encoding in a lexical block before awaiting transport. The tool's Send backend future enforces that regression at compile time; calendar and email OAuth request/response comparisons still pass.

Two mutations reduce preview length to 19 and replace execution-context identity with input identity. Both fail the differential assertions. Restored sources pass. Evidence: `.jait/artifacts/gateway-rust/calendar-service/tools-*`.

Boundary: typed CalendarService records and well-formed Unicode strings. Malformed service records and unpaired UTF-16 surrogate values are not established by this contract. Startup/dispatcher registration and authenticated calendar HTTP remain separate implementation work. No production tool dispatch, credentials or external account is activated.
