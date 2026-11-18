# Native background command monitor

Reference: packages/gateway/src/services/background-command-monitor.ts.
Native: services/background_command_monitor.rs, with execution/completion_output.rs.
Target: gateway_rust_bg_monitor. The reference adapter imports the real singleton.
Only the clock, timer queue, terminal surface, notification sink and external exit promise are fixtures.

Comparisons assert state after every action: active count, listener and timer counts,
terminal lookup, accumulated output, completion/stop/cancel ordering, warnings,
notification payloads, and callback errors. Output and warning strings use UTF-16 units.
JSON numbers use the reference's IEEE-754 number semantics (0 and 0.0 compare equally).
Coverage includes fragmented BEL/ST OSC markers, empty/negative/unparseable exit codes,
escaped sentinel tokens, sentinel priority, exact 249/250 ms fallback boundaries,
expiry before grace, the six-hour default, session isolation, cleanup exactly once,
inline notification suppression, callback failures, external success/rejection/cancel,
handler replacement and unsubscribe, absent sinks, and the shared 50-watcher cap.
Native-only tests prove final-owner cleanup and cancellation while another thread is
blocked inside the output callback.

A cancellation defect was reproduced in both implementations: onOutput could stop the
session but the same listener invocation subsequently completed the command and notified
the agent. The TypeScript repro expected zero onComplete calls and observed one; the
native repro observed both complete and handler events after stop.
Cleanup now marks the TypeScript watcher finished, and output delivery checks that
state after callbacks. Native output/finish also check stopped, including after onOutput.
The unchanged assertions pass with and without a sentinel; the latter case also asserts
that cancellation creates no grace timer.

Evidence under .jait/artifacts/gateway-rust/:
- bg-monitor-cancel-ts-before.log and bg-monitor-cancel-native-before.log
- bg-monitor-ts-final.log: 28 passed (18 monitor, 4 continuation, 6 ACP terminal)
- bg-monitor-native-final.log: 11 passed (7 monitor, 4 subprocess transport checks)
- bg-monitor-clippy-final.log: strict focused Clippy passed
- bg-monitor-mutations.json: three restored mutations fail assertions: zero sentinel
  grace, uncancelled grace timer, and a 51st admission slot.
- bg-monitor-restored.log: restored mutation run passed; final suites include the
  cancellation regression added after those mutation checks.

Run:
  node node_modules/vitest/vitest.mjs run packages/gateway/src/services/background-command-monitor.test.ts
  ~/.cargo/bin/cargo test --manifest-path tests/contract/Cargo.toml --test gateway_rust_bg_monitor

The injectable surface must serialize output delivery and must not emit synchronously
during registration. This component implements monitor lifecycle; wiring every provider,
PTY transport, and external node to it is separate migration work. Arbitrary invalid timer
delays, unbounded output retention compatibility, all callback reentrancy, OS timer load,
and a complete production wake-up pipeline are outside this evidence. No production
gateway startup or live agent/notification service was changed.

## Responsive execution update (2026-10-21)

Both implementations now expose session- and execution-scoped bounded progress,
cancellation, and the last 100 finished states. An old execution identity cannot
cancel the current command in a reused terminal. Explicit execution deadline
callbacks stop the owned execution, retain `timed_out`, and notify once with a
timeout flag; legacy observation-only expiry still just removes its watcher.
External process snapshots use a live output getter and preserve timed-out exit
outcomes. Captured raw output is capped at 64,000 UTF-16 units. Initial completion
markers are processed after registration so foreground handoff cannot lose them.

Four new differential scenarios cover ownership rejection, stale IDs, cancellation
with late completion, retained finished state, external output and timeout,
deadline stop/notification ordering, and an already-arrived completion marker.
The native wait policy and real TypeScript tool acceptance target are also linked
in the inventory. Focused evidence: `.jait/artifacts/terminal-execution/`.
Native terminal dispatch and PTY execution remain separate unported components.

Local and remote shell-exit subscriptions now finish without OSC/prompt markers.
The Rust surface port and TypeScript surface agree on exit callbacks, including
late duplicate exits after cleanup; a real PTY `exit 7` regression also passes.
