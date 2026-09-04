/**
 * Sandbox manager tests focused on the Windows VM sandbox SSH wiring:
 *  - startWindowsSandbox publishes the VM SSH port (container 22) and
 *    provisions SSH_USERNAME/SSH_PASSWORD matching the VM account.
 *  - listRunningOsSandboxes reports the real published ports so the os.*
 *    tools / os.sandbox list can connect to the correct endpoints.
 */
import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager } from "./sandbox-manager.js";

// Windows sandbox VM disks are created under /tmp/jait-windows-sandbox by
// default. On shared CI runners that directory may exist root-owned, which
// would make mkdirSync fail with EACCES, so point the storage root at a
// per-run temp directory instead.
beforeAll(() => {
  process.env["JAIT_WINDOWS_SANDBOX_STORAGE"] = mkdtempSync(join(tmpdir(), "jait-windows-sandbox-test-"));
});

// The Windows sandbox start path requires /dev/kvm. Make it appear present so
// these tests exercise the docker command building, not the host capability.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn((p: Parameters<typeof existsSync>[0]) => {
      if (p === "/dev/kvm") return true;
      return actual.existsSync(p);
    }),
  };
});

/** Fake docker runtime: records every invocation, answers health/list/inspect. */
function fakeRuntime() {
  const calls: string[][] = [];
  const runProcess = async (cmd: string[], _timeoutMs: number) => {
    calls.push(cmd);
    const joined = cmd.join(" ");
    if (joined.includes("image inspect")) return { output: "{}", exitCode: 0, timedOut: false };
    if (joined.includes("docker ps")) return { output: "", exitCode: 0, timedOut: false };
    if (joined.includes("docker run")) return { output: "container-id", exitCode: 0, timedOut: false };
    if (joined.includes("docker rm")) return { output: "", exitCode: 0, timedOut: false };
    if (joined.includes("machine ls")) return { output: "", exitCode: 0, timedOut: false };
    // docker info health check
    return { output: "27.0.0", exitCode: 0, timedOut: false };
  };
  return { calls, runProcess };
}

describe("SandboxManager.startWindowsSandbox SSH wiring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes the VM SSH port and provisions SSH_USERNAME/SSH_PASSWORD matching the account", async () => {
    const { calls, runProcess } = fakeRuntime();
    const manager = new SandboxManager(runProcess);

    const result = await manager.startWindowsSandbox({
      username: "Docker",
      password: "admin",
    });

    expect(result.sshPort).toBeTypeOf("number");
    expect(result.sshUsername).toBe("Docker");
    expect(result.sshPassword).toBe("admin");

    const runCall = calls.find((c) => c.join(" ").includes("docker run"))!;
    const sshPair = runCall.findIndex((c, i) => c === "-p" && (runCall[i + 1] ?? "").endsWith(":22"));
    expect(sshPair).toBeGreaterThanOrEqual(0);
    expect(Number(runCall[sshPair + 1]!.split(":")[0])).toBe(result.sshPort);
    expect(runCall).toContain("SSH_USERNAME=Docker");
    expect(runCall).toContain("SSH_PASSWORD=admin");
  });

  it("aligns the SSH credentials with a custom account when provided", async () => {
    const { calls, runProcess } = fakeRuntime();
    const manager = new SandboxManager(runProcess);

    const result = await manager.startWindowsSandbox({
      username: "jakob",
      password: "pw-123",
    });

    expect(result.sshUsername).toBe("jakob");
    expect(result.sshPassword).toBe("pw-123");
    const runCall = calls.find((c) => c.join(" ").includes("docker run"))!;
    expect(runCall).toContain("USERNAME=jakob");
    expect(runCall).toContain("PASSWORD=pw-123");
    expect(runCall).toContain("SSH_USERNAME=jakob");
    expect(runCall).toContain("SSH_PASSWORD=pw-123");
  });

  it("honours explicit sshPort / sshUsername / sshPassword overrides", async () => {
    const { calls, runProcess } = fakeRuntime();
    const manager = new SandboxManager(runProcess);

    const result = await manager.startWindowsSandbox({
      sshPort: 4321,
      sshUsername: "svc",
      sshPassword: "svc-pass",
    });

    expect(result.sshPort).toBe(4321);
    expect(result.sshUsername).toBe("svc");
    expect(result.sshPassword).toBe("svc-pass");
    const runCall = calls.find((c) => c.join(" ").includes("docker run"))!;
    const sshPair = runCall.findIndex((c, i) => c === "-p" && (runCall[i + 1] ?? "").endsWith(":22"));
    expect(sshPair).toBeGreaterThanOrEqual(0);
    expect(Number(runCall[sshPair + 1]!.split(":")[0])).toBe(4321);
  });
});

describe("SandboxManager.listRunningOsSandboxes port discovery", () => {
  it("parses the published ports for running Linux desktop and Windows sandboxes", async () => {
    const runProcess = async (cmd: string[]) => {
      if (cmd.join(" ").includes("docker ps")) {
        return {
          output: [
            "jait-windows-sb-abc\tjait/windows-sandbox:latest\t0.0.0.0:13389->3389/tcp, 0.0.0.0:18006->8006/tcp, 0.0.0.0:2222->22/tcp",
            "jait-linux-desktop-sb-def\tjait/sandbox-linux-desktop:latest\t0.0.0.0:15900->5900/tcp, 0.0.0.0:16080->6080/tcp, 0.0.0.0:19223->9223/tcp",
            "unrelated\tfoo:latest\t0.0.0.0:80->80/tcp",
          ].join("\n"),
          exitCode: 0,
          timedOut: false,
        };
      }
      return { output: "", exitCode: 0, timedOut: false };
    };

    const manager = new SandboxManager(runProcess as never);
    const infos = await manager.listRunningOsSandboxes();

    expect(infos).toEqual([
      {
        containerName: "jait-windows-sb-abc",
        type: "windows",
        running: true,
        rdpPort: 13389,
        webViewerPort: 18006,
        sshPort: 2222,
      },
      {
        containerName: "jait-linux-desktop-sb-def",
        type: "linux-desktop",
        running: true,
        vncPort: 15900,
        novncPort: 16080,
      },
    ]);
  });

  it("returns an empty list when docker ps fails", async () => {
    const runProcess = async () => ({ output: "boom", exitCode: 1, timedOut: false });
    const manager = new SandboxManager(runProcess as never);
    const infos = await manager.listRunningOsSandboxes();
    expect(infos).toEqual([]);
  });
});
