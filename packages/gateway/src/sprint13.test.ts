import { describe, expect, it } from "vitest";
import { SandboxManager } from "./security/sandbox-manager.js";
import { createTerminalRunTool } from "./tools/terminal-tools.js";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { createBrowserSandboxStartTool } from "./tools/browser-tools.js";

const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  workspaceRoot: "/workspace/Jait",
  requestedBy: "test",
};

describe("Sprint 13 — Docker Sandboxing", () => {
  it("runs sandboxed terminal command when sandbox=true", async () => {
    const manager = new SandboxManager(async () => ({
      output: "inside-container",
      exitCode: 0,
      timedOut: false,
    }));

    const tool = createTerminalRunTool(new SurfaceRegistry(), manager);
    const result = await tool.execute(
      { command: "pwd", sandbox: true, timeout: 3000 },
      baseContext,
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      sandbox: true,
      output: "inside-container",
      hostUnaffected: true,
    });
  });

  it("applies mount/network/resource limits and timeout handling", async () => {
    let captured: string[] = [];
    const manager = new SandboxManager(async (cmd, _timeoutMs) => {
      captured = cmd;
      return {
        output: "killed",
        exitCode: null,
        timedOut: true,
      };
    });

    const result = await manager.runCommand({
      command: "sleep 99",
      workspaceRoot: "/workspace/Jait",
      timeoutMs: 1000,
      mountMode: "read-only",
      networkEnabled: false,
      memoryLimitMb: 128,
      cpuLimit: "0.5",
    });

    expect(result.timedOut).toBe(true);
    expect(captured.join(" ")).toContain("--network none");
    expect(captured.join(" ")).toContain("--memory 128m");
    expect(captured.join(" ")).toContain("--cpus 0.5");
    expect(captured.join(" ")).toContain(":/workspace:ro");
  });

  it("starts sandbox browser and returns noVNC URL", async () => {
    const manager = new SandboxManager(async () => ({
      output: "container-id",
      exitCode: 0,
      timedOut: false,
    }));

    const tool = createBrowserSandboxStartTool(manager);
    const result = await tool.execute({ novncPort: 6600, vncPort: 6000 }, baseContext);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      novncUrl: "http://127.0.0.1:6600/vnc.html",
      novncPort: 6600,
      vncPort: 6000,
    });
  });
});
