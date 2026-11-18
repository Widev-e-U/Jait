# Native System One service and decision tool

References: `packages/gateway/src/services/system-one.ts` and
`packages/gateway/src/tools/decision.ts`.
Native: `services/system_one.rs`, `tools/decision.rs`, `tools/decision-metadata.json`.
Target: `gateway_rust_system_one`; driver: `drivers/nativesystemone.ts`.

Twenty-one differential tests call the actual service/tool exports. They compare
returned JSON values, callback effects, request count/order, exact HTTP request
body strings, headers, endpoint paths and timeout options. JSON-valued numeric
leaves use the JavaScript Number domain; body strings and the tool's serialized
answer string remain byte-exact. The driver controls only fetch and clock, not
service validation, prompts, cache, ranking or tool logic.

Resolution covers generic/legacy field precedence, keyless configured endpoints,
ECMAScript trimming, decimal parseInt prefixes, timeout defaults/caps and disabled
configuration. Both TypeSafe and generic chat/completions requests are compared,
including model omission, data-only instructions, numeric property ordering,
opaque question/answer fields and existing legacy acceptance of string criteria
and numeric array answer IDs. Fractional score indices are intentionally accepted,
matching the source's range check rather than tightening its documented prompt.

Cache/backoff traces cover account/origin/model isolation, URL aliases as distinct
tenants, exact 30-second/15-second expiry boundaries, 128-entry insertion-order
eviction, refresh without recency promotion, and caller aborts without failure
cache poisoning. Missing/invalid answers, probabilities/confidence/choice/score
failures, HTTP/backend/JSON-response failures and generic payload variants are
compared. Size checks cover UTF-16 state/questions/alternatives and serialized
payload length. Completion transport errors are opaque messages; platform-specific
HTTP/JSON decoder error wording is not a portable wire guarantee. Typed HTTP
responses contain finite JSON and well-formed Unicode values; JS object identity,
getters, custom prototypes and externally mutating cached result objects are not
native ownership semantics.

Ranking compares first-48 shortlists, stable descending order, relevance filtering,
unranked tails, empty/disabled/single-candidate paths, UTF-16 query/description
slices including lone-surrogate boundaries, callback effects, describe exceptions,
and onScore/backend failures preserving the original candidate order. The source
input must already contain only authorized candidates; ranking grants no access.

The tool compares complete metadata, duplicate/blank ID rejection, all question
kinds, option-key coercion/duplicate replacement, exact answer JSON and generic
fallback behavior. Context API keys and cancellation are explicit caller inputs,
not model-supplied tool arguments. Share one SystemOne engine across the gateway
so cache/backoff lifetime matches the source module lifetime.

Ten native service regressions and two native tool regressions pass independently.
The concrete pooled HTTP client is also exercised through owned loopback servers:
POST/auth/body forwarding, no redirected connection, bounded response bytes and
credential-bearing URL rejection. Transport bounds are supplied by its caller.
Pending transport drop is verified for both caller cancellation and an actual
paused-clock deadline; no paid or external model request is made by these tests.
Production gateway/provider wiring remains unactivated.

A deterministic reproduction exposed a draft-native bug: total_cmp reordered
negative-zero versus positive-zero scores, while JavaScript treats them as ties.
The same differential assertion now passes with a finite partial comparison.
`system-one-zero-before.log` records expected [first,second] versus actual
[second,first]; the restored suite is green in `system-one-contract.log`.
This is a partial-native defect, not a production TypeScript regression.

Eight deliberate mutations are caught by both native and differential suites:
tenant-key omission, shortened cache expiry, shortened failure backoff, reversed
ranking, signed-zero ordering, integer-only score validation, skipped duplicate
question IDs, and first-option-wins replacement. Test assertions are unchanged;
production files are restored byte-for-byte. Evidence in
`.jait/artifacts/gateway-rust/`: `system-one-mutations-0-3.json`,
`system-one-mutations-3-6.json`, `system-one-mutations-6-8.json`, per-mutation logs,
`system-one-native.log`, `decision-native.log`, `system-one-contract.log`,
`system-one-clippy.log`, and `system-one-ts.log` (13 original reference tests).
The full source-bound gate remains authoritative for component credit.
