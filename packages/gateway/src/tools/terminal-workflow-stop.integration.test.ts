import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TerminalSurface } from "../surfaces/terminal.js";
import { executeInTerminal } from "./terminal-tools.js";

// Runs a real PTY, so it is opt-in: set JAIT_PTY_TESTS=1 on a POSIX host.
const enabled = process.platform !== "win32" && process.env.JAIT_PTY_TESTS === "1";

function childAlive(duration: string): boolean {
  try {
    execFileSync("pgrep", ["-f", `sleep ${duration}`], { stdio: "ignore" });
    return true;
  } catch {
    return false; // pgrep exits 1 when nothing matches
  }
}

describe.skipIf(!enabled)("workflow command stop on a real terminal", () => {
  it("stops a child that ignores Ctrl+C, and settles only after the child is gone", async () => {
    // The shell ignores SIGINT, and so does its child, so only the hard stop can end it.
    const duration = "7919";
    const surface = new TerminalSurface(`pty-stop-${randomUUID()}`, { shell: "/bin/bash" });
    await surface.start({
      sessionId: "pty-stop-session",
      userId: "pty-stop-owner",
      projectRoot: "/tmp",
    } as Parameters<TerminalSurface["start"]>[0]);
    // Wait for the first prompt, as the terminal tools do, so its shell markers are not taken as this command's.
    await surface.waitForPrompt();
    const controller = new AbortController();
    const running = executeInTerminal(
      surface as unknown as Parameters<typeof executeInTerminal>[0],
      `trap '' INT; sleep ${duration}`,
      60_000,
      "/bin/bash",
      "/tmp",
      undefined,
      controller.signal,
      undefined,
      undefined,
      { graceMs: 300, hardStop: async () => { await surface.stop(); return true; } },
    );

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(childAlive(duration)).toBe(true);

    controller.abort();
    await running;
    expect(childAlive(duration)).toBe(false);
  }, 20_000);

  it("reports the command's own exit code when it finishes, and never a prompt-inferred success", async () => {
    const surface = new TerminalSurface(`pty-exit-${randomUUID()}`, { shell: "/bin/bash" });
    await surface.start({
      sessionId: "pty-exit-session",
      userId: "pty-stop-owner",
      projectRoot: "/tmp",
    } as Parameters<TerminalSurface["start"]>[0]);
    // Wait for the first prompt, as the terminal tools do, so its shell markers are not taken as this command's.
    await surface.waitForPrompt();
    const outcome = await executeInTerminal(
      surface as unknown as Parameters<typeof executeInTerminal>[0],
      "sleep 1; false",
      60_000,
      "/bin/bash",
      "/tmp",
      undefined,
      undefined,
      undefined,
      undefined,
      { graceMs: 300, hardStop: async () => { await surface.stop(); return true; } },
    );
    expect(outcome).toMatchObject({ exitCode: 1, timedOut: false });
    await surface.stop();
  }, 20_000);
});
