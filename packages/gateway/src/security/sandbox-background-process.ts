import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { SandboxRunResult } from "./sandbox-manager.js";

const MAX_OUTPUT_CHARS = 16_000;
const MAX_BACKGROUND_PROCESSES = 50;
let activeProcesses = 0;

export interface SandboxBackgroundExecution {
  containerName: string;
  readonly output: string;
  completion: Promise<SandboxRunResult>;
  stop(): Promise<void>;
  onOutput(listener: (chunk: string) => void): () => void;
}

/**
 * Keep Docker's exec attached for output and exit status. The inner timeout
 * bounds the actual container process, not merely the host Docker client.
 * A private first-line PID identifies the command's own process group for
 * cancellation; it is consumed before any user command output is forwarded.
 */
export function startSandboxBackgroundProcess(
  invocation: string[],
  containerName: string,
  timeoutMs: number,
  removeContainer: boolean,
  runtime: { spawn: typeof spawn } = { spawn },
): SandboxBackgroundExecution {
  if (activeProcesses >= MAX_BACKGROUND_PROCESSES) throw new Error("Too many background sandbox commands");
  const marker = `__JAIT_SANDBOX_PID_${randomUUID()}__`;
  const command = invocation.at(-1)!;
  const wrapper = `printf '${marker}%s\\n' "$$"; exec timeout --signal=TERM --kill-after=2s "$1" bash -lc "$2"`;
  const args = [
    ...invocation.slice(1, -3), "setsid", "--wait", "bash", "-c", wrapper, "jait-background",
    `${Math.max(1000, timeoutMs) / 1000}s`, command,
  ];
  const child = runtime.spawn(invocation[0]!, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  activeProcesses++;
  let output = "";
  let prefix = "";
  let groupPid: string | undefined;
  let stopped = false;
  let finished = false;
  let stopping: Promise<void> | undefined;
  const listeners = new Set<(chunk: string) => void>();
  const append = (chunk: string) => {
    output = (output + chunk).slice(-MAX_OUTPUT_CHARS);
    for (const listener of listeners) { try { listener(chunk.slice(-MAX_OUTPUT_CHARS)); } catch { /* observer */ } }
  };
  const signalGroup = (signal: "TERM" | "KILL") => {
    if (!groupPid) return Promise.resolve();
    // Only the validated numeric PID from the wrapper is interpolated.
    return runCleanup([invocation[0]!, "exec", containerName, "bash", "-c",
      `kill -${signal} -- -${groupPid} 2>/dev/null || true`], runtime.spawn);
  };
  const stop = () => {
    if (finished) return Promise.resolve();
    stopped = true;
    stopping ??= (async () => {
      if (removeContainer) {
        await runCleanup([invocation[0]!, "rm", "-f", containerName], runtime.spawn);
      } else {
        await signalGroup("TERM");
        if (!finished) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (!finished) await signalGroup("KILL");
        }
      }
      if (!finished) child.kill("SIGKILL");
    })();
    return stopping;
  };
  child.stdout.on("data", (data: Buffer) => {
    const chunk = data.toString();
    if (groupPid) { append(chunk); return; }
    prefix += chunk;
    const newline = prefix.indexOf("\n");
    if (newline < 0 && prefix.length < 512) return;
    const line = prefix.slice(0, newline < 0 ? prefix.length : newline).trimEnd();
    const pid = line.startsWith(marker) ? line.slice(marker.length) : "";
    if (/^[1-9][0-9]{0,9}$/.test(pid)) {
      groupPid = pid;
      append(prefix.slice(newline + 1));
      if (stopped) void signalGroup("TERM");
    } else {
      // Missing framing is a launcher error; never treat arbitrary output as a PID.
      append(prefix);
    }
    prefix = "";
  });
  child.stderr.on("data", (data: Buffer) => append(data.toString()));
  let settle!: (result: SandboxRunResult) => void;
  const completion = new Promise<SandboxRunResult>(resolve => { settle = resolve; });
  const finish = (code: number | null, error?: Error) => {
    if (finished) return;
    finished = true;
    activeProcesses--;
    clearTimeout(lifetime);
    if (prefix) append(prefix);
    if (error) append("\n" + error.message);
    listeners.clear();
    const timedOut = code === 124 || code === 137;
    settle({ ok: !stopped && !timedOut && code === 0, output: output.trim() || "(no output)",
      exitCode: code, timedOut, containerName });
  };
  // Fallback for a Docker transport that never reports the inner timeout.
  const lifetime = setTimeout(() => { void stop(); }, Math.max(1000, timeoutMs) + 5000);
  lifetime.unref();
  child.once("error", error => finish(null, error));
  child.once("close", code => finish(code));
  return {
    containerName, get output() { return output.trim() || "(no output)"; }, completion, stop,
    onOutput(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/**
 * Background execution for a manager built on an injected command runner.
 * The runner owns process lifetime, so this adapter only projects its eventual
 * result onto the streaming execution contract instead of spawning the real
 * container binary and silently discarding the injected runtime.
 */
export function startExecutorBackedBackgroundCommand(
  run: (cmd: string[], timeoutMs: number) => Promise<{ output: string; exitCode: number | null; timedOut: boolean }>,
  invocation: string[],
  containerName: string,
  timeoutMs: number,
): SandboxBackgroundExecution {
  let output = "";
  let stopped = false;
  let finished = false;
  const listeners = new Set<(chunk: string) => void>();
  let settle!: (result: SandboxRunResult) => void;
  const completion = new Promise<SandboxRunResult>(resolve => { settle = resolve; });
  const publish = (chunk: string) => {
    for (const listener of listeners) { try { listener(chunk.slice(-MAX_OUTPUT_CHARS)); } catch { /* observer */ } }
  };
  const finish = (result: SandboxRunResult) => {
    if (finished) return;
    finished = true;
    listeners.clear();
    settle(result);
  };
  void (async () => {
    try {
      const result = await run(invocation, timeoutMs);
      output = result.output;
      if (stopped) {
        finish({ ok: false, output: output.trim() || "(no output)", exitCode: result.exitCode, timedOut: false, containerName });
        return;
      }
      const bounded = output.slice(-MAX_OUTPUT_CHARS);
      if (bounded.trim()) publish(bounded);
      finish({
        ok: !result.timedOut && result.exitCode === 0,
        output: bounded.trim() || "(no output)",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        containerName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output = output ? `${output}\n${message}` : message;
      finish({ ok: false, output: output.slice(-MAX_OUTPUT_CHARS), exitCode: null, timedOut: false, containerName });
    }
  })();
  return {
    containerName,
    get output() { return output.slice(-MAX_OUTPUT_CHARS).trim() || "(no output)"; },
    completion,
    async stop() { stopped = true; },
    onOutput(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

function runCleanup(args: string[], launch: typeof spawn): Promise<void> {
  return new Promise(resolve => {
    const child = launch(args[0]!, args.slice(1), { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 5000);
    const done = () => { clearTimeout(timer); resolve(); };
    child.once("error", done);
    child.once("close", done);
  });
}
