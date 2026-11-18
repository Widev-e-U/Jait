import { expect, it, vi } from "vitest";
import { createTerminalRunTool } from "./tools/terminal-tools.js";
import { backgroundCommandMonitor } from "./services/background-command-monitor.js";
import type { TerminalSurface } from "./surfaces/terminal.js";
import type { SurfaceRegistry } from "./surfaces/registry.js";

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


it("treats a shell completion marker with no exit status as success", async () => {
  vi.useFakeTimers();
  try {
    const env = setup();
    const run = env.run(false);
    await vi.advanceTimersByTimeAsync(20);
    env.emit("completed output\r\n\x1b]633;D;\x07");
    env.emit("trailing output\r\n");
    env.emit("\x1b]633;B\x07");
    await vi.advanceTimersByTimeAsync(100);
    expect((await run).data).toMatchObject({ exitCode: 0, output: expect.stringContaining("completed output") });
    expect(env.notify).not.toHaveBeenCalled();
  } finally {
    backgroundCommandMonitor.clearForTests();
    vi.useRealTimers();
  }
});
