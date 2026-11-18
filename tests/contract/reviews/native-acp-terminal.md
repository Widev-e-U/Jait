# Native ACP captured terminal

Reference: packages/gateway/src/providers/acp-terminal.ts.
Native: providers/acp_terminal.rs and execution/completion_output.rs.
Target: gateway_rust_acp_terminal. The TypeScript adapter imports the actual class and actual completion-cleanup function; only fixture commands run.

The native pool owns real child processes and captured pipes. Exact comparisons cover:
- literal argument forwarding without shell evaluation, explicit cwd, inherited/overridden environment values, stdout, stderr and exit codes;
- SIGTERM completion, repeated kill/release, repeated exit/completion waits and startedAt validity;
- missing executable and invalid cwd completion;
- UTF-8 output byte ceilings with exact UTF-16 suffixes, including lone surrogates, zero/unlimited, negative, fractional and nonfinite limits;
- completion cleanup: OSC/ANSI sequences, echoed commands, sourced scripts, sentinel lines, shell prompts, empty output and the 4000-UTF-16-unit tail.

Generated time is validated rather than compared. Platform-specific OS spawn diagnostic wording is replaced with a marker in the differential adapter; the error wrapper and settled state remain asserted. Output strings are compared as UTF-16 code units so no surrogate mismatch is normalized away. Native admission tests separately prove overload rejection, closed-pool rejection, and reaping after the final owner drops an ignored-SIGTERM child.

Two reference defects were reproduced and corrected:
1. Node emits error/close without exit when spawn fails. waitForExit previously stayed unresolved; the same Vitest test now receives {exitCode:null,signal:null}, isRunning=false and a diagnostic. Repeated waits and completion settle. Only absent-PID failures take this path; actual process exits keep their status.
2. This checkout's Bun 1.3.10 reports two bytes for a lone surrogate even though UTF-8 encoding uses three. Under a two-byte limit the old class retained [0xde00], encoding to three bytes. The unchanged Bun repro now retains zero bytes. Measurement uses encoded bytes, and suffix trimming runs linearly while preserving the reference's UTF-16 slicing behavior. Node regression cases and the native/Bun comparisons cover adjacent limits.

Repro/evidence:
- node node_modules/vitest/vitest.mjs run packages/gateway/src/providers/acp-terminal.test.ts
- bun .jait/artifacts/gateway-rust/acp-byte-limit-repro.ts
- .jait/artifacts/gateway-rust/acp-spawn-before.log and acp-spawn-after.log
- .jait/artifacts/gateway-rust/acp-byte-before.log and acp-byte-after.log
- .jait/artifacts/gateway-rust/acp-terminal-after.log and acp-terminal-clippy.log

The target passes 10 executions (including four subprocess-driver checks), and six TypeScript regressions pass. Three restored mutations fail the intended tests: wrong UTF-16 byte decrement, SIGKILL in place of SIGTERM, and an extra process-admission slot. Structured evidence: .jait/artifacts/gateway-rust/acp-terminal-mutations.json.

The native adapter adds explicit shared admission and final-owner cleanup. It drains pipes before publishing completion, with a two-second ceiling for inherited descriptors; a drain cutoff sets truncated=true. Direct-child reaping is established; complete descendant-tree policy, cross-platform process handling, NUL-invalid argument diagnostics, arbitrary stdout/stderr arrival order, and every OS pipe chunking boundary are outside this focused Linux evidence. Unlimited output limits remain compatible with the reference; production limits and provider dispatch still require their separate migration gates. The completion text helper is ported as a dependency; background watcher lifecycle earns no component credit here. No live provider login, credentials, network service, ACP server or production startup was used or changed.
