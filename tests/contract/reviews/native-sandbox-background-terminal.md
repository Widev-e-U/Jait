# Sandbox background terminal startup adapter review

Reference: `packages/gateway/src/tools/sandbox-background-terminal.ts`.
Native: `packages/gateway-rust/src/tools/sandbox_background_terminal.rs`.
Focused target: `gateway_rust_sandbox_terminal`.

The native adapter starts an already authorized sandbox execution through a typed
manager port and reuses `BackgroundCommandMonitor::track_external` for ownership,
inspection, cancellation, capacity and completion delivery. It does not duplicate
the monitor, execute shell text, grant execution authority or implement Docker.
Context session/action/container/signal values are trusted host inputs; command
options pass through to the manager, which retains consent, mount, network,
identity, duration, concurrency and output enforcement.

Native policy includes pre-abort suppression, the post-listener-install abort
check, UUIDv7 terminal naming through the runtime generator, the minimum execution
and startup deadlines, background-only 500 ms idle resets, startup-only streaming,
listener/timer cleanup, completion-before-handoff behavior, cancellation priority,
exact result fields/messages and capacity rejection with an awaited process stop.
Tracked operations retain live output access, the original start time, session
and action identity, stop delegation and notification suppression after abort.
UTF-16 output is retained losslessly until the existing result/export boundary.

The TypeScript driver transpiles the actual reference adapter with only its two
import bindings replaced (deterministic UUID and the actual TypeScript monitor).
It preserves all policy/constants, runs the real monitor and supplies virtual
Date/timers plus an execution and signal port. The native tests use the same
Rust-owned cases with the real native monitor and independent timer scheduler.
Comparison checks complete results, result timestamp, options forwarded to the
manager, stop counts, streamed UTF-16 chunks, listener/timer counts, active watcher
counts, completion notifications and foreign/stale/owner inspection results.
Numeric JSON representations are normalized; result text and output are not.

Twenty scenarios in five contracts cover immediate/success/failure/timeout/null
completion, completion container override, Unicode output, default 5-second cap,
repeated idle resets, a shorter execution deadline, foreground explicit yield,
background yield override behavior, timer/completion ties, pre-abort/install race,
startup abort, scoped progress/history/cancel, missing action fallback, tracked
abort notification suppression, full monitor capacity and start/stop failures.
The four shared driver transport checks also pass. Evidence:
`.jait/artifacts/gateway-rust/chat-loops/sandbox-terminal-focused.log`.
Actual/expected cases are saved under
`.jait/artifacts/gateway-rust/sandbox-terminal/<case-run>/`.

All eight isolated native regressions were caught: startup cap, exact idle deadline,
idle reset, post-install abort race, unsubscription, capacity stop, abort notification
suppression and monitor-cancel stop. The restored target passes all nine checks
(five focused contracts plus four shared driver checks). Evidence:
`.jait/artifacts/gateway-rust/chat-loops/sandbox-terminal-mutations.json`,
`sandbox-terminal-mutations-restored.log` and individual mutation logs.
Strict native Clippy passes (`sandbox-terminal-clippy.log`). The full 227-component frozen gate passes
(`.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/227-report.json`).
The later review-sync module/declaration remain outside that snapshot.

Host limits: the process port must initiate stop synchronously and supervise it
through actual termination/reaping even if its returned observation is dropped.
The caller must propagate external cancellation through the signal before dropping
the startup future. Subscription/timer guards clean local observation on drop;
they do not imply process termination. Process completion should resolve to the
typed command outcome; process-engine failure normalization belongs to the manager.
The host must serialize output callbacks as the reference event loop does, and
supply bounded output, reviewed scheduling and its shared UUIDv7 generator.
No real container, provider, process-engine, platform or production activation
credit is inferred from these injected-I/O adapter contracts.
