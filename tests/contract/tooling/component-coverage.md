# R00 component baseline

Run from any directory with Node 22.22.1 and Bun 1.3.10 dependencies installed:

```sh
node /path/to/jait/tests/contract/tooling/component-coverage-run.mjs
node /path/to/jait/tests/contract/tooling/component-coverage-gate.mjs check
node --test /path/to/jait/tests/contract/tooling/component-coverage-gate.test.mjs
```

The runner resolves the project from its own module URL. Locally in Jait's
memory-limited terminal, use the temporary scope used for this measurement:

```sh
systemd-run --user --scope --property=MemoryHigh=6G --property=MemoryMax=8G \
  timeout --signal=TERM --kill-after=10s 20m \
  node tests/contract/tooling/component-coverage-run.mjs
```

Every original `*.test.ts` under gateway/shared/api-client runs unchanged.
The separate config inherits the existing aliases, environment and timeouts,
uses two workers, and replaces only suite/coverage selection and reporters.
Istanbul 3.2.7 static AST instrumentation includes every source `.ts`, including untested sources and barrel files;
only test/spec files and declaration `.d.ts` files are excluded. The gate checks
an independent disk inventory. Type-only modules can have zero executable counts;
they remain in the gate inventory. Istanbul omits counter-free modules after remapping;
the gate independently transpiles and instruments an omitted module with Istanbul
and accepts zero counts only when all statement/function/branch maps are empty.
A missing executable source always fails. This measures TypeScript, not Rust implementation parity.

Reports and temporary directories are anchored at
`.jait/artifacts/rust-continuation/component-baseline/`. `measurement.json`
records exit status, versions, timestamps, dirty Git state, source/test SHA-256
hashes, and report digests. `tests.json` and `coverage/coverage-final.json` retain
detailed assertion and source evidence. Raw reports are local/CI artifacts;
the versioned `component-coverage-baseline.v2.json` stores portable source paths,
exact measured counts, individual skips, and measurement provenance.

The runner allowlists the environment instead of inheriting credentials, node
connections, shell startup files, proxies or provider CLI configuration. It
resets project-local HOME, HOME/.jait state, explicit database, XDG and TMP paths.
`__JAIT_CLI=1` uses the existing switch to prevent loading the repository `.env`.
Git prompts and non-file Git transports are disabled. Default providers use
inert endpoints; the OmniRoute default is retained because existing tests assert
its exact value. A Node TCP preload blocks non-loopback addresses and standard
live provider/gateway ports, including OmniRoute, while allowing ephemeral
loopback fixtures. Node subprocesses inherit that guard. This is not an OS
sandbox: explicit test overrides and non-Node subprocess transports are not
universally intercepted. Integration opt-in variables are intentionally not
inherited; skipped external integrations remain unresolved evidence gaps.

`check` rejects any lower branch, statement, function or line coverage ratio
per baseline source, per component and overall. It rejects removed/missing
baseline sources and missing current disk sources, including new untested files.
It compares integer counts as ratios without rounded percentage allowances.
Intentional source removal therefore requires explicit baseline policy review.
CI also compares the committed baseline against the PR base/push predecessor,
preventing an ordinary baseline edit from lowering the gate. CI runs comparison
even after test failure, uploads reports, and retains the original test exit as
a failed step; no expected-failure allowance or `continue-on-error` is used.

To explicitly record a reviewed new measurement:

```sh
node tests/contract/tooling/component-coverage-gate.mjs snapshot
```

Both snapshot and check verify successful tests, provider identity, report digests,
and source/test freshness. Failed runs remain artifacts and cannot establish a baseline. Never lower counts to hide failures or
coverage instability. The source/component comparison is intentionally strict;
platform-dependent or flaky coverage needs investigation, not threshold rounding.

## Istanbul baseline transition

The retained v1 baseline and V8 evidence are historical. Istanbul uses different
statement and branch maps, so its percentages cannot be compared with V8.
The v2 baseline records a new honest measurement; the CI baseline-protection
step compares v2 against v2 on future changes. Mixed providers are rejected.
The transition does not lower original assertions or introduce coverage tolerance.

See `.jait/artifacts/rust-continuation/component-baseline/report.md` for the
completed measurement commands, exact counts, repeat comparisons and limitations.
Earlier V8 results and investigation are preserved in `v8-tooling-report.md`.
