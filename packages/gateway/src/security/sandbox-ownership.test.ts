import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager, type SandboxMountMode } from "./sandbox-manager.js";

describe("command sandbox bind-mount ownership", () => {
  let projectRoot: string;
  let calls: string[][];
  let manager: SandboxManager;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "sandbox-ownership-"));
    calls = [];
    vi.stubEnv("JAIT_SANDBOX_HOST_USER", "");
    vi.stubEnv("JAIT_SANDBOX_HOME", "/tmp");
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    vi.spyOn(process, "getuid").mockReturnValue(1234);
    vi.spyOn(process, "getgid").mockReturnValue(2345);
    manager = new SandboxManager(async (cmd) => {
      calls.push(cmd);
      return { output: "", exitCode: 0, timedOut: false };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  async function startBoth(mountMode?: SandboxMountMode) {
    await manager.runCommand({ command: "true", projectRoot, timeoutMs: 1000, mountMode });
    await manager.startCommandSandbox({ projectRoot, mountMode });
  }

  it.each([undefined, "read-write"] as const)("uses host uid/gid for %s mounts on both command paths", async (mode) => {
    await startBoth(mode);
    for (const cmd of calls) {
      expect(cmd.slice(cmd.indexOf("--user"), cmd.indexOf("--user") + 2)).toEqual(["--user", "1234:2345"]);
      expect(cmd).toContain("HOME=/tmp");
      expect(cmd).toContain(`${projectRoot}:/project`);
    }
  });

  it.each(["read-only", "none"] as const)("preserves %s isolation without a host user override", async (mode) => {
    await startBoth(mode);
    for (const cmd of calls) {
      expect(cmd).not.toContain("--user");
      if (mode === "read-only") expect(cmd).toContain(`${projectRoot}:/project:ro`);
      else expect(cmd).not.toContain("-v");
    }
  });

  it.each(["0", "false"])("honours the explicit legacy override %s", async (value) => {
    vi.stubEnv("JAIT_SANDBOX_HOST_USER", value);
    await startBoth();
    expect(calls.every((cmd) => !cmd.includes("--user"))).toBe(true);
  });

  it.each(["darwin", "win32"] as const)("does not map Linux ids on %s", async (platform) => {
    vi.spyOn(process, "platform", "get").mockReturnValue(platform);
    await startBoth();
    expect(calls.every((cmd) => !cmd.includes("--user"))).toBe(true);
  });

  it("preserves root gateways and supports a configured writable home", async () => {
    vi.spyOn(process, "getuid").mockReturnValue(0);
    await startBoth();
    expect(calls.every((cmd) => !cmd.includes("--user"))).toBe(true);
    calls.length = 0;
    vi.spyOn(process, "getuid").mockReturnValue(1234);
    vi.stubEnv("JAIT_SANDBOX_HOME", "/tmp/custom-home");
    await startBoth();
    expect(calls.every((cmd) => cmd.includes("HOME=/tmp/custom-home"))).toBe(true);
  });
});
