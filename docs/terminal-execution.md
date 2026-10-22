# Tracked terminal commands

`execute`, `terminal.run`, and `jait.terminal` return completed output for quick
commands. A finite command that is still running after the initial wait returns
partial output, `terminalId`, `executionId`, `isBackground: true`, and `watched: true`.
The process continues and its completion automatically resumes the originating
conversation. A yielded wait is not a process timeout: `timedOut` remains false.

- `yieldTimeMs`: initial wait, 10 seconds by default, capped at 30 seconds. Zero
  yields after one scheduler tick. This never extends the execution deadline.
- `timeout`: execution deadline, one hour by default, capped at 24 hours (existing
  timeout environment overrides still apply). On expiry Jait stops the execution
  and reports a timeout. Previously the host terminal treated this as a wait
  budget and let the process continue; callers should use `yieldTimeMs` to control
  responsiveness now. Servers also need a suitable finite execution deadline.
- `isBackground: true`: return after startup output settles, within five seconds.
  A startup snapshot does not establish application readiness.

Discover `terminal.execution` to inspect or cancel a running command. Pass its
`terminalId`, `executionId`, and `action: "inspect"` or `"cancel"`. Both IDs must
match a command in the requesting session. A stale ID cannot cancel a newer
command in the same terminal. Inspection returns bounded partial output and a
status: `running`, `completed`, `failed`, `timed_out`, or `cancelled`. The latest
100 finished executions are retained in memory; gateway restarts clear them.
Do not rerun a command just because its initial wait yielded. Use completion
notifications or occasional progress inspection instead of a polling loop.

Host cancellation/deadline expiry stops the execution's terminal, avoiding reuse
of a shell still occupied by the previous command. Sandbox cancellation targets
that command's process group, preserving the provider's long-lived container.
Actual local or remote shell exit completes the command even without a prompt or
OSC completion marker. Cancellation during environment setup prevents command dispatch.
Busy terminals reject a second command; unrelated work can use another terminal.
Watcher admission failure does not launch an unmonitored background command.
Existing tool consent and execution-node routing still apply.

Installed local Bash, sh, and zsh parsers reject incomplete syntax before input
is written to a persistent terminal. Remote shells and other shell languages
retain their execution/inspection/deadline path; they do not use a local parser.
Network probes should still specify connection and request deadlines. Yielding
keeps the agent responsive but does not accelerate a slow build or remove its
memory limits. Multiline command scripts stay under the active project's
`.jait/artifacts/jait-terminal/`.

Rust coverage: `gateway_rust_bg_monitor` compares the real TypeScript monitor and
native monitor after each lifecycle event. `gateway_rust_terminal_execution`
compares the native wait policy and drives the real TypeScript tool through
yield, inspection, ownership rejection, cancellation, timeout, malformed syntax,
and admission failure. `gateway_rust_core_io` checks forwarding of the new wait
parameter and exact tool metadata; `gateway_rust_prompts` checks updated guidance.
The complete terminal engine is not yet native and gains no migration credit
from these tests.
