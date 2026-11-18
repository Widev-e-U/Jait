# Native local Docker resource inventory

Source: `packages/gateway/src/services/network-resources.ts`.
Implementation: `packages/gateway-rust/src/services/network_resources.rs`.

All source responsibilities are implemented: row validation and six-field metadata
projection; JavaScript object-key ordering and address deduplication; image repository
and sandbox classification; exact UTF-16 name/image slicing; local Docker endpoint
selection/guard and shell-free argv; bounded process execution; strict 64-hex listing
IDs versus 12–64-hex row IDs; 32-wide inspect batches and 512 cap; whole-poll failure
handling; success/failure TTL; single-flight polling and cancellation-safe collection.
The cached operation owns its lifetime independently of the first subscribing poll.
Docker access is metadata-only. Existing caller authorization remains required.

Evidence (2026-10-20), under
`.jait/artifacts/gateway-rust/parallel-20261020/network-resources/`:

- `node packages/gateway-rust/run.mjs test --lib services::network_resources`:
  26 native tests pass. Real owned executable peers cover stdout/argv, stderr/exit,
  missing executable, timeout and output overflow; remaining tests use typed peers.
- `node tests/contract/run.mjs test --test gateway_rust_network_resources --test gateway_rust_network_lifecycle`:
  nine component contract tests plus four shared subprocess checks and one dedicated
  lifecycle regression pass. Full metadata/wire, endpoint plan/probe/option traces,
  batches/cap, malformed rows, failure caching, exact expiry and coalescing compare
  against the actual TypeScript function bodies.
- Three restored mutations (TTL, batch size, UTF-16 ceiling) fail native and
  differential suites. `mutations.json` records their exits; restored suites pass.
- Strict all-target native Clippy passes. The full source-bound gate controls credit.

Fail-then-pass evidence: aborting the first native poll originally stranded pending
state and the next poll hit the regression's 100 ms timeout. The unchanged test now
completes with one shared collection and cached available result. Wire comparisons
also exposed inherited icon dictionary keys (`constructor`, `__proto__`, `toString`);
the native serializer now matches omitted/empty-object legacy fields as inert data.
Split-surrogate output is kept in Utf16Text and compared as exact JSON text, rather
than dropping code units or normalizing reference output.

Reference isolation: Bun's built-in-module mocking did not replace execFile reliably;
that early adapter queried the local Docker daemon. The corrected adapter reads the
fingerprinted reference file and asserts/replaces only its three dependency imports
with owned test peers. Its function bodies remain unchanged. Default-constructor
endpoint/argv/limits execute with those peers; orchestration tests use the reference's
public injected runner. No live daemon, credentials or network targets are needed by
the final suites. The driver fails before import if dependency spelling changes.

Typed/platform limits: Rust input strings contain scalar Unicode; slicing can create
lone UTF-16 units and serialization preserves those units. Object identity/prototype
mutation is not a native ownership claim, while observable prototype-key icon wire
shapes are explicitly covered. No live Docker-daemon version/schema test or Windows
host/npipe execution was performed. Windows behavior is a deterministic plan check;
Unix process fixtures use smaller test budgets while production limit values and
actual enforcement are separately asserted. Process-child cleanup follows execFile's
single-child boundary; no Windows descendant-tree claim is made. Cancellation of a
subscriber is covered; service/runtime shutdown remains the runtime adapter's owner.
Production network-page/tool wiring is separate migration work.
