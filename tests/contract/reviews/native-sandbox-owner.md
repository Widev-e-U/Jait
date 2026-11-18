# Native sandbox owner identity

Reference: `packages/gateway/src/security/agent-sandbox-owner.ts`. Native: `security/agent_sandbox_owner.rs`. Target: `gateway_rust_owner`.

Gateway identity hashes the hostname, trimmed machine ID, PID namespace and lexically resolved state directory using the same compact JSON bytes and truncated SHA-256. Owner identity records PID, process start ticks and boot ID. Owner checks retain malformed identifiers, invalid/unsafe PIDs and unknown/permission-denied probes, and reject missing processes, known reboots and PID reuse. Proc parsing uses the last closing parenthesis and ECMAScript whitespace rules.

The OS boundary is explicit and injectable. Fixture comparisons execute the actual TypeScript functions with injected filesystem, hostname and signal-zero probes; they cover missing files, Unicode and JSON escaping, state path normalization, namespace changes, EPERM/ESRCH/unknown failures, unsafe PID strings, leading zeroes and PID-reuse/reboot cases. A real native process and a reaped child are additionally checked with the real TypeScript process probe. No nonzero signal is sent. Seven tests pass, including four shared transport-helper tests.

Three mutations remove reboot detection, ignore start-time mismatch, and substitute the mount namespace. All fail unchanged comparisons; restored sources pass. Strict native Clippy passes. Evidence: `.jait/artifacts/gateway-rust/sandbox-owner/`.

Scope: tested on Linux. Unix process probing uses libc signal zero; non-Unix probing currently conservatively retains uncertain owners. Native startup, background process registration and supported-platform death detection still require integration evidence. The library takes an explicit state path, avoiding discovery of live project state in the test runner. The libc dependency already existed transitively; it is now an explicit locked dependency for these native OS calls.
