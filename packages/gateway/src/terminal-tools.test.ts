import { describe, expect, it } from "vitest";
import { createTerminalRunTool, detectInteractivePrompt } from "./tools/terminal-tools.js";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { SandboxManager } from "./security/sandbox-manager.js";

function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    workspaceRoot: process.cwd(),
    requestedBy: "test",
  };
}

describe("terminal.run tool status reporting", () => {
  it("returns ok=true when sandbox exit code is zero", async () => {
    const sandbox = new SandboxManager(async () => ({ output: "done", exitCode: 0, timedOut: false }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "echo hi", sandbox: true }, makeContext());

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Sandbox command completed");
    expect((result.data as any).exitCode).toBe(0);
    expect((result.data as any).timedOut).toBe(false);
  });

  it("returns ok=false when sandbox exit code is non-zero", async () => {
    const sandbox = new SandboxManager(async () => ({ output: "error", exitCode: 1, timedOut: false }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "bad-command", sandbox: true }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("exit code 1");
    expect((result.data as any).output).toContain("error");
  });

  it("returns ok=false when sandbox command times out", async () => {
    const sandbox = new SandboxManager(async () => ({
      output: "[timeout after 1000ms]",
      exitCode: null,
      timedOut: true,
    }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "sleep 20", timeout: 1000, sandbox: true }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("timed out");
    expect((result.data as any).timedOut).toBe(true);
  });
});


describe("interactive prompt detection", () => {
  it("detects sudo password prompts", () => {
    expect(detectInteractivePrompt("[sudo] password for alice:")).toBe(true);
  });

  it("does not flag regular command output", () => {
    expect(detectInteractivePrompt("build finished successfully")).toBe(false);
  });
});
