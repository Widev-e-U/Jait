import type { ChildProcess } from "node:child_process";
import { killChildTree } from "./provider-auth.js";

/** ACP sessions run in their own POSIX process group, separate from the gateway. */
export function stopSessionProcess(child: ChildProcess): void {
  if (process.platform === "win32" || child.pid === undefined) {
    killChildTree(child);
    return;
  }
  const group = -child.pid;
  const signal = (name: NodeJS.Signals): boolean => {
    try { process.kill(group, name); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") console.warn("[cli] Process group cleanup failed", error);
      return false;
    }
  };
  if (!signal("SIGTERM")) return;
  // Descendants can survive the adapter's exit; retain the bounded escalation.
  setTimeout(() => signal("SIGKILL"), 5_000).unref();
}

/** Delay between SIGTERM and SIGKILL for a session's process group. */
const KILL_AFTER_MS = 5_000;

/**
 * Like stopSessionProcess, but the promise settles only once the agent's process
 * group is gone: the agent and every descendant have exited. A group that ignores
 * SIGTERM is escalated to SIGKILL after `killAfterMs`. The wait has no timeout of
 * its own, so a group that cannot be killed holds its caller, as a stopped command
 * holds its worker until its terminal reports an exit. It never rejects.
 */
export function stopSessionProcessAndWait(child: ChildProcess, options: { killAfterMs?: number } = {}): Promise<void> {
  if (child.pid === undefined) {
    stopSessionProcess(child);
    return Promise.resolve();
  }
  if (process.platform === "win32") {
    killChildTree(child);
    return new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
  }
  const group = -child.pid;
  const killAfterMs = options.killAfterMs ?? KILL_AFTER_MS;
  const send = (name: NodeJS.Signals): boolean => {
    try { process.kill(group, name); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") console.warn("[cli] Process group cleanup failed", error);
      return false;
    }
  };
  // Signal 0 succeeds for a zombie as well, so a group counts as gone only once it is reaped.
  const groupAlive = (): boolean => {
    try { process.kill(group, 0); return true; }
    catch { return false; }
  };
  return new Promise<void>((resolve) => {
    if (!send("SIGTERM")) {
      resolve();
      return;
    }
    const startedAt = Date.now();
    let escalated = false;
    const poll = (): void => {
      if (!groupAlive()) {
        resolve();
        return;
      }
      if (!escalated && Date.now() - startedAt >= killAfterMs) {
        escalated = true;
        send("SIGKILL");
      }
      setTimeout(poll, 50);
    };
    setTimeout(poll, 50);
  });
}
