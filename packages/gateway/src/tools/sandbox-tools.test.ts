import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SandboxManager } from "../security/sandbox-manager.js";
import {
  createLinuxDesktopSandboxStartTool,
  createLinuxDesktopSandboxStopTool,
  createWindowsSandboxStartTool,
  createWindowsSandboxStopTool,
} from "./sandbox-tools.js";

const testProject = join(tmpdir(), "jait-test-sandbox-tools");

const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};

/** Minimal fake manager that records calls and returns canned results. */
function fakeManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  return {
    startWindowsSandbox: async () => ({
      containerName: "jait-windows-sb-test",
      browserId: "jait-windows-sb-test",
      rdpPort: 3389,
      webViewerPort: 8006,
      rdpUrl: "rdp://127.0.0.1:3389",
      webViewerUrl: "http://127.0.0.1:8006/",
      status: "starting",
      version: "11",
      storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
      sshPort: 2222,
      sshUsername: "Docker",
      sshPassword: "admin",
    }),
    stopWindowsSandbox: async () => {},
    startLinuxDesktopSandbox: async () => ({
      containerName: "jait-linux-desktop-sb-test",
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
      vncPort: 5900,
      novncPort: 6080,
      cdpUrl: "http://127.0.0.1:9223",
    }),
    stopLinuxDesktopSandbox: async () => {},
    ...overrides,
  } as unknown as SandboxManager;
}

describe("windows.sandbox.start", () => {
  it("exposes the expected schema and calls startWindowsSandbox with mapped options", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const tool = createWindowsSandboxStartTool(fakeManager({
      startWindowsSandbox: async (options) => {
        calls.push(options as unknown as Record<string, unknown>);
        return {
          containerName: "jait-windows-sb-test",
          browserId: "jait-windows-sb-test",
          rdpPort: 3390,
          webViewerPort: 8007,
          rdpUrl: "rdp://127.0.0.1:3390",
          webViewerUrl: "http://127.0.0.1:8007/",
          status: "running",
          version: "10",
          storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
          sshPort: 2223,
          sshUsername: "Docker",
          sshPassword: "admin",
        };
      },
    }));

    expect(tool.name).toBe("windows.sandbox.start");
    expect(tool.parameters.properties).toHaveProperty("ramSize");
    expect(tool.parameters.properties).toHaveProperty("cpuCores");
    expect(tool.parameters.properties).toHaveProperty("diskSize");
    expect(tool.parameters.properties).toHaveProperty("windowsVersion");

    const result = await tool.execute(
      {
        ramSize: "8G",
        cpuCores: 8,
        diskSize: "128G",
        windowsVersion: "10",
        rdpPort: 3390,
        webViewerPort: 8007,
        waitForWebViewer: true,
      },
      baseContext,
    );

    expect(calls).toEqual([
      {
        ramSize: "8G",
        cpuCores: 8,
        diskSize: "128G",
        version: "10",
        rdpPort: 3390,
        webViewerPort: 8007,
        sshPort: undefined,
        waitForWebViewer: true,
        username: undefined,
        password: undefined,
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      rdpUrl: "rdp://127.0.0.1:3390",
      webViewerUrl: "http://127.0.0.1:8007/",
      status: "running",
      version: "10",
    });
  });

  it("reports a starting sandbox with an install hint", async () => {
    const tool = createWindowsSandboxStartTool(fakeManager());
    const result = await tool.execute({}, baseContext);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("starting");
    expect(result.message).toContain("10-30 minutes");
  });
});

describe("windows.sandbox.stop", () => {
  it("calls stopWindowsSandbox with the container name and removeStorage", async () => {
    const calls: Array<{ name: string; options: unknown }> = [];
    const tool = createWindowsSandboxStopTool(fakeManager({
      stopWindowsSandbox: async (name, options) => {
        calls.push({ name, options });
      },
    }));

    expect(tool.name).toBe("windows.sandbox.stop");
    expect(tool.parameters.required).toEqual(["containerName"]);

    const result = await tool.execute(
      { containerName: "jait-windows-sb-test", removeStorage: true },
      baseContext,
    );

    expect(calls).toEqual([
      { name: "jait-windows-sb-test", options: { removeStorage: true } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ containerName: "jait-windows-sb-test" });
  });
});

describe("linux.desktop.sandbox.start", () => {
  it("exposes the expected schema and calls startLinuxDesktopSandbox with mapped options", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const tool = createLinuxDesktopSandboxStartTool(fakeManager({
      startLinuxDesktopSandbox: async (options) => {
        calls.push(options as unknown as Record<string, unknown>);
        return {
          containerName: "jait-linux-desktop-sb-test",
          novncUrl: "http://127.0.0.1:6081/vnc_lite.html",
          vncPort: 5901,
          novncPort: 6081,
          cdpUrl: "http://127.0.0.1:9224",
        };
      },
    }));

    expect(tool.name).toBe("linux.desktop.sandbox.start");
    expect(tool.parameters.properties).toHaveProperty("screenRes");
    expect(tool.parameters.properties).toHaveProperty("mountMode");
    expect(tool.parameters.properties).toHaveProperty("networkEnabled");

    const result = await tool.execute(
      {
        screenRes: "1280x720x24",
        mountMode: "read-write",
        networkEnabled: false,
        novncPort: 6081,
        vncPort: 5901,
        cdpPort: 9224,
        waitForCdp: false,
        hostGateway: true,
      },
      baseContext,
    );

    expect(calls).toEqual([
      {
        projectRoot: testProject,
        screenRes: "1280x720x24",
        mountMode: "read-write",
        networkEnabled: false,
        novncPort: 6081,
        vncPort: 5901,
        cdpPort: 9224,
        waitForCdp: false,
        hostGateway: true,
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      novncUrl: "http://127.0.0.1:6081/vnc_lite.html",
      cdpUrl: "http://127.0.0.1:9224",
    });
  });

  it("defaults mountMode to read-only", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const tool = createLinuxDesktopSandboxStartTool(fakeManager({
      startLinuxDesktopSandbox: async (options) => {
        calls.push(options as unknown as Record<string, unknown>);
        return {
          containerName: "jait-linux-desktop-sb-test",
          novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
          vncPort: 5900,
          novncPort: 6080,
        };
      },
    }));

    await tool.execute({}, baseContext);

    expect(calls[0]).toMatchObject({ mountMode: "read-only" });
  });
});

describe("linux.desktop.sandbox.stop", () => {
  it("calls stopLinuxDesktopSandbox with the container name", async () => {
    const calls: string[] = [];
    const tool = createLinuxDesktopSandboxStopTool(fakeManager({
      stopLinuxDesktopSandbox: async (name) => {
        calls.push(name);
      },
    }));

    expect(tool.name).toBe("linux.desktop.sandbox.stop");
    expect(tool.parameters.required).toEqual(["containerName"]);

    const result = await tool.execute(
      { containerName: "jait-linux-desktop-sb-test" },
      baseContext,
    );

    expect(calls).toEqual(["jait-linux-desktop-sb-test"]);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ containerName: "jait-linux-desktop-sb-test" });
  });
});
