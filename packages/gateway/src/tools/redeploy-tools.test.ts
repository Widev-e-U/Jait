import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execSyncMock = vi.fn();
const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

class FakeChildProcess extends EventEmitter {
  pid = 4242;
  unref = vi.fn();
}

describe("redeploy-tools switchover guardrails", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    execSyncMock.mockReset();
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses to restart a systemd unit whose file is missing, leaving the current process running", async () => {
    const { systemdSwitchover } = await import("./redeploy-tools.js");
    execSyncMock.mockImplementation(() => {
      throw new Error("Unit jait-gateway.service could not be found.");
    });

    const result = await systemdSwitchover("0.1.649", "0.1.650", { port: 4000, shutdown: vi.fn() }, () => {});

    expect(result.ok).toBe(false);
    expect(result.message).toContain("jait daemon install");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("proceeds with systemd restart when the unit file is present", async () => {
    const { systemdSwitchover } = await import("./redeploy-tools.js");
    execSyncMock.mockReturnValue("");
    const restartChild = new FakeChildProcess();
    spawnMock.mockReturnValue(restartChild);

    const resultPromise = systemdSwitchover("0.1.649", "0.1.650", { port: 4000, shutdown: vi.fn() }, () => {});
    const result = await resultPromise;

    expect(result.ok).toBe(true);
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("systemctl --user cat"),
      expect.anything(),
    );
  });

  it("reports failure instead of killing the current process when the replacement crashes immediately", async () => {
    const { bareProcessSwitchover } = await import("./redeploy-tools.js");
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const shutdown = vi.fn().mockResolvedValue(undefined);

    const resultPromise = bareProcessSwitchover("0.1.649", "0.1.650", { port: 4000, shutdown }, () => {});
    // Simulate the replacement dying (e.g. ENOENT / crash) inside the grace window.
    child.emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.message).toContain("exited early");
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("shuts down the current process once the replacement survives the grace window", async () => {
    const { bareProcessSwitchover } = await import("./redeploy-tools.js");
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const shutdown = vi.fn().mockResolvedValue(undefined);

    const resultPromise = bareProcessSwitchover("0.1.649", "0.1.650", { port: 4000, shutdown }, () => {});
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await resultPromise;

    expect(result.ok).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
