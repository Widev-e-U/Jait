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
