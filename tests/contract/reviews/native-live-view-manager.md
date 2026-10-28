# Native live-view lifecycle review

Reference: `packages/gateway/src/services/live-view-manager.ts` and its two
original unit assertions (queued second start; Docker failure without fallback).
Canonical implementation: `services/live_view_manager.rs`. This is an opt-in
native library service; it is not composed into the production gateway.

## Reviewed behavior

`start` defaults to containers and acquires one shared manager's FIFO start lease.
The environment limit uses JS decimal-prefix parsing, sign, finite/positive
fallback and ECMAScript whitespace (U+0085 is not JS whitespace). Waiting work
never bypasses earlier callers, including when the limit increases. Releasing a
lease transfers the existing active slot; errors release it as well. No active
slot mutex spans host I/O. Construct one manager per execution runtime, matching
one TS module instance; constructing multiple managers does not imply global
coordination across runtimes or nodes.

The container path reserves three independent ports, passes `mountMode: none`,
network and host-gateway options unchanged and uses the actual returned sandbox
ports/URLs/name. It preserves the Docker-error prefix and never falls back to
host Xvfb. Reservations use first-rejection completion order, not tuple index.
`stop` suppresses container stop errors. Empty/missing container names fall
through to process cleanup.

Host startup preserves defaults and numeric overrides, inclusive display search
99..199, the five-second/100ms display poll boundary, exact argv, loopback VNC
bind, and 300ms/200ms waits. Successfully started children enter ownership before
any await. Startup failure terminates them in forward order; normal stop uses
reverse order, clears handles, and continues after termination errors. Native
process ownership also cleans up if the host-start future or returned host
session is dropped. Ports bind loopback and close before returning the number;
this is the reference's reservation hint, not a retained exclusive port lease.

## Evidence and reference integrity

`gateway_rust_live_view.rs` executes actual production TS source with Bun. The
loader reads that source directly and changes only four import specifiers to
unique fixture modules. It verifies that each expected specifier occurs once;
all function bodies remain verbatim. Builtin-name mocking is avoided because
Bun can retain native `node:net` internals. No Docker or display daemon runs.
External process/socket/filesystem/clock/sandbox behavior is controlled by the
fixture, rather than rewriting any lifecycle or admission algorithm.

The 19-check target includes four shared transport guards and 15 domain checks:
container options/results, failures/no fallback, all reservations on failure,
first asynchronous rejection, exact host command traces, zero/fractional
numeric inputs, first/last/exhausted displays, readiness deadlines, all spawn
failure cleanup, kill exceptions, actual-TS FIFO success/error/limit-change
phases, bounded overload/cancellation, host cancellation cleanup, and a real
native process/socket fixture. The Unix fixture executes a project-owned
binary, verifies literal arguments, failed executable startup, termination,
reaping, Drop cleanup and a closed/rebindable loopback reservation. All artifacts
are under project `.jait/artifacts/gateway-rust/`.

Evidence logs and mutation results are under
`.jait/artifacts/gateway-rust/agent-messenger-history/`: `live-view-final-focused.log`,
`live-view-clippy.log`, `live-view-fmt.log`, `live-view-artifacts.log`, and
`live-view-mutation-results.json`. Coverage credit additionally requires restored
focused checks and strict Clippy/format/artifact checks after mutation review.

## Explicit compatibility decisions and limits

The new native typed API accepts the declared TS option types, not arbitrary
untyped JSON objects. Native process handles are owned resources; they are not
serialized or faked as JavaScript ChildProcess values. Tests compare counts and
ordered process effects.

The manager's waiting queue has a caller-configured bound; saturation returns
`Docker sandbox browser failed: Live-view start queue is full`. TS's queue is
unbounded. Direct native API client tests exercise rejection, waiter cancellation,
active cancellation, subsequent FIFO progress and capacity reuse. This behavior
is opt-in, affects no existing HTTP client, and requires route/client evidence
before any future runtime composition. There is no session-capacity claim.

The sandbox port explicitly requires cancellation-safe ownership: dropping a
start future must finish cleanup of any untransferred sandbox before releasing
its resources. The cancellation fixture checks removal of an active registration
and reuse of admission. An adapter that schedules uncertain asynchronous cleanup
without retaining effect ownership does not meet this contract. The canonical
native SandboxManager is still unported; no Docker execution, image lifecycle,
real browser/noVNC or remote media capability is claimed here. No TS bridge is
used by native code. Actual Docker integration needs its own reviewed adapter
and cancellation evidence.

The Unix process adapter owns a dedicated group, sends TERM, escalates after a
bounded 100ms grace and reaps the direct child; this strengthens TS's fire-and-
forget `kill` with synchronous native ownership. Non-Unix builds use direct
child termination and need platform evidence. Full descendant, signal-resistant,
platform, browser/client integration and runtime shutdown/load/soak gates remain
open. Production remains TypeScript; no activation, release or publication.
