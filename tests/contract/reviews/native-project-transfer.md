# Native project transfer

Reference: `packages/gateway/src/services/project-transfer.ts`.
Native: `services/project_transfer.rs`, `runtime/command.rs`.
Target: `gateway_rust_project_transfer`; driver: `drivers/nativetransfer.ts`.

Nine differential tests execute the real TypeScript transfer function. A recording
wrapper preserves real execFile behavior and records argv/timeouts/buffer limits.
Disposable local ssh/scp executable peers record actual argv, produce controlled
stdout/stderr/exit codes, or are deliberately missing/nonexecutable. PATH contains
only that peer directory. Native commands run against the same peers and compare
returned results, error messages, actual process ordering and execution options.
No peer opens a network connection or transfers files to another system.

Covered: SSH host/user validation and its order, missing versus null ports,
integer/range/type boundaries, destination NUL/CR/LF rejection, remote single-quote
escaping, literal shell metacharacters, trailing slash/backslash removal, copying
contents including empty/root sources, SSH/scp port flag casing, preparation before
copying, all four output streams and ECMAScript trimming. Preparation failure stops
copying. Nonzero exits, missing executables, permissions and source-path NUL failures
are compared at the actual stage. Separate 1 MiB preparation and 10 MiB copying
limits are exceeded on stdout and stderr in real process tests.

Two native plan regressions pin these contracts independently. Six additional
process lifecycle tests prove independent per-stream limits, complete UTF-8 decode,
missing/NUL failures, admission/close, timeout output and reaping, cancellation,
and descendants unable to hold pipes after the deadline. Unix commands use a dedicated
process group that is killed on completion/drop; Windows descendant cleanup remains
an activation/platform verification gate. No Windows process-tree parity is claimed.

The original native failed the reference's empty-stderr error spelling; the same
comparison now passes. A second failing reproduction caught Bun's PATH lookup error
spelling for missing/nonexecutable relative binaries. Captured failures are in
`.jait/artifacts/gateway-rust/project-transfer-before.log` and
`project-transfer-spawn-before.log`; the unchanged assertions pass in
`project-transfer-contract.log`. Error text follows the current Bun reference profile;
other runtime/platform error wording remains a compatibility boundary.

Current Bun argument diagnostics escape NUL and other control bytes and select
quotes for embedded apostrophes. The frozen gate caught the earlier raw-NUL
native message; the expanded source-NUL comparison now checks six control,
quote, backslash, Unicode and following-digit cases. It still verifies preparation
runs first and SCP never starts for rejected arguments. Evidence:
`.jait/artifacts/gateway-rust/channels-http/project-transfer-recheck.log` and
`nul-runtime-probe.jsonl` in the same directory. These diagnostic changes do not
change transfer authorization, argv rejection or process limits.

Four mutations are caught by native plan tests and the differential suite: omitted
remote quote escaping, changed connection timeout, wrong SCP port flag, and keeping
source trailing separators. Original source is restored byte-for-byte. Evidence is
`project-transfer-mutations.json` and per-mutation logs in the same artifact directory.
Restored native/process checks and Clippy logs are retained there as well.

Execution requires the caller's existing authorization for source, destination,
credentials and node. A transfer plan is inert and can be reviewed separately.
The native helper adds no tool/route, assessment authorization, credential discovery,
or production startup wiring. Source-domain input fields remain typed strings;
arbitrary malformed JS objects are not a native API. This component receives one
source-component entry; the generic command pool receives no separate inventory credit.
