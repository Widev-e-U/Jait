# Native provider authentication

Reference: packages/gateway/src/providers/provider-auth.ts, including its shared device-auth parser.
Native: providers/provider_auth.rs. Target: gateway_rust_provider_auth.
The reference driver imports real functions and starts only local fixture Node processes.

Six focused tests plus four bounded-driver checks pass. Exact comparisons cover command
quoting and escapes, Windows path text parsing on Linux, ECMAScript whitespace, ANSI and
OSC stripping, device URLs, blocked placeholder labels, next-line codes, browser code input
prompts, environment deletion before overrides, PATH key spelling/order and nullish npm
prefix semantics, unsupported results, stdout/stderr, successful/nonzero/signalled logout,
8000-unit output tails including a lone surrogate boundary, spawn failure, timeout, complete
and partial login details, early process exit, and absent-command results.
Bun caches os.homedir(); the adapter records that OS dependency and supplies it as the
native environment builder's home input. The environment results themselves compare exactly.
Only OS-specific spawn-error message text is replaced by a common diagnostic marker.

Native-only ownership checks exercise login input, a 64 KiB input ceiling, overload rejection,
permit release after exit and final-owner drop, forced cleanup of an ignored-SIGTERM child,
and closed-pool rejection. Authentication result output preserves UTF-16 units.
The process task owns/reaps each child; stdin has bounded queued writes and per-write waits,
and post-exit pipe draining has a two-second ceiling. Kill delivery uses an independent
signal so queued input cannot discard a kill request. A started login transfers ownership
to its returned handle; dropping the handle kills and reaps the direct child.

Evidence in .jait/artifacts/gateway-rust:
- provider-auth-final.log: 10 passed.
- provider-auth-reference.log: 37 TypeScript helper/parser tests passed.
- provider-auth-clippy-final.log: strict Clippy passed.
- provider-auth-mutations.json: environment deletion, 7999-unit tail, and missing
  reverse-code input completion each fail unchanged assertions; source restored.
No production reference defect is claimed; early failures were fixture home-directory
dependency mismatches. Final suites passed after the ownership/input bounds were added.

Commands:
  ~/.cargo/bin/cargo test --manifest-path tests/contract/Cargo.toml --test gateway_rust_provider_auth
  node node_modules/vitest/vitest.mjs run packages/gateway/src/providers/provider-auth.test.ts packages/shared/src/provider-auth.test.ts

Linux process lifecycle is established. Windows command parsing as text is compared, but
Windows shell-backed execution is explicitly unsupported pending its launcher integration.
Actual provider login, browser launch, credential persistence, provider dispatch, descendant
tree ownership on Unix, arbitrary pipe chunk/interleaving, invalid OS argument diagnostics,
nonfinite timer values, and every UTF-16 device-prompt boundary are outside this focused
evidence. No live provider service, credentials, gateway startup or production configuration
was used or changed.

Validation metadata handling: two full monitor gates passed against stable frozen sources
while live coverage.json reference-review annotations changed. The validator now separates
only status/gap/parity_review/rust_cases row annotations, recording exact frozen/live hashes.
Inventory paths, source fingerprints, all other row fields and all top-level inputs must
remain identical; policy, limits, added/removed sources and malformed inputs fail closed.
The native credit ledger remains independently fingerprinted. Python classifier checks
run from the frozen copy before the full native gate.
