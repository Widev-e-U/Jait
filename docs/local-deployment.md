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
```

Every deployment runs the production build, release/artifact guards, workspace
typechecking, the complete Vitest suite, workflow/deployment guard tests, lint,
real-browser tool tests, a combined Rust migration/contract gate, the standard
Chromium E2E suite and the separate UI fixture suite. The combined gate runs
formatting, Clippy, native library tests and the complete contract suite once;
that suite includes every migration contract target. There is no skip-checks or
changed-tests-only option. Existing explicitly disabled or
opt-in lab/hardware/browser matrices retain their repository configuration;
passing these gates is evidence for that configuration, not a guarantee that no
bug exists. A blocked toolchain, missing runtime or failed gate blocks deployment.

The speedup comes from removing public-release work and avoiding duplicate web
builds. Dependency/browser caches and the dedicated verification workspace's
Rust compilation caches survive between runs. Tests themselves run each time.
The first run may be slower because it provisions browser binaries and warms an
isolated Rust cache. Gates run with four Vitest workers, two Cargo workers and a temporary
6 GiB throttle / 8 GiB cap, rather than the terminal's normal 1.5/2 GiB limits.
Each gate has a 30-minute deadline; the complete preparation has a two-hour cap.
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
node tests/contract/run.mjs test --test local_deploy_pipeline --test local_deploy_host
```

Rust tests exercise the native implementation and compare its policy, hashes,
service quoting, and failure/rollback sequences with the JavaScript reference.
Host tests invoke the actual native executable with fake build engines/systemd,
real files and loopback health servers. They cover proof rejection, cancellation,
process failures, signal-resistant descendants, changed builds and backup/restore.
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
