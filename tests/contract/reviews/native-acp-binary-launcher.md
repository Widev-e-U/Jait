# Native ACP binary launcher review

Reference: `packages/gateway/src/providers/acp-binary-launcher.ts`.
Native: `providers/acp_binary_launcher.rs` and `bin/jait-acp-binary-launcher.rs`.
Candidate for the full source-bound gate. No production launcher activation.

The native program decodes and validates specifications, resolves state/binary roots,
checks markers, coordinates installation with directory locks and stale-lock recovery,
downloads using HTTPS with the reference timeout and redirect budget, verifies optional
SHA-256, screens archive entries, extracts with real tar/unzip, checks command realpaths,
publishes the install, sets modes and writes the marker. It forwards arguments/environment,
exit codes and POSIX signals to/from the real agent child. Cargo retains the gateway as
its default executable after adding the launcher binary.

Boundaries: `LauncherIo` models time, download and archive tooling; `LauncherProcess`
models child supervision. System adapters implement each natively; filesystem checks,
markers, publication and lock/scratch cleanup use actual owned directories. No JS bridge.
Spec-driven child execution is limited to owned fixture scripts in validation.

Host evidence: `node tests/contract/run.mjs test --test gateway_rust_acp_binary_launcher`
passes 22 component checks plus four subprocess transport checks. These cover parsing,
archive paths, checksum failure, real ZIP extraction, install modes/idempotence/repair,
lock contention/staleness/timeout, dropped installs, child exit/signals/cancellation,
HTTPS and the process entry point. A native library test proves archive reads consume
at most the byte ceiling plus one detection byte. Output is capped while reading on
both streams (8 MiB listing, 1 MiB extraction), not after unbounded collection.

Three differential checks execute the actual TypeScript program: failure policy and
checksum, padded base64 decoding, and complete HTTPS ZIP installation/execution. The
last compares exit status, forwarded arguments/environment, marker bytes, modes and
archive-tool selection. Native transport trusts an explicit owned fixture certificate;
its twelve-redirect chain and a failing HTTP response are exercised. The TypeScript
peer uses a separate owned TLS fixture. Standalone native checks execute with empty PATH,
then prove signal-shaped exit and SIGTERM forwarding without a JS runtime.

Host reproductions and fixes (all saved under `.jait/artifacts/gateway-rust/`):
- `launcher-fixtures-before/after.log`: empty argv reported Invalid instead of Missing.
- `launcher-cancel-before/after.log`: dropping the run left one signal task alive; an
  abort-on-drop owner now ties that task to the child operation.
- `launcher-tool-cancel-before/after.log`: dropped archive operations left their process
  alive; kill-on-drop now applies to archive subprocesses too.
- `launcher-buffer-before.log` and `launcher-host-all.log`: oversized stderr was accepted;
  bounded concurrent reads now reject it and apply the source extraction default.
- `launcher-base64-before.log` and final host suite: padding failed to stop decoding;
  trailing data after `=` is now ignored as in Node.
- Two restored mutations (inverted checksum comparison, dropped forwarded argument)
  fail the actual TypeScript differential checks. `launcher-mutations/` holds evidence.
- Spawning the freshly installed command retries a bounded number of times while the
  kernel reports `ETXTBSY` (ten attempts, 10 ms apart). The install writes the agent
  binary and execs it immediately, so a `fork` in another thread that still holds the
  installer's write descriptor makes the first `execve` fail with "Text file busy";
  the source surfaces that error immediately. Only that errno is retried, every other
  spawn failure is reported on the first attempt, and the bound keeps a permanently
  busy file an honest `SpawnFailed`. Four launcher unit tests cover the policy plus a
  real-kernel reproduction that releases the writer mid-retry.

Worker test expectations were corrected against actual source/host observations: invalid
optional digests are ignored, command paths are checked during installation, extraction
targets a scratch `files` directory, internal_driver returns the results array directly,
and shell fixtures need `$$` for a PID. Tests were not weakened to accept a wrong runtime.

Limits: Linux/POSIX evidence only; Windows path and process behavior remain open. Native
malformed JSON/non-object exception wording is normalized; URL/IO/tool engine errors can
also differ. Install version/target containment is checked before creating directories,
which preserves the native path boundary more strictly than the reference. The reference
archive format/lock design is retained, including its stale-lock race and lack of archive
expansion quotas. Downloads are buffered as in the source; no invented 2 MiB cap is claimed.
TLS/proxy differences outside the owned fixture and production activation are not verified.
