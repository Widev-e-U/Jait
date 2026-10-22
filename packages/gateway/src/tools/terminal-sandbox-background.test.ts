import { afterEach, describe, expect, it, vi } from "vitest";
import type { SandboxManager, SandboxRunResult } from "../security/sandbox-manager.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { ToolContext } from "./contracts.js";
import { createJaitTerminalTool } from "./terminal-tools.js";
import { backgroundCommandMonitor } from "../services/background-command-monitor.js";

const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
afterEach(() => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); });

describe("sandbox background terminal", () => {
  it("returns a startup snapshot while the server is still running, then notifies once", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const completion = new Promise(resolve => { finish = resolve; });
    const manager = {
      execInContainer: vi.fn(() => new Promise(() => {})),
      startBackgroundCommand: vi.fn(() => ({
        containerName: context.sandboxContainerName, output: "server listening",
        completion, stop: vi.fn(), onOutput: vi.fn(() => () => {}),
      })),
    };
    const notify = vi.fn();
    const unregister = backgroundCommandMonitor.setCompletionHandler(notify);
    try {
      const tool = createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager);
      let result: Awaited<ReturnType<typeof tool.execute>> | undefined;
      const pending = tool.execute({ command: "bun run dev", sandbox: true, isBackground: true }, context)
        .then(value => { result = value; });
      await vi.advanceTimersByTimeAsync(5000);
      expect(result, "background startup must release before process exit").toBeDefined();
      expect(result!.data).toMatchObject({ output: "server listening", isBackground: true, watched: true, exitCode: null });
      expect(notify).not.toHaveBeenCalled();
      finish({ ok: false, output: "server stopped", exitCode: 7, timedOut: false, containerName: context.sandboxContainerName });
      await pending;
      await vi.advanceTimersByTimeAsync(0);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]![0]).toMatchObject({ sessionId: context.sessionId, exitCode: 7, output: "server stopped" });
    } finally {
      unregister();
    }
  });
});

describe("sandbox startup lifecycle", () => {
  function fixture(completed?: { ok: boolean; output: string; exitCode: number; timedOut: boolean; containerName: string }) {
    let finish!: (value: SandboxRunResult) => void;
    const completion = completed ? Promise.resolve(completed) : new Promise<SandboxRunResult>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => {});
    const manager = {
      startBackgroundCommand: vi.fn(() => ({ containerName: "jait-agent-sb-test", output: "booting", completion, stop, onOutput: vi.fn(() => () => {}) })),
      execInContainer: vi.fn(async () => ({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "jait-agent-sb-test" })),
    };
    return { tool: createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager), manager, stop, finish };
  }

  it("returns an early nonzero exit inline without a completion wakeup", async () => {
    const { tool } = fixture({ ok: false, output: "port in use", exitCode: 1, timedOut: false, containerName: "jait-agent-sb-test" });
    const notify = vi.fn();
    const unregister = backgroundCommandMonitor.setCompletionHandler(notify);
    try {
      const result = await tool.execute({ command: "server", sandbox: true, isBackground: true }, context);
      expect(result.ok).toBe(false);
      expect(result.data).toMatchObject({ isBackground: false, watched: false, exitCode: 1 });
      expect(notify).not.toHaveBeenCalled();
    } finally { unregister(); }
  });

  it("yields finite sandbox calls and reports their later completion once", async () => {
    vi.useFakeTimers();
    const { tool, manager, finish } = fixture();
    const notify = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notify);
    const pending = tool.execute({ command: "build", sandbox: true, yieldTimeMs: 20 }, context);
    await vi.advanceTimersByTimeAsync(20);
    const result = await pending;
    expect(result.data).toMatchObject({ isBackground: true, executionId: context.actionId, output: "booting" });
    expect(manager.startBackgroundCommand).toHaveBeenCalledOnce();
    expect(manager.execInContainer).not.toHaveBeenCalled();
    finish({ ok: true, output: "built", exitCode: 0, timedOut: false, containerName: context.sandboxContainerName! });
    await vi.advanceTimersByTimeAsync(0);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("launches a standalone sandbox with the original mount and resource restrictions", async () => {
    const { tool, manager } = fixture({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "one-shot" });
    await tool.execute({ command: "cat /repo/file", sandbox: true, sandboxMountMode: "read-only", isBackground: true }, { ...context, sandboxContainerName: undefined });
    expect(manager.startBackgroundCommand).toHaveBeenCalledWith({
      command: "cat /project/file", projectRoot: "/repo", mountMode: "read-only",
      networkEnabled: false, memoryLimitMb: 512, cpuLimit: "1.0", timeoutMs: 3600000,
    });
  });

  it("does not start an already cancelled command", async () => {
    const { tool, manager } = fixture();
    const abort = new AbortController(); abort.abort();
    const result = await tool.execute({ command: "server", sandbox: true, isBackground: true }, { ...context, signal: abort.signal });
    expect(result.ok).toBe(false);
    expect(manager.startBackgroundCommand).not.toHaveBeenCalled();
  });

  it("stops startup on cancellation without falsely reporting success", async () => {
    vi.useFakeTimers();
    const { tool, stop } = fixture();
    const abort = new AbortController();
    const pending = tool.execute({ command: "server", sandbox: true, isBackground: true }, { ...context, signal: abort.signal });
    abort.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Cancelled");
    expect(stop).toHaveBeenCalled();
  });

  it("cancels the scoped process and suppresses wakeup when session watching is stopped", async () => {
    vi.useFakeTimers();
    const { tool, stop, finish } = fixture();
    const notify = vi.fn();
    const unregister = backgroundCommandMonitor.setCompletionHandler(notify);
    try {
      const pending = tool.execute({ command: "server", sandbox: true, isBackground: true }, context);
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
      backgroundCommandMonitor.stopForSession(context.sessionId);
      expect(stop).toHaveBeenCalledTimes(1);
      finish({ ok: false, exitCode: 143, output: "stopped", timedOut: false, containerName: "jait-agent-sb-test" });
      await vi.advanceTimersByTimeAsync(0);
      expect(notify).not.toHaveBeenCalled();
      expect(backgroundCommandMonitor.activeCount).toBe(0);
    } finally { unregister(); }
  });
});
