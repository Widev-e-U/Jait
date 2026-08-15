/**
 * os-control resolver tests: maps discovered sandboxes to drivers and reports
 * the real published ports (including the Windows SSH port).
 */
import { describe, expect, it } from "vitest";
import type { SandboxManager } from "../security/sandbox-manager.js";
import { createOsControlResolver } from "./resolver.js";
import { WindowsOsControlDriver } from "./windows-driver.js";

const fakeSandboxManager = (infos: unknown[]) =>
  ({
    listRunningOsSandboxes: async () => infos,
  }) as unknown as SandboxManager;

describe("createOsControlResolver.listSandboxes", () => {
  it("reports the real published ports for a Windows VM sandbox", async () => {
    const resolver = createOsControlResolver(
      fakeSandboxManager([
        {
          containerName: "jait-windows-sb-abc",
          type: "windows",
          running: true,
          rdpPort: 13389,
          webViewerPort: 18006,
          sshPort: 42222,
        },
      ]),
      { username: "Docker", password: "admin" },
    );

    const connections = await resolver.listSandboxes();
    expect(connections).toEqual([
      {
        containerName: "jait-windows-sb-abc",
        type: "windows",
        rdpPort: 13389,
        webViewerPort: 18006,
        sshPort: 42222,
      },
    ]);
  });

  it("reports display + VNC/noVNC ports for a Linux desktop sandbox", async () => {
    const resolver = createOsControlResolver(
      fakeSandboxManager([
        {
          containerName: "jait-linux-desktop-sb-def",
          type: "linux-desktop",
          running: true,
          vncPort: 15900,
          novncPort: 16080,
        },
      ]),
    );

    const connections = await resolver.listSandboxes();
    expect(connections).toEqual([
      {
        containerName: "jait-linux-desktop-sb-def",
        type: "linux-desktop",
        display: ":99",
        vncPort: 15900,
        novncPort: 16080,
      },
    ]);
  });
});

describe("createOsControlResolver.resolve", () => {
  it("resolves a Windows sandbox to a WindowsOsControlDriver", async () => {
    const resolver = createOsControlResolver(
      fakeSandboxManager([
        { containerName: "jait-windows-sb-abc", type: "windows", running: true },
      ]),
      { username: "Docker", password: "admin" },
    );

    const binding = await resolver.resolve("jait-windows-sb-abc");
    expect(binding.type).toBe("windows");
    expect(binding.containerName).toBe("jait-windows-sb-abc");
    expect(binding.driver).toBeInstanceOf(WindowsOsControlDriver);
    expect(binding.driver.osType).toBe("windows");
  });

  it("throws a clear error when no sandbox is running", async () => {
    const resolver = createOsControlResolver(fakeSandboxManager([]));
    await expect(resolver.resolve()).rejects.toThrow(/No OS sandbox is running/);
  });
});
