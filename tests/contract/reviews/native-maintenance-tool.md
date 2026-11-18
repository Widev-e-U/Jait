# Native maintenance tool adapter

Reference: `packages/gateway/src/tools/maintenance-tools.ts`. Native:
`packages/gateway-rust/src/tools/maintenance.rs`.

The actual TypeScript factory and execute handler run through
`nativemaintenancetool.ts`; the driver controls only the underlying runner,
notification delivery and clock. No shell command or maintenance job is executed.
Complete tool metadata is compared directly, including the input schema.

Nine component tests plus four bounded-bridge guards pass. Differential cases
cover a single repository, all repositories, empty inventories, success/mixed/failure
summaries, check durations with JavaScript number formatting, absent/empty plan IDs,
notification links, nullish/primitive inputs, truthy non-string repo IDs, missing
and empty action identities, runner rejection and notification failure. Source
error strings and primitive/object/array thrown values retain their conversion.
Returned data preserves absent planId fields and original repository ordering.

The injected backend receives an explicit MaintenanceRequest. Its response types
project only the runner fields consumed by this tool; complete command output
and run evidence belong to the runner. The tool awaits the backend before
notifying or returning. Native tests retain that ordering with a paused oneshot,
prove a provided empty action identity does not evaluate the clock, and integrate
the real native NotificationService with a failing broadcast.

Two surgical native mutations compile and fail unchanged differential assertions:
dropping notification delivery and replacing the supplied job identity. Both are
restored; the full 13-check suite then passes. Evidence is under
`.jait/artifacts/gateway-rust/maintenance-tool-mutations/`. The first passing
standard run is `maintenance-tool-standard.log`; strict Clippy/full-gate results
are recorded separately.

Boundaries: this credits the tool adapter only. The maintenance command runner,
repository selection, database run persistence, fix-plan construction, scheduler
and production tool registration remain separate components. Caller authorization
and consent stay with authenticated tool execution and the backend. No process
starts, real notifications, automatic fixes, migrations or runtime activation
occurred during these tests. Inputs/results must satisfy the runner DTO; arbitrary
mutated JS service prototypes are outside that native interface.
