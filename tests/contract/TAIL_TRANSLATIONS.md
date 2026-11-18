# Draft Rust translations — execution and review in progress

## Continuation execution and remaining gates

The 2026-10-17 continuation observed 3,034 translated-target passes, zero failures and 50 retained gates. Concurrent source changes invalidated that global evidence report; these numbers are not a fresh main-tree readiness verdict. Explicit source-bound Docker and Chromium profiles separately passed 9/9 and 33/33 with no skips. CLI start/update now preserve the original Node executable input. Comparator, serializer, helper-relation, gate and parser fixes and remaining semantic limits are recorded in `reviews/translated-semantics.md`.

Frozen-source validation and static coverage continuation threads stopped when their configured provider workspace exhausted credits. See `.jait/artifacts/rust-continuation/progress.md`; R00–R08 and strict parity remain open. The original authoring/execution history below remains historical evidence.

All **2,740 declarations in the saved gateway inventory** now have authored Rust
replacements: **3,054 native Rust test cases** in `tests/tail_static.rs` and **14
Rust-owned vector cases** in `vectors/tailhelpers.json`. The native cases also
include three current-source declarations absent from the older inventory.

**The first execution is complete.** All Rust targets compile. The original
3,054 translated cases produced 2,303 passes, 692 failures, and 59 ignored in
1,325 seconds. A separate notification test failed, making 693 total failures.
Internal contracts passed 309/309 and managed acceptance passed 93/93.
See `.jait/artifacts/rust-first-execution/summary.md` for the baseline and failures.

Execution fixes cover relocated dependency imports, module mocks, assertion
framing, collection identity, timer/module resets, lexical parameter tables and
HTTP injection lifecycle. Most peers use Bun test mode; DevTools socket scenarios
use Node with the installed ws package because Bun lacks a required event.
SQLite and filesystem fixtures now state their backend and isolation assumptions.
Sprint 2 requests authenticate a real owner. Chat memory context is inserted
before the latest user request, with regression checks outside the provider's
error-catching callback. Current-source regeneration can add cases absent from
the saved baseline; report new cases separately when comparing runs.

**Latest complete execution passes:** 3,012 translated-target tests, zero failures,
and 59 existing ignored cases in 357.67 seconds. Across all Cargo targets,
3,029 tests pass. Internal contracts pass 309/309 and managed acceptance 93/93.
See `.jait/artifacts/rust-first-execution/final-summary.md` for final evidence,
backend adaptations and source-test corrections; `final-tests.log` is the full run.

Execution does not establish assertion equivalence. No parity credit or change
to `coverage.json` is claimed. The original authoring counts below describe the
saved draft, before current-source regeneration.

## Execution model

- Rust owns comparison rules and expected literals. The source fixtures invoke
  the actual TypeScript gateway exports with the original setup, inputs, mock
  boundaries and teardown. No gateway algorithm is reimplemented in Rust tests.
- `drivers/tailstream.ts` sends each observation to the parent Rust process and
  waits for its verdict. This lets original polling/retry callbacks observe Rust
  assertion failures and retry; collecting observations only after polling would
  change those tests' behavior.
- The Rust support modules enforce bounded messages, subprocess deadlines,
  fixture isolation, observed assertion sites, and final comparison outcomes.
  Their comparison, regex and serialization semantics still need execution and
  equivalence review along with the translated cases.
- 59 cases retain an explicit Rust ignore annotation because the original source
  had an environment or skip gate (Chromium, scanner binaries, containers, etc.).
  Review the original gate before opting them in. Ignored cases have no parity
  credit.
- Fixtures and transport traces go under the repository's `.jait/artifacts/`.
  Screenshots use the original project-local fixture destinations. Each gateway
  subprocess gets a disposable state directory and home.
- The deleted Messenger regression source was recovered from the creating chat's
  persisted tool call, preserved under `tooling/sources/`, and translated without
  restoring a production test file. Its original two expectations are retained.

## Files and reproduction

`tests/tail_static.rs` contains the Rust tests; `tests/support/tail_*.rs` contains
Rust assertion/transport helpers. `drivers/tailstatic/` contains fixture glue.
`drivers/tailmock.ts` reuses already-installed spy and timer libraries plus Bun's
module mocks; it introduces no dependencies or gateway changes.

The complete authored mapping and static authoring audit are saved at:

- `.jait/artifacts/gateway-rust-readiness/parallel-flash/tailstatic/mapping-proposal.json`
- `.jait/artifacts/gateway-rust-readiness/parallel-flash/tailhelpers/mapping-proposal.json`
- `.jait/artifacts/gateway-rust-readiness/draft-translation-audit.json`

From the repository root, regenerate source without executing tests:

```sh
node tests/contract/tooling/translate-tail-tests.mjs
python3 tests/contract/tooling/author-tailhelpers.py
```

Run translated cases with four isolated peers by default (override with `--test-threads=1`):

```sh
node tests/contract/run.mjs translated
```

Run the vector lane through the existing internal contract runner separately.
Do not interpret a draft mapping, syntax check, or ignored case as passing parity.
