# SandboxManager browser launch command construction (partial, uncredited)

Canonical module: `packages/gateway-rust/src/security/sandbox_manager.rs`.
Reference: `packages/gateway/src/security/sandbox-manager.ts`, command construction
in `startBrowserSandbox` and `buildMountArgs`. This is a lifecycle prerequisite;
there is no native browser start/readiness/retry orchestration yet.

The native builder accepts explicit host-captured ports, gateway and two clock
samples. It constructs the detached, auto-removed browser command, base36 name,
kind/creation labels, network isolation, optional host mapping, project mount and
host-published noVNC/VNC/CDP ports. Browser defaults are read-only and network
enabled. Host path authorization and ambiguous mount-syntax rejection reuse the
canonical command manager check, including directory preparation for mount-none.
No shell, engine startup, implicit port allocation, network probe or clock read
occurs. The builder returns command data, never consent or a startup capability.
There is no duplicate manager or independently credited component.

The next lifecycle must compose `prepare_browser_image` before these host inputs
and mount preparation, then supervised launch and ownership transfer. It must
retain the startup name through cancellation/late completion, implement the
single bind-conflict retry using scoped container discovery, and perform bounded
socket/HTTP readiness on the authorized host-side published endpoint. Captured
ports are nonzero u16 values; that is structural validation, not authorization.
Gateway values are a literal host-gateway token or typed IP address, not arbitrary
arguments. Bootstrap remains responsible for scope, node, engine and resource
authority; no host adapter is introduced here.

## Compatibility and limits

The reviewed valid-input command contract preserves reference argv/order, public
port mappings (no implicit loopback-only rewrite), mount options and separate
name/createdAt clock samples. The captured u64 clock contract is epoch milliseconds;
reference comparisons use exact safe JS integers. The clock provider, timestamp
collisions and actual engine behavior remain integration gates.

Invalid/denied project roots fail before mkdir or engine calls. Relative roots
must be resolved by the authorized host adapter, rather than ambient gateway cwd.
This preserves the earlier native command-path boundary decision; actual TS
directly resolves and mkdirs its input. Typed ports exclude TS's invalid numeric
ports. Neither difference is replacement-ready without actual consumer evidence.

Browser commands do not add command-session owner/Git labels or mounts. The
reference also has no command-session host-user arguments. No writable container
is started in these tests; a concrete Linux adapter must satisfy host UID/GID and
writable HOME policy before writable project execution. Native typed IP gateway
vectors check encoding only; Linux reference comparisons exercise host-gateway,
not Windows/WSL or real IPv6 engine behavior.

## Evidence

Artifacts live in `.jait/artifacts/gateway-rust/sandbox-manager-20261026/`.
The `browser-launch-slice-review.json` binds restored source, actual-reference
comparison, mutation controls and check logs to their hashes. Native vectors
cover 192 engine/mount/network/CDP/gateway/clock combinations. A separate native
guard test checks denied/ambiguous paths, absence of mkdir/process effects on
rejection, and typed IP encoding. Actual TS comparisons execute the unchanged
start method through command construction, with explicit ports and mocked
prerequisite methods; the runner throws a sentinel before any startup effect.
Import-only seams block child processes and filesystem effects. The gateway
helper is the actual Linux host-gateway path. Podman is normalized only for this
comparison; native vectors independently assert the selected engine binary.
The comparison checks exact argv, mkdir and admission/image-before-run ordering,
not native lifecycle composition or the TS readiness timeout behavior.

Four independent mutations remove network isolation, make read-only mounts
writable, misroute CDP to 9222, or bypass project boundary checks. They must fail
assertions, with restored validation afterward. Test counts and final pass
evidence are recorded in the review JSON; this prose is not test output.

Whole-manager coverage stays uncredited. Linux/Windows lifecycle, existing
containers/background routing, storage/symlink containment, identity/worktree and
direct callers, actual build/process/readiness cancellation, engine/platform,
frozen-source replacement and activation gates remain open. The full241 gate
is historical. Production remains TypeScript.
