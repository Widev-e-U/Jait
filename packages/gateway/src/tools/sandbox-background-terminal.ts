import { uuidv7 } from "../db/uuidv7.js";
import { backgroundCommandMonitor } from "../services/background-command-monitor.js";
import type { SandboxManager, SandboxRunOptions, SandboxExecOptions, SandboxRunResult } from "../security/sandbox-manager.js";
import type { ToolContext, ToolResult } from "./contracts.js";

/** Startup and completion are separate: a running server never blocks the turn. */
export async function runSandboxBackgroundTerminal(
  manager: SandboxManager,
  options: SandboxRunOptions | SandboxExecOptions,
  command: string,
  context: ToolContext,
  wait: { isBackground: boolean; yieldTimeMs: number } = { isBackground: true, yieldTimeMs: 5000 },
): Promise<ToolResult> {
  if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
  const startedAt = Date.now();
  const execution = manager.startBackgroundCommand(options);
  const terminalId = `sandbox-command-${uuidv7()}`;
  let completed: SandboxRunResult | undefined;
  let startupPending = true;
  let release!: () => void;
  const startup = new Promise<void>(resolve => { release = resolve; });
  const timer = setTimeout(() => release(), Math.min(options.timeoutMs, wait.isBackground ? 5000 : wait.yieldTimeMs));
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => { void execution.stop(); release(); };
  context.signal?.addEventListener("abort", onAbort, { once: true });
  // Close the race between the initial check and installing the listener.
  if (context.signal?.aborted) onAbort();
  const removeOutput = execution.onOutput(chunk => {
    if (!startupPending) return;
    context.onOutputChunk?.(chunk);
    if (wait.isBackground) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => release(), 500);
    }
  });
  const completion = execution.completion.then(result => {
    completed = result;
    context.signal?.removeEventListener("abort", onAbort);
    release();
    return result;
  });
  try {
    await startup;
  } finally {
    startupPending = false;
    clearTimeout(timer);
    if (idleTimer) clearTimeout(idleTimer);
    removeOutput();
  }
  const data = {
    sandbox: true, containerName: execution.containerName,
    threadSandbox: Boolean(context.sandboxContainerName), hostUnaffected: true, terminalId, executionId: context.actionId,
  };
  if (context.signal?.aborted) {
    await execution.stop();
    return { ok: false, message: "Cancelled", data: { ...data, output: execution.output, cancelled: true } };
  }
  if (completed) {
    return {
      ok: completed.ok,
      message: completed.timedOut ? "Sandbox command timed out" : `Sandbox command completed (exit code ${completed.exitCode ?? "unavailable"})`,
      data: { ...data, ...completed, isBackground: false, watched: false },
    };
  }
  const watched = backgroundCommandMonitor.trackExternal({
    sessionId: context.sessionId, terminalId, executionId: context.actionId, command, startedAt,
    getOutput: () => execution.output,
    exitPromise: completion,
    shouldNotify: () => !context.signal?.aborted,
    onCancel: () => { void execution.stop(); },
  });
  if (!watched) {
    await execution.stop();
    return { ok: false, message: "Background command limit reached; sandbox command stopped", data };
  }
  return {
    ok: true,
    message: "Sandbox command is running. Output is partial, not completion. Continue independent work; completion will resume you automatically. Use terminal.execution to inspect progress or cancel. Do not rerun the command.",
    data: { ...data, output: execution.output, exitCode: null, timedOut: false, isBackground: true, watched },
  };
}
