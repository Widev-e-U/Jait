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
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
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
    expect(result.data).toMatchObject({ isBackground: true, watched: true, timedOut: false, yielded: true });
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
      yieldTimeMs: 100,
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

it("returns bounded progress, enforces execution identity and cancels without rerunning", async () => {
  vi.useFakeTimers();
  const { createTerminalExecutionTool } = await import("./tools/terminal-execution.js");
  const env = setup();
  const run = env.run(false, 20);
  await vi.advanceTimersByTimeAsync(25);
  const result = await run;
  const ids = result.data as { terminalId: string; executionId: string };
  const tool = createTerminalExecutionTool();
  const context = { sessionId: "s-waiting", actionId: "inspect", projectRoot: process.cwd(), requestedBy: "test" };
  env.emit("still building\r\n");
  expect((await tool.execute({ ...ids, action: "inspect" }, { ...context, sessionId: "other" })).ok).toBe(false);
  expect((await tool.execute({ ...ids, executionId: "stale", action: "cancel" }, context)).ok).toBe(false);
  expect((await tool.execute({ ...ids, action: "inspect" }, context)).data).toMatchObject({ status: "running", output: expect.stringContaining("still building") });
  expect((await tool.execute({ ...ids, action: "cancel" }, context)).data).toMatchObject({ status: "cancelled" });
  expect(env.writes.filter(x => x === "STOP")).toHaveLength(1);
  env.emit("\x1b]633;D;0\x07");
  expect(env.notify).not.toHaveBeenCalled();
  expect((await tool.execute({ ...ids, action: "inspect" }, context)).data).toMatchObject({ status: "cancelled" });
});

it("rejects incomplete shell syntax before writing anything to a persistent terminal", async () => {
  const env = setup();
  // setup's command is valid; this fixture directly exercises dispatch of malformed input.
  const writes: string[] = [];
  const surface = { id: "syntax", type: "terminal", state: "running", touch() {}, write(s: string) { writes.push(s); }, snapshot() { return { metadata: { shell: "/bin/bash" } }; } };
  const tool = createTerminalRunTool({ getSurface: () => surface } as unknown as SurfaceRegistry);
  const result = await tool.execute({ command: 'printf "unfinished', terminalId: "syntax" },
    { sessionId: "syntax", actionId: "syntax", projectRoot: process.cwd(), requestedBy: "test" });
  expect(result.ok).toBe(false);
  expect(result.data).toMatchObject({ syntaxError: true });
  expect(writes).toEqual([]);
  expect(env.notify).not.toHaveBeenCalled();
});

it("reports deadline expiry during background startup inline without a duplicate wakeup", async () => {
  vi.useFakeTimers();
  const env = setup();
  const run = env.run(true, 1000, 20);
  await vi.advanceTimersByTimeAsync(25);
  const result = await run;
  expect(result.ok).toBe(false);
  expect(result.data).toMatchObject({ timedOut: true, isBackground: false, watched: false });
  expect(env.writes.filter(x => x === "STOP")).toHaveLength(1);
  expect(env.notify).not.toHaveBeenCalled();
});

it.each([false, true])("never dispatches after cancellation during environment resolution (background=%s)", async isBackground => {
  const abort = new AbortController();
  const writes: string[] = [];
  const listeners = new Set<(s: string) => void>();
  const surface = { id: "cancel-env", type: "terminal", state: "running", shellIntegrationReady: true,
    touch() {}, snapshot() { return { metadata: { shell: "/bin/bash" } }; },
    addOutputListener(f: (s: string) => void) { listeners.add(f); }, removeOutputListener(f: (s: string) => void) { listeners.delete(f); },
    write(s: string) { writes.push(s); } };
  const registry = { getSurface: () => surface, stopSurface: async () => {} } as unknown as SurfaceRegistry;
  const tool = createTerminalRunTool(registry, undefined, undefined, undefined, async () => { abort.abort(); return {}; });
  const result = await tool.execute({ command: "build-app", terminalId: surface.id, isBackground },
    { sessionId: "cancel-env", actionId: "cancel-env", projectRoot: process.cwd(), requestedBy: "test", signal: abort.signal });
  expect(result.ok).toBe(false);
  expect(writes.every(s => !s.includes("build-app"))).toBe(true);
  expect(backgroundCommandMonitor.activeCount).toBe(0);
  expect(listeners.size).toBe(0);
});

it("finishes from the real PTY exit even when the shell never returns a prompt", async () => {
  const registry = new SurfaceRegistry();
  registry.register(new TerminalSurfaceFactory());
  const tool = createTerminalRunTool(registry);
  const result = await tool.execute({ command: "exit 7", yieldTimeMs: 2000 },
    { sessionId: "shell-exit", actionId: "shell-exit", projectRoot: process.cwd(), requestedBy: "test" });
  expect(result.ok).toBe(false);
  expect(result.data).toMatchObject({ exitCode: 7, timedOut: false });
});
