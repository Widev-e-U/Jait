# Sandbox manager command/session slice (in progress)

No component credit. `security/sandbox-manager.ts` remains absent from the verified
ledger. The full241 checkpoint remains the last completed frozen-source gate;
this source addition requires new focused and frozen validation before credit.

`src/security/sandbox_manager.rs` implements command argv, detached command
sessions, exec/shell, stop, exact-idle inspection and orphan reclamation. Native
background commands reuse `sandbox_background_process::BackgroundProcess` and
its shared admission counter. There is no ambient runtime detection or process
spawn. An explicit host owns runtime selection, consent, path authorization,
filesystem/worktree operations, UID policy, identity, bounded process execution
and supervision. Canonical identity and worktree helpers must be used by the
future authorized host integration; the fixture host does not establish that
integration. Production remains TypeScript.

The command fixture compares actual native results and all argv/timeout calls
with the actual TS manager loaded with import-only mock host seams. Only generated
names are normalized. The corpus includes writable/read-only/unmounted projects,
literal command/environment arguments, session/thread/owner labels, worktree
mounts, timeout/error decisions, shell cwd defaults, stop failure/idempotence,
malformed discovery rows and live/busy-owner exclusions. Unicode cases distinguish
JavaScript whitespace from Rust's Unicode regex class and require ASCII PIDs.
Fixtures have no Docker, network, browser or VM effects.

Native tests additionally cancel a start waiter while process completion is held,
then release it and join the supervisor and cleanup tasks. A late-created named
container is removed exactly once. Returned sessions are owned leases: dropping a
lease schedules cleanup; explicit stop suppresses it after successful removal.
Timed-out or failed starts attempt named cleanup before reporting failure. The
supervisor contract requires shutdown to drain tasks and observe errors. These
mock process results establish orchestration policy, not real engine ownership.

## Compatibility decisions awaiting client integration evidence

- Generated argv/timeout and successful results preserve the command corpus.
- Container names reject empty/option-like/ambiguous names before process effects.
  The TS manager accepts broader strings. Authorized project roots reject `:` and
  control characters in volume syntax; no Windows host-volume parity is claimed.
- Detached starts require exit zero without timeout; TS checks exit zero only.
  Failure also schedules named cleanup. The native owned lease and cancellation
  handoff deliberately strengthen cleanup. Native callers must retain the lease
  in the session owner and stop it at shutdown; merely copying its name is invalid.
- The provider's shared startup and cleanup sequencing, live-view BrowserSandboxPort
  cancellation, tool caller consent, and periodic cleanup reporting need direct
  caller contracts before this component can be credited or integrated.

## Evidence and remaining work

Project-local evidence: `.jait/artifacts/gateway-rust/sandbox-manager-20261026/`.
`command-differential.ts` and native `sandbox_command_native_vectors` regenerate
`native-command-vectors.json` and `command-differential-results.json`. Native
mutation controls target writable UID mapping, live-owner inspection and late
startup cleanup; restored baselines must pass. A surviving live-owner mutation in
the initial run exposed missing assertions on inspection attempts; the native
fixture now checks exact call count and forbids inspecting the live owner.

Still required: browser/Linux/Windows lifecycle and discovery, image recipes and
explicit image-build authority, startup integration of admission, bind-conflict retries, loopback
readiness bounds and cancellation, storage containment/symlink policy, background
exec and injected-runner routing, canonical host identity/worktree integration,
real process/socket/engine evidence, native mutation controls for those paths,
all direct-caller compatibility checks and the full frozen-source gate. Do not
infer full manager parity, production readiness or platform coverage from this
slice or its fixture counts.

Admission policy now has separate uncredited evidence in
`tests/contract/reviews/native-sandbox-manager-admission.md`; command-slice counts
and source hashes above describe their historical checkpoint.
