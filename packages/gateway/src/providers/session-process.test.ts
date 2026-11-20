import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stopSessionProcess, stopSessionProcessAndWait } from "./session-process.js";

/** Whether a pid is still running. A zombie has exited, so it does not count. */
function isRunning(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return !/\) Z /.test(stat);
  } catch {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

/** The first line a process writes to stdout, read without waiting for the process to exit. */
function firstLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const newline = output.indexOf("\n");
      if (newline >= 0) resolve(output.slice(0, newline).trim());
    });
  });
}

describe.skipIf(process.platform === "win32")("stopSessionProcess on real processes", () => {
  it("ends a child the agent started, even after the agent's own process has exited", async () => {
    // The shell starts a long-lived child, prints its pid and exits, leaving that child running.
    // The child's output is detached, so the pipe closes when the shell exits and 'close' fires.
    const agent = spawn("sh", ["-c", "sleep 60 >/dev/null 2>&1 & echo $!; exit 0"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    agent.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    await once(agent, "close");
    const descendant = Number(output.trim());
    expect(Number.isInteger(descendant) && descendant > 0).toBe(true);
    expect(isRunning(descendant)).toBe(true);

    stopSessionProcess(agent);

    await expect.poll(() => isRunning(descendant), { timeout: 3_000, interval: 50 }).toBe(false);
  });

  it("does not throw when the agent's process group is already gone", async () => {
    const agent = spawn("sh", ["-c", "exit 0"], { detached: true, stdio: "ignore" });
    await once(agent, "close");

    expect(() => stopSessionProcess(agent)).not.toThrow();
  });

  it("settles only after the agent's descendants are gone, not when the signal is sent", async () => {
    const agent = spawn("sh", ["-c", "sleep 60 >/dev/null 2>&1 & echo $!; exit 0"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    agent.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    await once(agent, "close");
    const descendant = Number(output.trim());
    expect(isRunning(descendant)).toBe(true);

    await stopSessionProcessAndWait(agent);

    expect(isRunning(descendant)).toBe(false);
  });

  it("escalates to SIGKILL for a group that ignores SIGTERM, and settles only once it is gone", async () => {
    // The shell and the child it starts both ignore SIGTERM, so only the escalation can end them.
    const agent = spawn("sh", ["-c", 'trap "" TERM; sleep 60 >/dev/null 2>&1 & echo $!; wait'], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    const descendant = Number(await firstLine(agent));
    expect(isRunning(descendant)).toBe(true);

    await stopSessionProcessAndWait(agent, { killAfterMs: 200 });

    expect(isRunning(descendant)).toBe(false);
    agent.kill("SIGKILL");
  });
});
