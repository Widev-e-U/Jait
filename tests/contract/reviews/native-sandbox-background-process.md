# Sandbox background process policy review

Reference: `packages/gateway/src/security/sandbox-background-process.ts`.
Native: `packages/gateway-rust/src/security/sandbox_background_process.rs`.
Target: `gateway_rust_sandbox_process`.

The native adapter implements attached sandbox process lifetime policy and the
injected-runner projection through typed process, scheduling and supervision ports.
It implements the existing `SandboxExecution` contract. It does not select Docker,
grant authority, implement the sandbox manager, or execute shell text locally.
The manager still owns invocation validation, consent, mounts, user identity,
network scope, bounded duration and authorized container identity. The host must
supply a trusted UUID generator and one shared admission instance per process
factory. Malformed internal invocations shorter than four arguments are rejected
before effects; valid manager invocations retain their exact argument sequence.

Process policy preserves the 50-command admission cap, release exactly once on
error/close, attached setsid/timeout wrapper, minimum one-second inner timeout,
private first-line PID framing and validation, chunked prefixes, 512-code-unit
framing threshold, late PID signaling after stop, TERM/two-second/KILL escalation,
container removal, five-second cleanup timeout and execution lifetime fallback.
Only validated numeric PIDs enter the fixed kill template. Container/command
values remain separate argv fields. Buffered output and listener chunks retain
16,000 UTF-16 units; trim follows ECMAScript whitespace. Completion preserves
null exit codes, 124/137 timeout classification, observer error suppression,
pending-prefix flush, first-terminal-event wins and listener/timer cleanup.

The injected runner owns its lifetime. Stop marks cancellation but cannot stop
that opaque operation. Its cancelled completion retains the reference's unbounded
trimmed result output while the live getter is bounded, and reports timedOut=false.
Normal completion publishes bounded nonblank output; rejection returns bounded
error text. This compatibility behavior is not a claim of bounded runner storage
or real process termination.

The TypeScript driver transpiles the actual source with only spawn/UUID import
bindings replaced. It uses deterministic event emitters and virtual timers; native
tests use independent typed process/timer ports. Twenty-three scenarios plus the
admission lifecycle comparison cover launches, all result fields, completion time,
streamed chunks, live output, stop observations, kills, pending timers, errors and
capacity reuse. Exact UTF-16 length and SHA-256 over little-endian code units are
compared, including a truncation boundary leaving an unpaired surrogate. Only
numeric JSON representation is normalized. The four shared driver checks pass.
Evidence: `.jait/artifacts/gateway-rust/chat-loops/sandbox-process-focused.log`;
per-case inputs and outputs: `.jait/artifacts/gateway-rust/sandbox-process/`.

All eight isolated native mutations were caught: output bound, PID validation,
minimum inner timeout, late-PID signaling, stop grace, cleanup deadline, admission
cap and injected-runner cancellation. The restored target passes all nine checks
(five focused contracts and four shared driver checks). Evidence:
`.jait/artifacts/gateway-rust/chat-loops/sandbox-process-mutations.json`,
`sandbox-process-mutations-restored.log` and individual mutation logs. Strict
Clippy passes (`sandbox-process-clippy.log`). The full frozen gate passes at 229/376 components; see
`.jait/artifacts/gateway-rust/runs/chat-workflow/checkpoints/229-report.json`.

Host requirements: serialize callbacks per execution and release process listeners
after terminal delivery; never call them inline during spawn. Decode each stdout/
stderr byte chunk as Node Buffer.toString does, rather than joining byte fragments
before decoding. Process ports must enforce argv/path/identity/scope policy and
supervise actual termination/reaping independently of this reference-level active
counter. A transport error releases that counter without proving descendants have
exited. Timer registrations must not keep an otherwise idle runtime alive;
supervised cleanup tasks must remain joinable during shutdown. The supervision
port retains and polls cleanup after stop observers are dropped and observes
errors. Tests use fake processes; real Docker, platform, resource/cleanup/recovery
and production replacement/activation gates remain open. This earns policy
adapter credit only, not a new process engine or production integration.
