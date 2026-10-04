import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalSurface } from "./terminal.js";

afterEach(() => vi.useRealTimers());

function pendingTerminal() {
  const terminal = new TerminalSurface("stop-repro", { shell: "/bin/sh" });
  let exited!: (event: { exitCode: number }) => void;
  const pty = {
    pid: 123,
    onExit: vi.fn((callback: typeof exited) => { exited = callback; }),
    kill: vi.fn(),
  };
  Object.assign(terminal, { _pty: pty, _state: "running", _pid: 123 });
  return { terminal, pty, exit: () => exited({ exitCode: 0 }) };
}

describe("terminal shutdown ownership", () => {
  it("waits for native PTY exit before reporting stopped", async () => {
    const { terminal, pty, exit } = pendingTerminal();
    let stopped = false;
    const stopping = terminal.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(pty.kill).toHaveBeenCalledOnce();
    expect(stopped).toBe(false);
    expect(terminal.state).toBe("stopping");
    exit();
    await stopping;
    expect(terminal.state).toBe("stopped");
  });

  it("subscribes before killing a fast PTY", async () => {
    const { terminal, pty, exit } = pendingTerminal();
    pty.kill.mockImplementation(exit);
    await terminal.stop();
    expect(pty.onExit).toHaveBeenCalledOnce();
    expect(terminal.state).toBe("stopped");
  });

  it("bounds the wait for a missing exit notification", async () => {
    vi.useFakeTimers();
    const { terminal } = pendingTerminal();
    const stopping = terminal.stop();
    await vi.advanceTimersByTimeAsync(6000);
    await stopping;
    expect(terminal.state).toBe("stopped");
  });

  it("stops an already exited surface", async () => {
    const terminal = new TerminalSurface("exited", { shell: "/bin/sh" });
    await terminal.stop();
    expect(terminal.state).toBe("stopped");
  });
});
