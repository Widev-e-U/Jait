import { describe, expect, it } from "vitest";
import { executeInTerminal, type WorkflowCommandStop } from "./terminal-tools.js";

type Surface = Parameters<typeof executeInTerminal>[0];

/**
 * A terminal whose foreground command ignores Ctrl+C. It exits only when the
 * test calls exit(), which is what stopping the terminal does to its PTY.
 */
function makeTerminal() {
  const exitListeners = new Set<(exitCode: number | null) => void>();
  const outputListeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  let exited = false;
  return {
    writes,
    surface: {
      write(data: string) { writes.push(data); },
      snapshot() { return { metadata: { shell: "bash" } }; },
      addOutputListener(listener: (data: string) => void) { outputListeners.add(listener); },
      removeOutputListener(listener: (data: string) => void) { outputListeners.delete(listener); },
      addExitListener(listener: (exitCode: number | null) => void) { exitListeners.add(listener); },
      removeExitListener(listener: (exitCode: number | null) => void) { exitListeners.delete(listener); },
    } as unknown as Surface,
    emit(data: string) {
      for (const listener of outputListeners) listener(data);
    },
    exit(exitCode: number) {
      if (exited) return;
      exited = true;
      for (const listener of exitListeners) listener(exitCode);
    },
  };
}

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("workflow command stop", () => {
  it("does not settle on abort while the command still runs, and settles on the exit after a hard stop", async () => {
    const terminal = makeTerminal();
    const controller = new AbortController();
    const outcome: { result?: { exitCode: number | null; timedOut: boolean } } = {};
    let hardStops = 0;
    const workflowStop: WorkflowCommandStop = {
      graceMs: 20,
      hardStop: async () => {
        hardStops += 1;
        terminal.exit(137);
        return true;
      },
    };
    const running = executeInTerminal(
      terminal.surface, "sleep 60", 60_000, "bash", "/tmp", undefined, controller.signal, undefined, undefined, workflowStop,
    ).then((result) => { outcome.result = result; });

    await tick(5);
    controller.abort();
    await tick(5);
    expect(terminal.writes).toContain("\x03");
    expect(outcome.result).toBeUndefined();

    await running;
    expect(hardStops).toBe(1);
    expect(outcome.result).toMatchObject({ exitCode: 137, timedOut: false });
  });

  it("reports the workflow deadline as a timeout and stops the command", async () => {
    const terminal = makeTerminal();
    const outcome = await executeInTerminal(
      terminal.surface, "sleep 60", 30, "bash", "/tmp", undefined, undefined, undefined, undefined,
      { graceMs: 10, hardStop: async () => { terminal.exit(137); return true; } },
    );
    expect(outcome).toMatchObject({ timedOut: true, exitCode: 137 });
    expect(terminal.writes).toContain("\x03");
  });

  it("does not take a prompt-looking line for completion, so an inferred success cannot pass a gate", async () => {
    const terminal = makeTerminal();
    const controller = new AbortController();
    const outcome: { result?: { exitCode: number | null } } = {};
    const running = executeInTerminal(
      terminal.surface, "sleep 60", 60_000, "bash", "/tmp", undefined, controller.signal, undefined, undefined,
      { graceMs: 20, hardStop: async () => { terminal.exit(137); return true; } },
    ).then((result) => { outcome.result = result; });

    terminal.emit("user@host:/tmp$ ");
    await tick(150);
    expect(outcome.result).toBeUndefined();

    controller.abort();
    await running;
    expect(outcome.result).toMatchObject({ exitCode: 137 });
  });

  it("settles at once when the terminal was already gone, because nothing can still be running", async () => {
    const terminal = makeTerminal();
    const controller = new AbortController();
    const running = executeInTerminal(
      terminal.surface, "sleep 60", 60_000, "bash", "/tmp", undefined, controller.signal, undefined, undefined,
      { graceMs: 5, hardStop: async () => false },
    );
    controller.abort();
    await expect(running).resolves.toMatchObject({ exitCode: null, timedOut: false });
  });

  it("keeps the ordinary chat abort path: without a workflow stop it settles shortly after Ctrl+C", async () => {
    const terminal = makeTerminal();
    const controller = new AbortController();
    const running = executeInTerminal(terminal.surface, "sleep 60", 60_000, "bash", "/tmp", undefined, controller.signal);
    controller.abort();
    await expect(running).resolves.toMatchObject({ exitCode: null });
    expect(terminal.writes).toContain("\x03");
  });
});
