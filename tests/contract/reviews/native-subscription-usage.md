# Native subscription usage fetchers

Reference: `packages/gateway/src/services/subscription-usage-fetchers.ts`.
Native: `packages/gateway-rust/src/services/subscription_usage_fetchers.rs`.
Contracts: `tests/contract/tests/gateway_rust_subscription_usage.rs` and the real-export
`tests/contract/drivers/nativesubscriptionusage.ts` bridge. Native HTTP is reqwest;
production startup remains unchanged and no provider credentials are read by tests.

## Implemented and exercised

- Cookie prefix/trim, UTF-16 ceiling and whitespace/control/separator rejection.
- OpenCode Go status errors, all required quota windows, finite nonnegative percentages,
  reset-date validation and returned body retention. JSON numbers use JavaScript's
  IEEE-754 rounding and serialization. JSON consumption does not call reader.cancel.
- Ollama header/redirect policy, status handling, optional body, byte-limited streaming,
  split/invalid UTF-8, BOM removal, finally cancellation and cancellation-error precedence.
- HTML track traversal, nearest ancestor meter and following element sibling, duplicate
  meters/attributes, parser implied closes, void elements, foreign self-closing tags,
  raw-text boundaries, comments, named and optional-semicolon numeric entities.
  The 2,231-entry standard-library WHATWG entity table was compared in full to the
  installed reference `entities.decodeHTMLAttribute`; every entry agreed.
- ISO and tested legacy/rollover dates, invalid days/offsets/leap seconds, TimeClip,
  US timezone abbreviations and two-digit years. Separate subprocesses compare UTC,
  America/New_York, Europe/Berlin and Pacific/Apia against real JavaScript Date.parse,
  including daylight-saving folds/gaps and Apia's skipped day. Native fold candidates
  are explicitly ordered by timestamp, rather than assuming chrono's result order.
- Owned loopback HTTP: credential/header mapping, manual/error redirects with and without
  Location, no follow-up connection, deadline, oversized body and successful bodies.
- Deep markup uses iterative traversal/drop and cached inherited foreign context.
  A 100,000-level document matches the reference and native parsing is bounded by a
  five-second assertion (observed whole focused test: 0.40 s on this host).

## Reproduction evidence

The host initially reported missing module registration, then a missing Debug bound,
then 17/19 passing tests. Two stale fixture assertions were corrected: legacy dates
must equal the reference (not assert the former gap), and a zero-high-water-mark JSON
stream distinguishes consumption from prefetch. No production TypeScript was modified.

New differential tests failed before the fixes and pass afterward:
- `&percnt;`: native MISSING_METERS versus valid reference session usage 0.1.
- `2026-01-32`: native February 1 versus reference null.
- ISO leap second: native next minute versus reference null.
- New York fold: native 06:30Z versus reference 05:30Z.
- OpenCode stream: native cancellation error versus successful reference JSON.
- JSON 25.0: native float representation versus reference canonical integer 25.

The initial deep-document suite took 168.09 s. Removing repeated full-ancestor scans
reduced the same focused test to 0.40 s; the time assertion retains that regression.
Before evidence: `.jait/artifacts/gateway-rust/subscription-host-debug.log` and
`subscription-boundaries-before.txt`; final focused logs and full source-bound gate
are authoritative for applied native credit.

## Boundaries and remaining readiness work

This is component implementation coverage, not production activation or a claim of all
JavaScript engine grammar/platform behavior. Tested JSON contains finite numeric tokens
and well-formed Unicode; Bun/serde JSON syntax-error wording is runtime-specific. Native
JSON response storage additionally has an 8 MiB ceiling. Arbitrary unpaired-surrogate
JSON, overflow numeric tokens, unusual legacy Date.parse spellings beyond the explicit
matrix, OS timezone-data differences, malformed HTML beyond the tested parser matrix,
TLS/HTTP2 interoperability, real account integration, and non-Linux platform validation
remain broader replacement-readiness coverage gaps. No assertion relies on full HTML5
foster parenting; the actual reference is htmlparser2's default parser, not a browser DOM.
No JavaScript runtime, worker or bridge is used by this native service.


## Extreme legacy year regression

The additional cases `Jan 5 9223372036854775807` and
`Jan 5 -9223372036854775808` reproduce a native arithmetic-overflow panic where
the reference returns null. Bounding the calendar year to the TimeClip range
before calendar arithmetic fixes both without weakening the assertion.
Evidence: `.jait/artifacts/gateway-rust/subscription-extreme-year-before.log` and
`subscription-extreme-year-after.log`. They remain in the differential matrix.


## Bun shared-parser loading compatibility — 2026-10-26

The TypeScript reference now obtains htmlparser2 through Node createRequire,
matching the synchronous boundary used by matrix-bot-sdk/sanitize-html. This
avoids Bun 1.4.0's mixed import/require loader race (oven-sh/bun#33180), observed
in both chat-flow startup and isolated evaluation startup during full deployment
verification. No parser, transport, response-bound, cleanup or date behavior changed.
The fixture-only preload was removed in favor of fixing the shared reference.

All 27 subscription differential/transport tests and 10 chat-flow tests pass.
The new startup contract loads the real usage-parser and Matrix SDK exports in
eight fresh, bounded Bun processes. The seven parser unit tests and isolated
evaluation-gateway test also pass. Logs: `.jait/artifacts/usage-import-contracts.log`
and `.jait/artifacts/usage-import-focused.log` in the browser-handoff delivery
checkout. The reference fingerprint was reviewed after these checks; native code,
frozen baselines and component credit remain unchanged. A full source-bound gate
is still required for deployment.
