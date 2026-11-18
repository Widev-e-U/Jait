# Provider steering dispatcher policy

Reference: `packages/gateway/src/providers/steering-dispatcher.ts`.
Native: `packages/gateway-rust/src/providers/steering_dispatcher.rs`.
Target: `gateway_rust_steering_dispatcher`.

The adapter subscribes to the session queue on construction and defers delivery
until start and host scheduling. Only one delivery task runs per dispatcher;
arrivals remain queued until acknowledged. Rejection/transport failure blocks
further delivery until an explicit start, preserving FIFO fallback. Errors reach
the failure observer without consuming the message. Pause closes admission
synchronously and waits for the captured task; its in-flight acknowledgement owns
its original message even after pause. Dispose unsubscribes once, remains terminal
across later start calls and suppresses late transcript markers while still
consuming acknowledged objects. Consumption uses the exact peeked object and its
original metadata, so a concurrent fallback drain cannot consume an equal-valued
replacement or produce an extra transcript marker.

The source-owned TypeScript driver transpiles the actual dispatcher and extracts
the actual SteeringController declaration from agent-loop.ts with asserted source
boundaries. It does not reimplement their policies. Rust scripts independently
exercise a typed identity-preserving queue, supervised future scheduler and
controllable provider acknowledgements. Twenty-three scenarios compare every
action's deliveries, consumed metadata, failures, remaining queue, pause outcomes
and listener counts. They cover deferral, repeated starts, FIFO, rejection and
Error/raw thrown values, pause/start races, multiple pause waiters, disposal,
late success/failure, drains, equal text, empty text, Unicode and hidden/display/
client queue metadata. No field normalization is needed.

Two native checks also drop polled and unpolled scheduled futures: pause waiters
receive a cancellation error; uncertain delivery stays queued and cannot retry
automatically. A new explicit start reopens admission. This is native task
supervision behavior, not a claim that dropping a provider future stops a remote
effect. Hosts must dispose on turn cancellation and account for actual provider
cleanup before releasing resources.

All 13 isolated mutations were caught by failing assertions: prefix, pending-task
exclusion, blocked admission, start reset, pause boundary/ack wait, terminal
disposal, late transcript suppression, consumption result, failure observer,
automatic retry after task drop, and TypeScript pause/disposal regressions.
The restored target passes 11 checks (five differential groups, two native lifetime
checks and four driver checks). Evidence:
`.jait/artifacts/coverage-goal/steering-dispatcher-mutations.json`,
`steering-dispatcher-restored.log` and the adjacent per-mutation logs.
The source-bound full gate is required before advancing a completed checkpoint.

## Integration boundary

This module is dispatch policy. The host supplies the already-authorized
session-owned queue, provider delivery and transcript callbacks. Its scheduler
must defer polling until the initial provider prompt has been submitted, retain
joinable tasks through shutdown and observe their results. Control/callbacks and
queue operations run on the same session lane. It must enforce queue byte/item
budgets and existing authority/revocation at actual effects. The adapter never
spawns an untracked task or copies the pending queue. Queue/controller, full agent
loop, provider transports, session supervision and production composition earn no
additional component credit. Real ACP/client/platform/load/recovery and production
replacement gates remain open; no capacity or activation claim is made here.
