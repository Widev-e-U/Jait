import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalRunTool, getManagedTerminalExecution } from "./tools/terminal-tools.js";
import { backgroundCommandMonitor } from "./services/background-command-monitor.js";
import { TerminalSurfaceFactory, type TerminalSurface } from "./surfaces/terminal.js";
import { SurfaceRegistry } from "./surfaces/registry.js";

function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, timeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}

afterEach(() => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
});

describe("Copilot terminal waiting behavior", () => {
  it("waits for background startup output and returns its snapshot", async () => {
    vi.useFakeTimers();
    const env = setup();
    let returned = false;
    const run = env.run(true).then(result => { returned = true; return result; });
    await vi.advanceTimersByTimeAsync(20);
    expect(returned).toBe(false);
    env.emit("Listening on http://localhost:5173\r\n");
    await vi.advanceTimersByTimeAsync(1000);
    expect((await run).data).toMatchObject({ output: expect.stringContaining("localhost:5173"), isBackground: true, watched: true });
    expect(env.notify).not.toHaveBeenCalled();
  });

  it("returns an early background completion inline without a duplicate notification", async () => {
    vi.useFakeTimers();
    const env = setup();
    const run = env.run(true);
    await vi.advanceTimersByTimeAsync(20);
    env.emit("startup failed\r\n\x1b]633;D;1\x07\x1b]633;B\x07");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await run;
    expect(result.ok).toBe(false);
    expect(result.data).toMatchObject({ exitCode: 1, output: expect.stringContaining("startup failed") });
    expect(env.notify).not.toHaveBeenCalled();
    expect(getManagedTerminalExecution("term-waiting")).toBeNull();
  });

  it("moves a timed-out wait to background without interrupting and reports complete output once", async () => {
    vi.useFakeTimers();
    const env = setup();
    const run = env.run(false, 100);
    await vi.advanceTimersByTimeAsync(20);
    env.emit("building first stage\r\n");
    await vi.advanceTimersByTimeAsync(600);
    const result = await run;
    expect(env.writes.some(value => value.includes("\x03"))).toBe(false);
    expect(result.data).toMatchObject({ isBackground: true, watched: true, timedOut: true });
    expect(getManagedTerminalExecution("term-waiting")).toMatchObject({ isBackground: true, watched: true });
    env.emit("build complete\r\n\x1b]633;D;0\x07\x1b]633;B\x07");
    await vi.advanceTimersByTimeAsync(100);
    expect(env.notify).toHaveBeenCalledTimes(1);
    expect(env.notify.mock.calls[0]![0]).toMatchObject({
      exitCode: 0,
      output: expect.stringContaining("building first stage"),
    });
    expect(env.notify.mock.calls[0]![0].output).toContain("build complete");
    expect(getManagedTerminalExecution("term-waiting")).toBeNull();
  });
});


it("keeps a real PTY command alive across the wait deadline", async () => {
  const registry = new SurfaceRegistry();
  registry.register(new TerminalSurfaceFactory());
  const tool = createTerminalRunTool(registry);
  let terminalId: string | undefined;
  const completion = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(completion);
  try {
    const result = await tool.execute({
      command: `node -e "console.log('stage-one');setTimeout(()=>console.log('stage-two'),500)"`,
      timeout: 100,
    }, { sessionId: "s-real-wait", actionId: "a-real-wait", projectRoot: process.cwd(), requestedBy: "test" });
    terminalId = (result.data as { terminalId: string }).terminalId;
    expect(result.data).toMatchObject({ isBackground: true, watched: true });
    await vi.waitFor(() => expect(completion).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(completion.mock.calls[0]![0]).toMatchObject({
      exitCode: 0, output: expect.stringContaining("stage-two"),
    });
    expect(completion.mock.calls[0]![0].output).toContain("stage-one");
  } finally {
    if (terminalId) await registry.stopSurface(terminalId);
  }
});
