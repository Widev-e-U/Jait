import { describe, it, expect, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { commandSandboxOwner, commandSandboxOwnerAlive } from "./agent-sandbox-owner.js";
import { SandboxManager } from "./sandbox-manager.js";
import { JaitProvider } from "../providers/jait-provider.js";

const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });

describe("agent sandbox cleanup", () => {
  it("recognizes the live owner and retains malformed owner metadata", () => {
    expect(commandSandboxOwnerAlive(commandSandboxOwner())).toBe(true);
    expect(commandSandboxOwnerAlive("unknown")).toBe(true);
    expect(commandSandboxOwnerAlive("-1::")).toBe(true);
  });
  it("labels containers with gateway and session ownership", async () => {
    const runtime = vi.fn(async (_cmd: string[], _timeout: number) => ok("id"));
    const manager = new SandboxManager(runtime);
    await manager.startCommandSandbox({ projectRoot: fileURLToPath(new URL("../../../../", import.meta.url)), sessionId: "session", threadId: "thread" });
    const cmd = runtime.mock.calls[0]![0] as string[];
    expect(cmd).toContain("dev.jait.kind=agent");
    expect(cmd).toContain("dev.jait.session=session");
    expect(cmd).toContain("dev.jait.thread=thread");
    expect(cmd.some(arg => arg.startsWith("dev.jait.gateway="))).toBe(true);
    expect(cmd.some(arg => arg.startsWith("dev.jait.owner="))).toBe(true);
  });

  it("recovers only same-gateway dead owners and retains busy or unknown containers", async () => {
    const runtime = vi.fn(async (cmd: string[]) => {
      if (cmd[1] === "ps") return ok([
        { name: "jait-agent-sb-dead", owner: "dead" },
        { name: "jait-agent-sb-live", owner: "live" },
        { name: "jait-agent-sb-busy", owner: "dead" },
        { name: "jait-agent-sb-legacy", owner: "" },
        { name: "database", owner: "dead" },
      ].map(row => JSON.stringify(row)).join("\n"));
      if (cmd[1] === "top") return ok(cmd[2] === "jait-agent-sb-busy" ? "PID COMMAND\n123 tail -f /dev/null\n124 node server.js" : "PID COMMAND\n123 tail -f /dev/null");
      return ok();
    });
    const manager = new SandboxManager(runtime);
    expect(await manager.cleanupOrphanedCommandSandboxes(owner => owner === "live")).toEqual(["jait-agent-sb-dead"]);
    const list = runtime.mock.calls.find(([cmd]) => cmd[1] === "ps")![0];
    expect(list.some(arg => arg.startsWith("label=dev.jait.gateway="))).toBe(true);
    expect(runtime.mock.calls.filter(([cmd]) => cmd[1] === "rm").map(([cmd]) => cmd.at(-1))).toEqual(["jait-agent-sb-dead"]);
  });

  it("fails closed when Docker process inspection fails", async () => {
    const manager = new SandboxManager(async () => ({ output: "unavailable", exitCode: 1, timedOut: false }));
    expect(await manager.isCommandSandboxIdle("jait-agent-sb-test")).toBe(false);
  });

  function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

  it("expires idle sandboxes and recreates them without losing the session", async () => {
    const { provider, manager, state } = fixture();
    await provider.reapIdleSandboxes(100, 101);
    expect(manager.stopContainer).toHaveBeenCalledWith("jait-agent-sb-old");
    expect((provider as any).sessions.has("session")).toBe(true);
    expect(state.sandboxContainerName).toBeUndefined();
    expect(await (provider as any).ensureThreadSandbox(state)).toBe("jait-agent-sb-new");
    expect(manager.startCommandSandbox).toHaveBeenCalledOnce();
  });

  it("protects active turns and background work", async () => {
    const { provider, manager, state } = fixture();
    (state as any).currentTurn = Promise.resolve();
    await provider.reapIdleSandboxes(100, 101);
    expect(manager.isCommandSandboxIdle).not.toHaveBeenCalled();
    (state as any).currentTurn = undefined;
    manager.isCommandSandboxIdle.mockResolvedValue(false);
    await provider.reapIdleSandboxes(100, 101);
    expect(manager.stopContainer).not.toHaveBeenCalled();
  });

  it("rechecks activity after asynchronous process inspection", async () => {
    const { provider, manager, state } = fixture();
    manager.isCommandSandboxIdle.mockImplementation(async () => { (state as any).currentTurn = Promise.resolve(); return true; });
    await provider.reapIdleSandboxes(100, 101);
    expect(manager.stopContainer).not.toHaveBeenCalled();
  });

  it("does not forget a sandbox when removal fails", async () => {
    const { provider, manager, state } = fixture();
    manager.stopContainer.mockRejectedValueOnce(new Error("Docker unavailable"));
    await provider.reapIdleSandboxes(100, 101);
    expect(state.sandboxContainerName).toBe("jait-agent-sb-old");
    await provider.reapIdleSandboxes(100, 101);
    expect(state.sandboxContainerName).toBeUndefined();
  });
  it("retries failed explicit session cleanup after retiring its handle", async () => {
    const { provider, manager } = fixture();
    manager.stopContainer.mockRejectedValueOnce(new Error("unavailable"));
    await provider.stopSession("session");
    expect((provider as any).sessions.size).toBe(0);
    await provider.reapIdleSandboxes();
    expect(manager.stopContainer).toHaveBeenCalledTimes(2);
  });

  it("waits for idle removal before creating a replacement sandbox", async () => {
    const { provider, manager, state } = fixture();
    let release!: () => void;
    manager.stopContainer.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const reaping = provider.reapIdleSandboxes(100, 101);
    await vi.waitFor(() => expect(manager.stopContainer).toHaveBeenCalled());
    const next = (provider as any).ensureThreadSandbox(state);
    expect(manager.startCommandSandbox).not.toHaveBeenCalled();
    release();
    await reaping;
    expect(await next).toBe("jait-agent-sb-new");
  });

  it("starts one maintenance loop and stops it on disposal", async () => {
    vi.useFakeTimers();
    try {
      const { provider, manager } = fixture();
      provider.startSandboxMaintenance();
      provider.startSandboxMaintenance();
      expect(vi.getTimerCount()).toBe(1);
      await provider.dispose();
      expect(manager.stopContainer).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      provider.startSandboxMaintenance();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

});
