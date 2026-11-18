# Calendar record contracts and public entry point

Sources: `services/calendar/types.ts` and `services/calendar/index.ts` under the
TypeScript gateway. These are respectively a type-only module and a public barrel;
they contain no independent calendar execution engine.

The native `services/calendar/types.rs` defines every declared record and provider
union, with matching camelCase wire names, optional fields, nullable account owner
and refresh token, and distinct absent/null/string account errors. JavaScript number
spelling is used for token expiry and optional list limits. Native calendar/mod.rs
re-exports those contracts and the same implemented CalendarService type from its
service module, matching the TypeScript entry point's class/type exports. Existing
calendar engine/service credit is not granted again by these two components.

`tests/contract/tests/gateway_rust_calendar_types.rs` passes three focused checks
plus four shared subprocess transport tests. Fixtures in nativecalendartypes.ts
are typechecked by the real TypeScript compiler against the original interfaces,
then returned by a Bun reference driver. Every native DTO deserializes and
serializes the same fixture. Both providers and account statuses, absent/null/error
text, null/empty/filled strings, all optional fields, nested and empty snapshots,
nonintegral/zero/negative/exponent list limits, all-day and timed events are covered.
The runtime barrel test checks the exact exported class identity in TypeScript and
the corresponding native TypeId alias. The type-only TS module exports no runtime
values. Two colocated native tests check three-state errors and enum rejection.

This is contract and entry-point coverage, not additional calendar runtime
behavior. Native types own their values and accept declared finite JSON records;
prototype/alias mutation and malformed JS input are outside the typed boundary.
The declaration-only source does not parse timestamps or impose provider API
validation, so neither does this native contract layer. Public service behavior
continues to be validated by its separately credited native service/HTTP tests.
No new dependency, environment variable or database migration is introduced.
Component credit requires the full source-bound gate, not these focused results
alone.
