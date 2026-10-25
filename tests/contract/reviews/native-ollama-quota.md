# Native Ollama device authentication and provider quota readers

References: `services/ollama-device-auth.ts` and `services/provider-quota-fetchers.ts`.
Native services: `services/ollama_device_auth.rs` and `services/provider_quota_fetchers.rs`.

The authentication service parses the unencrypted OpenSSH Ed25519 format, checks
both check integers, key lengths, embedded public-key agreement and the public
key derived from the seed. PKCS8 conversion is replaced by native Ed25519 signing;
public-key wire blobs and signature bytes match Node crypto exactly. JavaScript
whitespace, UTF-16 input limits, permissive base64 padding and ignored trailing
OpenSSH fields retain the reference behavior. Keys redact Debug output. The
system reader bounds reads; all accepted key text fits inside that bound.

Only an actual usage HTTP error with status 404 from a credential-free local
root Ollama URL can trigger key access. A user-provided error name/status cannot
forge that error identity. Operator-selected key paths preserve their precedence:
read failures fall through, but the first readable invalid key stops. Device
requests use the fixed Ollama origin, refuse redirects, retain signed method/path/
seconds, and require the daemon account email (or name when email is absent) to
match before requesting usage. Quota validation is the real native quota module;
it is not a fixture-only predicate. No HTTP/tool input can select a key path.

Quota readers retain quota/activity distinctions, independent bucket validation,
safe nonnegative activity counts, ordered valid dates, optional/nullable fields,
reset-credit and per-limit validation. Codex normalization retains response
identity when unchanged, prioritizes the `codex` snapshot, follows JavaScript
numeric-key ordering and preserves authoritative root account flags. Date parsing
reuses the existing subscription parser, including its documented JSC and local
zone behavior; the additional activity battery includes legacy and rollover dates.

The Codex subprocess gets literal `app-server --stdio` argv, the selected account
home for HOME/CODEX_HOME, and an explicitly empty API key. Tests use a disposable
executable with spaces and shell metacharacters; no real account or Codex CLI is
opened. Initialization and the rate-limit request remain distinct. Malformed
JSON/notifications are ignored; error replies, invalid schemas, stderr/exit and
request deadlines settle once. Native cleanup sends SIGTERM on Unix and reaps the
child, escalating after 250 ms. Cancellation drops and reaps the owned child and
aborts the stderr reader. Windows process behavior still requires execution there.

Seven device-auth differential groups, one system-reader check, six quota
comparison groups, real owned-loopback HTTP, and native resource/cancellation
checks execute real code. Each target also runs four common reference-transport
checks. HTTP tests exercise ordinary redirects, signed redirect refusal without
visiting the destination, deadlines both before headers and during body reads,
account casing, URL userinfo and response limits. They reproduced incorrect
native timeout/redirect diagnostics and Reqwest's implicit Basic authorization;
those regressions failed before correction and pass afterward. Debug output omits
URLs and authorization values. All credentials, keys and accounts are synthetic.

Three auth mutations alter signature timestamps, account matching and remote
fallback. Five quota mutations alter safe counts, root account flags, CLI key
isolation, activity ordering and signed redirects. Every control must fail on a
behavioral assertion and its restored test must pass. Reports and source hashes
are under `.jait/artifacts/source-review-authoring/`; current native credit still
requires the complete unchanged-source native gate.

Limits remain explicit. Focused component evidence is not standalone gateway
composition, native production activation, supported-platform evidence or complete
replacement readiness. Native HTTP bodies have a 2 MiB ceiling and Codex protocol
lines have a 256 KiB ceiling; the reference has no corresponding explicit caps.
Those operational differences need replacement-policy acceptance. Arbitrary
invalid JSON error text, nonfinite/out-of-range JSON numbers, lone UTF-16 surrogate
payloads, every legacy date form/timezone, environment/proxy/TLS errors and every
CLI shutdown/descendant race are not certified by these fixtures. No live provider
or account was contacted, and no production gateway configuration changed.

Signed-redirect error compatibility: the installed Bun reference reports
`TypeError` for `redirect: "error"`. The native transport preserves that error
name and message while refusing the redirect. The owned-loopback differential
fixture also asserts that the destination receives no signed request.
