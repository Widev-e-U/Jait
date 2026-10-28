# SandboxManager browser startup (partial, uncredited)

Canonical module: `packages/gateway-rust/src/security/sandbox_manager.rs`.
Reference: `packages/gateway/src/security/sandbox-manager.ts`,
`startBrowserSandbox`, `cleanupConflictingBrowserSandboxes`, readiness helpers
and `stopContainer`. Focused native tests live in
`packages/gateway-rust/src/security/sandbox_manager_browser_tests.rs`.

## Reviewed behavior

The canonical manager composes admission and image preparation before capturing
host inputs, authorizing/mounting the project and authorizing the specific launch
name. A supervised task retains late process replies. The container lease exists
before engine submission and transfers to the session owner only after readiness.
Failed launch, timeout, readiness error, failed ownership transfer or lease drop
schedules removal under the host supervisor. Explicit stop uses the existing
OwnedSession path. Cleanup failures are supervised errors; no success/fixed claim
is inferred from scheduling a removal.

Browser startup preserves one bind-conflict retry with identical launch argv and
a 30-second command deadline. Discovery examines published host ports and the
browser name prefix, validates candidate name syntax and requires explicit
per-candidate removal authority. It never treats a prefix, port match, private
address or reachability as authorization. Malformed, unrelated and unauthorized
candidates have no removal effect. Listing/removal deadlines are 15 seconds.
Removal errors do not suppress the one retry. Observer cancellation after a
discovery response prevents new conflict removals/retries; current admitted
processes remain awaited and owned. Cancellation during image inspection prevents
a subsequent build. Cancellation before the supervisor starts performs no
admission or image effects.

Readiness uses the authorized host-side published IP, then noVNC HTTP, optional
CDP TCP and CDP HTTP in order. Each phase has its own absolute 15-second deadline,
attempts use at most 5 seconds of the remaining budget and failed attempts wait
200ms within that budget. A cancelled readiness future drops its probe resources
and lease. IPv6 URLs use brackets. Disabling CDP waiting preserves its returned
URL. A successful start is represented by OwnedBrowser, not a detached result
that could outlive its session owner's cleanup path.

## Explicit host boundaries

BrowserStartupAuthority extends the separately supplied image-build authority.
Its capture port binds host/node/engine, requested ports, gateway and clock
samples; published-host resolution and probes are also explicit ports.
authorize_launch must prove the timestamp name is available and owned by this
attempt. Capture is not a capacity reservation. Every adapter must enforce its
own scope, consent, resource/deadline and shutdown contracts.

There is no concrete engine, port allocation, clock, WSL resolver or network probe
adapter in this slice. HTTP implementations must disable redirects, bound
responses, accept only successful status codes and cancel/reap on drop. Host::run
must bound output, honor command deadlines and retain/reap admitted work through
shutdown. Dynamic names, output, ports and URLs remain untrusted. This is not
production integration or proof of real Docker/Podman/Chromium behavior.

Writable browser startup is deliberately rejected before admission or mkdir
until reviewed host UID/GID and writable HOME integration is present. The older
command-construction API still describes the reference command for all mount
modes; constructing a command grants no execution authority.

## Compatibility decisions and evidence limits

Valid read-only/no-mount startup preserves the reference command/result,
single retry and readiness phase/error contract in actual-TypeScript comparisons.
The native API introduces a retained lease and supervised cleanup even after
launch failure or caller cancellation. TypeScript only cleans up in its
readiness catch. A timed-out run cannot count as native startup success even if
a broken adapter reports exit code zero. Native conflict cleanup requires
explicit candidate authority; the reference's name/port match alone is broader.

TCP attempts are deadline-bounded in native code; the reference socket has no
per-attempt timeout. The TCP failure oracle uses immediately failed reference
connections, so native/reference attempt counts intentionally differ. Comparison
asserts phase ordering and final errors rather than falsely claiming equivalence
for stalled sockets. HTTP and TCP probe transport correctness still require
concrete adapter/client/platform evidence. Typed IPs, bounded name syntax and
IPv6 URL encoding also need direct-consumer/platform review before replacement.

Artifacts are under
`.jait/artifacts/gateway-rust/sandbox-manager-20261026/`.
The startup differential runs the unchanged actual TypeScript method and its
admission/image/cleanup/readiness helpers with inert import-only process/fs/net
ports and a virtual clock. Explicit ports avoid real allocation. Eight scenarios
cover success, disabled/absent CDP, successful/list-failed conflict retry and
timeouts in each readiness phase. No scanner, network connection, image build or
container startup occurs.

Native checks separately cover scoped malformed/unauthorized candidates,
nonconflict/second-failure/throw/timed-out run cleanup, bounded pending probes,
launch denial, writable-mode rejection, late-run/probe/inspection/discovery/early
cancellation, original lookup error propagation and IPv6 endpoints. Mutation
controls and restored source-bound check results are recorded in
`browser-start-slice-review.json`; this prose is not test output.

SandboxManager remains uncredited until Linux/Windows lifecycle, existing
container/background routing, storage containment, identity/worktree/direct
callers, concrete host adapters, real engine/platform and cancellation coverage
are complete. The historical full241 frozen gate is not refreshed by partial
startup checks. Original-370, replacement and activation gates remain open.
Production remains TypeScript.
