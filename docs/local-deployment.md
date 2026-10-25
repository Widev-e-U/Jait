# Verified local deployment

Use `bun run deploy:local` to deploy the checkout to the local Linux systemd
gateway. Public releases continue to use `node scripts/release.mjs --bump patch`.
Local deployment does not bump package versions, write a changelog, commit the
checkout, push, publish npm packages, or wait for Windows/Android release builds.
It records a local build ID, original commit and source fingerprint instead.

```bash
bun run deploy:local --plan     # show the mandatory stages; no install or restart
bun run deploy:local --prepare  # build, verify and stage; leave the service running
bun run deploy:local            # verify, stage and activate locally
bun run deploy:local --e2e     # explicitly include Chromium E2E and UI fixture suites
bun run deploy:local --skip-e2e # compatibility flag; same as the default
```

By default, every deployment runs the production build, release/artifact guards, workspace
typechecking, the complete Vitest suite, workflow/deployment guard tests, lint,
real-browser tool tests, and a combined Rust migration/contract gate. The standard
Chromium E2E suite and the separate UI fixture suite run only with `--e2e`. The combined gate runs
formatting, Clippy, native library tests and the complete contract suite once;
that suite includes every migration contract target. By default, only the Chromium E2E and UI fixture suites and their runtime preparation are skipped. Use `--e2e` when those suites are requested. `--skip-e2e` remains a compatibility flag; combining it with `--e2e` is rejected. The plan records `skipE2e: true` and proof lists only checks actually run. Activation validates the selected policy; all other gates, source/build binding, canary, health checks and rollback remain required. There is no general skip-checks or changed-tests-only option. Existing explicitly disabled or
opt-in lab/hardware/browser matrices retain their repository configuration;
passing these gates is evidence for that configuration, not a guarantee that no
bug exists. A blocked toolchain, missing runtime or failed gate blocks deployment.

The speedup comes from removing public-release work, avoiding duplicate web
builds, and overlapping independent verification work. The release/artifact preflight
guards finish first, then Rust starts alongside typechecking. Once the ordinary
checks and browser-tool checks finish, the Chromium E2E and UI fixture gates run
in one ordered browser lane while Rust finishes in the other. Browser gates stay
serialized to bound memory use. The E2E gate runs two Playwright shards concurrently,
each with one worker, its own gateway, fresh database/state, frontend, ports and
Vite dependency cache.
The UI fixture gate explicitly uses two workers and only a frontend. Per-invocation
reports and traces are isolated under `.jait/artifacts/playwright-shards/run-*/shard-*/`;
`summary.json` records every shard result and elapsed time. A failing shard cancels
and drains its sibling; all shards must pass. No tests or retries are removed.
For a manual comparison, run `node tests/e2e/scripts/run-isolated.mjs --shards=2 bun run test:e2e`
and compare with `--shards=1` under the same bounded 6/8 GiB memory budget. An already
completed Rust failure prevents browser work from starting. Proof entries and
the reported failure follow the mandatory gate order even if work finishes early.

The complete Rust contract gate compiles every target once, then runs the Cargo
test executables with three suite workers. Ordinary suites use four test threads;
the translated suite uses eight, and source review uses four isolated review workers
behind a single test-harness thread. This bounds those execution slots to sixteen.
The long translated/source-review suites start first, leaving a slot for shorter suites. All discovered test targets
remain mandatory; ignored tests keep their existing configuration, and library
documentation tests run after successful executable tests. A failed suite or
cancellation drains active process groups and prevents queued suites from starting.
Build and per-suite logs, timing and completion counts are saved under
`.jait/artifacts/contract-parallel/run-*/` inside the verification workspace.
Progress streams into the deployment's Rust log while checks run. Source-review
cases and independent copied-source mutation checks also run concurrently, retain
canonical report order and still require baseline pass, mutation failure and restored
pass for every reviewed source. Local browser verification stops after the first
exhausted-retry failure; a passing run still executes every configured browser test.
A failed foreground gate cancels and drains prefetched process groups before
the controller exits; failed runs cannot issue passing proof. Dependency/browser caches and the dedicated verification workspace's
Rust compilation caches survive between runs. Snapshot timestamps are retained
only when file bytes and permissions match the previous snapshot; changed bytes
receive fresh timestamps even if the checkout's timestamp was backdated. Redirected
symlinks invalidate those timestamps. This avoids relinking every Rust test after
copying an unchanged tree while retaining the full source/build hash checks.
Tests themselves run each time.
The first run may be slower because it provisions browser binaries and warms an
isolated Rust cache. Gates run with four Vitest workers, two Cargo workers and a temporary
6 GiB throttle / 8 GiB cap, rather than the terminal's normal 1.5/2 GiB limits.
Non-browser gates have a 30-minute deadline. Browser gates have a one-hour deadline
because the complete E2E suite has measured above 30 minutes before sharding; every
configured test remains mandatory. The complete preparation has a two-hour cap.
Progress names and log paths remain visible while commands run.

The pipeline freezes tracked and non-ignored files, including uncommitted edits
and deletions, while respecting nested ignore files. A separate synthetic git
repository shadows the parent checkout so test git operations cannot reach its
history. It checks for edits during capture and for source/build drift during
verification. It never builds the moving checkout directly. Test state and all
reports are project-local. The exact tested workspace and dependencies become
an immutable runtime directory; there is no second dependency resolution or
rebuild after tests pass. Compiler/test caches stay outside that runtime.

The staged package must pass module loading and an isolated-state canary health
check before activation. The `jait-gateway.service` must already be running;
its executable, port and CLI arguments are captured and preserved. A dedicated
systemd controller survives the restart and changes only
`~/.config/systemd/user/jait-gateway.service.d/90-jait-local.conf`. The npm
installation and other service overrides remain available. Failed restart/health
checks restore the previous local override (or remove the newly created one),
then restart and health-check the previous installation. This rollback restores
the launch configuration; it does not reverse application database migrations.

Logs and source/build proof are under
`.jait/artifacts/local-deploy/runs/<run>/`. `plan.json` records the build ID,
source provenance and every passing gate. `activation.json` is the final result;
starting a controller is not itself a successful deployment. Failed validation
writes `failure.json`. Runtime trees stay under
`.jait/artifacts/local-deploy/releases/<build-id>/`; do not delete a tree while a
service or rollback plan still references it.

To restore the installation preceding a completed local deployment:

```bash
bun run deploy:local --rollback /absolute/project/.jait/artifacts/local-deploy/runs/<run>/plan.json
```

Rollback uses a separate controller and writes `rollback-result.json`. It refuses
a stale plan when a newer override is active. Public version numbers remain the
release version; use the local build ID and source hash in `plan.json` to identify
unpublished code. A later public release is still a separate, explicit action.

Concurrent deployments are rejected by `.jait/artifacts/local-deploy/lock/`.
`owner.json` records the initiating PID/time. If a machine crash leaves a stale
lock, inspect that PID and the run's result before removing the lock. Failure
never creates a reusable passing certificate.

The launcher uses `packages/gateway-rust/src/bin/jait-local-deploy.rs` for
verification and activation. Native logic in `execution/local_deploy.rs` owns
the ordered gate list, subprocess deadlines/cancellation, source/build fingerprint,
exact verification proof, service argument quoting, service identity recheck,
restart, loopback health checks, and rollback. Preparation still uses JavaScript
for source snapshotting, dependency installation, package validation, the isolated
canary, and the systemd handoff. The native executable is built before testing
and moves into the staged runtime with the tested source. Activation invokes that
executable directly, so a gateway restart cannot terminate its controller.

Regression checks:

```bash
bun run test:local-deploy
node --test packages/gateway-rust/tooling/parallel-contracts.test.mjs
node tests/contract/run.mjs test --test local_deploy_pipeline --test local_deploy_host
```

Rust tests exercise the native implementation and compare its policy, hashes,
service quoting, and failure/rollback sequences with the JavaScript reference.
Host tests invoke the actual native executable with fake build engines/systemd,
real files and loopback health servers. They cover proof rejection, cancellation,
process failures, signal-resistant descendants, changed builds and backup/restore.
They also verify real gate overlap after preflight, canonical failure/proof order,
and prefetched descendant cleanup before controller exit. Native scheduler tests
also require real Rust/browser overlap and ordered browsers; contract-runner tests
exercise the three-worker bound, complete discovery, failure, cancellation and
signal-resistant descendant cleanup without invoking deployment.
Node tests retain snapshot and launcher coverage. These checks do not restart a
real service. Both Rust targets are mandatory supplementary checks in the full
migration gate; they add no component credit to the migration inventory.

To return to the normally installed public package after using local builds,
remove only this pipeline's override and reload/restart the service:

```bash
rm ~/.config/systemd/user/jait-gateway.service.d/90-jait-local.conf
systemctl --user daemon-reload
systemctl --user restart jait-gateway.service
```

An npm install alone does not change an active local override. Keep public
publishing and local activation as explicit separate actions.
