import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SandboxManager } from "./security/sandbox-manager.js";
import { createTerminalRunTool } from "./tools/terminal-tools.js";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { createBrowserSandboxStartTool } from "./tools/browser-tools.js";

const testProject = join(tmpdir(), "jait-test-sandbox");

const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
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
      projectRoot: testProject,
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
    expect(captured.join(" ")).toContain(":/project:ro");
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
      novncUrl: "http://127.0.0.1:6600/vnc_lite.html",
      novncPort: 6600,
      vncPort: 6000,
    });
  });

  it("starts sandbox browser with CDP and host gateway when requested", async () => {
    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return {
        output: "container-id",
        exitCode: 0,
        timedOut: false,
      };
    });

    const result = await manager.startBrowserSandbox({
      projectRoot: testProject,
      mountMode: "none",
      networkEnabled: true,
      hostGateway: true,
      novncPort: 6601,
      vncPort: 6001,
      cdpPort: 9223,
      waitForCdp: false,
    });

    expect(result).toMatchObject({
      novncUrl: "http://127.0.0.1:6601/vnc_lite.html",
      novncPort: 6601,
      vncPort: 6001,
      cdpUrl: "http://127.0.0.1:9223",
    });
    const imageInspectCmd = commands.find((c) => c.join(" ").includes("image inspect"));
    expect(imageInspectCmd?.join(" ")).toMatch(/(docker|podman) image inspect jait\/sandbox-browser:app-window-v1/);
    const runCmd = commands.find((c) => c.join(" ").includes("--add-host"));
    expect(runCmd?.join(" ")).toContain("--add-host host.docker.internal:");
    expect(runCmd?.join(" ")).toContain("-p 9223:9223");
    expect(runCmd?.join(" ")).not.toContain("--network none");
  });

  it("reaps conflicting stale browser sandboxes and retries startup", async () => {
    const commands: string[][] = [];
    let runAttempts = 0;
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      const joined = cmd.join(" ");
      if (joined.includes(" ps ") && joined.includes("{{.Ports}}")) {
        return {
          output: "jait-browser-sb-old\t0.0.0.0:6080->6080/tcp, 0.0.0.0:5900->5900/tcp",
          exitCode: 0,
          timedOut: false,
        };
      }
      if (joined.includes(" ps ") && joined.includes("{{.Names}}")) {
        return { output: "", exitCode: 0, timedOut: false };
      }
      if (joined.includes("image inspect")) {
        return { output: "[]", exitCode: 0, timedOut: false };
      }
      if (cmd.includes("run")) {
        runAttempts += 1;
        if (runAttempts === 1) {
          return {
            output: "docker: Error response from daemon: Bind for 0.0.0.0:6080 failed: port is already allocated",
            exitCode: 125,
            timedOut: false,
          };
        }
      }
      return { output: "container-id", exitCode: 0, timedOut: false };
    });

    const result = await manager.startBrowserSandbox({
      projectRoot: testProject,
      novncPort: 6080,
      vncPort: 5900,
    });

    expect(result).toMatchObject({
      novncPort: 6080,
      vncPort: 5900,
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
    });
    expect(commands.some((cmd) => cmd.includes("ps") && cmd.includes("--format"))).toBe(true);
    expect(commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-old"))).toBe(true);
  });

  it("refuses to start sandbox browsers when the container runtime health check times out", async () => {
    const manager = new SandboxManager(async (cmd) => {
      if (cmd.includes("info")) {
        return { output: "", exitCode: null, timedOut: true };
      }
      return { output: "unexpected", exitCode: 0, timedOut: false };
    });

    await expect(manager.startBrowserSandbox({
      projectRoot: testProject,
      novncPort: 6082,
      vncPort: 5902,
    })).rejects.toThrow("container runtime health check failed (timed out)");
  });

  it("refuses to start sandbox browsers when the active sandbox limit is reached", async () => {
    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return { output: "jait-browser-sb-active", exitCode: 0, timedOut: false };
      }
      return { output: "ok", exitCode: 0, timedOut: false };
    });

    await expect(manager.startBrowserSandbox({
      projectRoot: testProject,
      novncPort: 6083,
      vncPort: 5903,
    })).rejects.toThrow("Browser sandbox limit reached (1 active, max 1)");
    expect(commands.some((cmd) => cmd.join(" ").includes("image inspect"))).toBe(false);
  });

  it("cleans stale browser sandbox containers while preserving active ones", async () => {
    const commands: string[][] = [];
    const now = Date.now();
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return {
          output: [
            `jait-browser-sb-old\tignored\tjait.kind=browser-sandbox,jait.createdAt=${now - 2 * 60 * 60 * 1000}`,
            `jait-browser-sb-active\tignored\tjait.kind=browser-sandbox,jait.createdAt=${now - 2 * 60 * 60 * 1000}`,
            `jait-browser-sb-fresh\tignored\tjait.kind=browser-sandbox,jait.createdAt=${now}`,
          ].join("\n"),
          exitCode: 0,
          timedOut: false,
        };
      }
      return { output: "removed", exitCode: 0, timedOut: false };
    });

    const stopped = await manager.cleanupBrowserSandboxes({
      maxAgeMs: 60 * 60 * 1000,
      excludeNames: ["jait-browser-sb-active"],
    });

    expect(stopped).toEqual(["jait-browser-sb-old"]);
    expect(commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-old"))).toBe(true);
    expect(commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-active"))).toBe(false);
    expect(commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-fresh"))).toBe(false);
  });

  it("cleans legacy browser sandboxes using Docker created timestamps", async () => {
    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return {
          output: "jait-browser-sb-legacy\t2026-04-29 20:00:10 +0000 UTC\t",
          exitCode: 0,
          timedOut: false,
        };
      }
      return { output: "removed", exitCode: 0, timedOut: false };
    });

    const stopped = await manager.cleanupBrowserSandboxes({ maxAgeMs: 60 * 60 * 1000 });

    expect(stopped).toEqual(["jait-browser-sb-legacy"]);
    expect(commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-legacy"))).toBe(true);
  });
});
