import { describe, it, expect, vi } from "vitest";
import { createTerminalRunTool } from "./tools/terminal-tools.js";

function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    workspaceRoot: process.cwd(),
    requestedBy: "test",
  };
}

describe("terminal.run tool status reporting", () => {
  it("returns ok=true when exit code is zero", async () => {
    const execute = vi.fn().mockResolvedValue({
      output: "done",
      exitCode: 0,
      timedOut: false,
    });
    const surface = { state: "running", execute };
    const registry = {
      getSurface: vi.fn().mockReturnValue(surface),
      startSurface: vi.fn(),
    };

    const tool = createTerminalRunTool(registry as any);
    const result = await tool.execute({ command: "echo hi" }, makeContext());

    expect(result.ok).toBe(true);
    expect(result.message).toContain("exit code 0");
    expect((result.data as any).exitCode).toBe(0);
    expect((result.data as any).timedOut).toBe(false);
  });

  it("returns ok=false when exit code is non-zero", async () => {
    const execute = vi.fn().mockResolvedValue({
      output: "error",
      exitCode: 1,
      timedOut: false,
    });
    const surface = { state: "running", execute };
    const registry = {
      getSurface: vi.fn().mockReturnValue(surface),
      startSurface: vi.fn(),
    };

    const tool = createTerminalRunTool(registry as any);
    const result = await tool.execute({ command: "bad-command" }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("exit code 1");
    expect((result.data as any).output).toContain("error");
  });

  it("returns ok=false when command times out", async () => {
    const execute = vi.fn().mockResolvedValue({
      output: "[timeout after 1000ms]",
      exitCode: null,
      timedOut: true,
    });
    const surface = { state: "running", execute };
    const registry = {
      getSurface: vi.fn().mockReturnValue(surface),
      startSurface: vi.fn(),
    };

    const tool = createTerminalRunTool(registry as any);
    const result = await tool.execute({ command: "sleep 20", timeout: 1000 }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("timed out");
    expect((result.data as any).timedOut).toBe(true);
  });
});

