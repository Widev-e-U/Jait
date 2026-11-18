# Native phone alarm tool adapter

Reference `packages/gateway/src/tools/mobile-tools.ts`; native public tool factory
metadata and execution adapter beside the TypeScript gateway. The execution port
is explicitly injected by the host; this component does not register devices,
claim FCM delivery, or bypass consent. The native draft previously existed but
was not in tools/mod.rs and referenced a nonexistent date parser, so it earned
no prior component credit.

The implementation uses the existing reviewed ECMAScript-compatible Date.parse
helper from subscription usage fetching, exposed within the crate. The clock is
injected. Authentication is checked before timestamp parsing or the push port;
invalid, past and equal-to-now timestamps return the original failure. Valid
scheduling trims ECMAScript whitespace on id/title/body, applies original
fallbacks, passes exact epoch milliseconds and user identity to the port, returns
normalized ISO time and count only for positive delivery, and propagates service
failures unchanged. Metadata is compared in every contract result to the real
factory export.

Contracts use the actual TypeScript factory with only the wall clock and push
service boundary injected; no live transport, tokens, or Android device is used.
They compare captured dispatch calls, complete results/errors, and full metadata.
Native device counts use nonnegative u32, matching the push-service count domain.
Direct calls with schema-invalid non-string at/options are outside the typed
adapter boundary; parameter validation belongs to the tool registry.

Evidence in `.jait/artifacts/gateway-rust/mobile-alarm/`:
- `contract-second.log` reproduces acceptance of an unpadded ISO T date where the
  real runtime rejects it. The shared parser now requires two-digit month/day
  fields when present for T/t forms, while retaining omitted components and
  lenient space-separated legacy dates. `contract-third.log` caught an
  overrestriction of omitted day/month fields before the final implementation.
- `contract-shared.log` and `contract-restored.log` pass the exact alarm
  reproduction and the existing subscription-usage contract suite. The latter
  also includes the validator contracts after final restoration.
- `clippy.log`: strict all-target Clippy passes.
- `mutations.json`: future-time equality, disabled trimming, and accepting empty
  authenticated user IDs each fail actual-source assertions and are restored.
 Full source-bound native validation controls component credit.
