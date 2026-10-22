# Native validation, identifiers and continuation helpers

References: scheduler/cron.ts, plugins/manifest.ts, lib/uuidv7.ts,
services/background-command-continuation.ts, services/intervention-run-resume.ts.

gateway_rust_helpers compares real TypeScript implementations with native code:
- five-field cron syntax, every field's endpoints, lists/ranges, reversed ranges,
  safe-integer steps, malformed numeric syntax, UTF-16 length and JS whitespace;
- exact minimal manifest validation order/messages and ASCII identifier grammar,
  including arrays, whitespace-only display names and deliberately non-semver
  version strings accepted by the reference;
- deterministic UUID timestamp/entropy bytes and newActionId equivalence, plus
  100 native random UUID version/variant/uniqueness and canonical-length checks.
  The native public helpers share the previously verified database generator;
- SQLite-backed continuation selection for external/Jait providers, trimmed
  session/model values, persisted metadata objects/JSON strings, explicit-null
  effort overriding defaults, invalid effort fallback, missing stores and failed
  database reads;
- separate chat/thread callback maps, stale release identity, repeated registration
  of the same callback, async callback errors, clear and missing handlers.
  A controlled deferred callback is replaced while awaiting: the old invocation
  finishes, later invocations use its replacement, and releasing the old callback
  does not remove the replacement. No registry mutex is held across await.

Native callback operational errors use Result<Value,String>; native panics are
outside that callback contract. JSON contracts use Unicode scalar strings.
Cron is only syntax validation here; scheduling/execution remains separate.

Five mutations (safe-step ceiling, ID validation, action identifier output,
explicit-null precedence and callback identity) produce assertion failures.
A harness compile failure in the first mutation attempt was rejected as evidence;
all logs were replaced after the baseline passed and the script required an
assertion panic, a failed test result and no compilation failure.
Restored sources pass all eleven tests (seven domain and four transport checks).
Logs: .jait/artifacts/gateway-rust/helpers-mutation-*.log and helpers-restored.log.

## Chat resume options source update — 2026-10-22

The live TypeScript reference added `ChatResumeOptions` and forwards its optional
`hidden` flag to chat callbacks. The first 189-component gate correctly rejected
the stale reference fingerprint. Native chat handlers now accept typed optional
options, while one-argument handlers and thread callbacks retain their existing
API. Callback identity is retained through an explicit enum rather than allocating
an identity-changing wrapper during registration.

The real-source driver now forwards and records options. An additional
comparison checks missing options, an empty object, hidden=false, hidden=true,
thread isolation, repeated same-handler registration and old-subscription cleanup.
The original replacement-during-await and error cases remain active. All twelve
helper checks pass after restoration. Lost-options and wrong-chat-identity
mutations both fail the new comparison and are restored; evidence is in
`.jait/artifacts/gateway-rust/resume-options-*.log` and
`resume-options-mutations.json`. Only after this review is the reference hash
refreshed. These options are typed known fields, not arbitrary JavaScript objects.
