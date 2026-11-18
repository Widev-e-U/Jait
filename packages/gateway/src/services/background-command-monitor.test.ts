import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  backgroundCommandMonitor,
  extractCompletionOutput,
  type BackgroundCommandResult,
  type MonitorableSurface,
} from "./background-command-monitor.js";

class FakeSurface implements MonitorableSurface {
  private readonly listeners = new Set<(data: string) => void>();
  addOutputListener(listener: (data: string) => void): void {
    this.listeners.add(listener);
  }
  removeOutputListener(listener: (data: string) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: string): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

// OSC 633;D;{exit} — the shell-integration "command done" marker.
const oscDone = (code: number): string => `\x1b]633;D;${code}\x07`;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("BackgroundCommandMonitor", () => {
  beforeEach(() => backgroundCommandMonitor.clearForTests());
  afterEach(() => backgroundCommandMonitor.clearForTests());

  it("fires the handler with exit code and cleaned output when a background command finishes", async () => {
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();

    backgroundCommandMonitor.track({ sessionId: "s1", terminalId: "t1", command: "npm test", surface });
    expect(surface.listenerCount).toBe(1);
    expect(backgroundCommandMonitor.activeCount).toBe(1);

    surface.emit("npm test\r\n");
    surface.emit("PASS  2 passed\r\n");
    surface.emit(oscDone(0));
    await flush();

    expect(results).toHaveLength(1);
    expect(results[0]!).toMatchObject({ sessionId: "s1", terminalId: "t1", command: "npm test", exitCode: 0 });
    expect(results[0]!.output).toContain("PASS");
    expect(results[0]!.output).not.toContain("npm test");
    // Listener detached and no longer tracked once complete.
    expect(surface.listenerCount).toBe(0);
    expect(backgroundCommandMonitor.activeCount).toBe(0);
  });

  it("handles completion emitted immediately after tracking starts", async () => {
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();

    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "true", surface });
    surface.emit("true\r\n" + oscDone(0));
    await flush();

    expect(results).toHaveLength(1);
    expect(results[0]!).toMatchObject({ command: "true", exitCode: 0 });
    expect(backgroundCommandMonitor.activeCount).toBe(0);
  });

  it("captures a non-zero exit code", async () => {
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "pytest", surface });

    surface.emit("pytest\r\n1 failed\r\n" + oscDone(1));
    await flush();

    expect(results[0]!.exitCode).toBe(1);
  });

  it("fires from the injected completion sentinel when OSC markers are absent", async () => {
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();
    const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "printf hi", surface, completionToken });

    surface.emit("printf hi\r\nhi\r\n" + completionToken + ":0\r\n");
    await flush();

    expect(results).toHaveLength(1);
    expect(results[0]!).toMatchObject({ command: "printf hi", exitCode: 0 });
    expect(results[0]!.output).toBe("hi");
    expect(backgroundCommandMonitor.activeCount).toBe(0);
  });

  it("calls onStop exactly once when a watcher finishes", async () => {
    backgroundCommandMonitor.setCompletionHandler(() => {});
    const surface = new FakeSurface();
    const onStop = vi.fn();
    const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    backgroundCommandMonitor.track({
      sessionId: "s",
      terminalId: "t",
      command: "printf hi",
      surface,
      completionToken,
      onStop,
    });

    surface.emit(completionToken + ":0\r\n");
    await flush();
    backgroundCommandMonitor.stopForSession("s");

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not fire for a never-ending process (no done marker)", async () => {
    const handler = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(handler);
    const surface = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm run dev", surface });

    surface.emit("npm run dev\r\nlistening on :3000\r\n");
    await flush();

    expect(handler).not.toHaveBeenCalled();
    expect(backgroundCommandMonitor.activeCount).toBe(1); // still watching
  });

  it("stops watching after maxWatchMs", () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      backgroundCommandMonitor.setCompletionHandler(handler);
      const surface = new FakeSurface();
      backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm run dev", surface, maxWatchMs: 1000 });
      expect(backgroundCommandMonitor.activeCount).toBe(1);

      vi.advanceTimersByTime(1001);

      expect(backgroundCommandMonitor.activeCount).toBe(0);
      expect(surface.listenerCount).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefers the sentinel's exit code over the OSC marker's", async () => {
    // The shell's prompt hook emits D before the sentinel `printf` runs, and
    // the sentinel reads `$?` for the command itself — so when the two
    // disagree, the sentinel wins.
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => {
      results.push(r);
    });
    const surface = new FakeSurface();
    const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "pytest", surface, completionToken });

    surface.emit("pytest\r\n1 failed\r\n" + oscDone(0));
    await flush();
    // D alone does not resolve the command while a sentinel is still expected.
    expect(results).toHaveLength(0);

    surface.emit(completionToken + ":1\r\n");
    await flush();

    expect(results).toHaveLength(1);
    expect(results[0]!.exitCode).toBe(1);
  });

  it("falls back to the OSC exit code when the sentinel never arrives", async () => {
    vi.useFakeTimers();
    try {
      const results: BackgroundCommandResult[] = [];
      backgroundCommandMonitor.setCompletionHandler((r) => {
        results.push(r);
      });
      const surface = new FakeSurface();
      const completionToken = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
      backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, completionToken });

      // A command that consumes stdin swallows the sentinel line entirely.
      surface.emit("npm test\r\ndone\r\n" + oscDone(3));
      await vi.advanceTimersByTimeAsync(500);

      expect(results).toHaveLength(1);
      expect(results[0]!.exitCode).toBe(3);
      expect(backgroundCommandMonitor.activeCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports whether the command is actually being watched", () => {
    backgroundCommandMonitor.setCompletionHandler(() => {});
    const surface = new FakeSurface();
    expect(backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "x", surface })).toBe(true);

    // Saturate the watcher cap; further commands run unwatched and must say so
    // rather than promising a notification that will never arrive.
    for (let i = 0; i < 60; i++) {
      backgroundCommandMonitor.track({ sessionId: `s${i}`, terminalId: `t${i}`, command: "x", surface: new FakeSurface() });
    }
    expect(backgroundCommandMonitor.track({ sessionId: "late", terminalId: "late", command: "x", surface: new FakeSurface() })).toBe(false);
  });

  it("knows which terminals have a live watcher so they are not reaped", () => {
    backgroundCommandMonitor.setCompletionHandler(() => {});
    const surface = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s1", terminalId: "term-busy", command: "npm test", surface });

    expect(backgroundCommandMonitor.hasWatcherForTerminal("term-busy")).toBe(true);
    expect(backgroundCommandMonitor.hasWatcherForTerminal("term-free")).toBe(false);

    backgroundCommandMonitor.stopForSession("s1");
    expect(backgroundCommandMonitor.hasWatcherForTerminal("term-busy")).toBe(false);
  });

  it("stopForSession detaches only that session's watchers", () => {
    backgroundCommandMonitor.setCompletionHandler(() => {});
    const a = new FakeSurface();
    const b = new FakeSurface();
    backgroundCommandMonitor.track({ sessionId: "s1", terminalId: "t1", command: "x", surface: a });
    backgroundCommandMonitor.track({ sessionId: "s2", terminalId: "t2", command: "y", surface: b });
    expect(backgroundCommandMonitor.activeCount).toBe(2);

    backgroundCommandMonitor.stopForSession("s1");

    expect(backgroundCommandMonitor.activeCount).toBe(1);
    expect(a.listenerCount).toBe(0);
    expect(b.listenerCount).toBe(1);
  });
});

describe("extractCompletionOutput", () => {
  it("strips OSC 633 + ANSI and drops the echoed command line", () => {
    const raw = "npm test\r\n\x1b]633;C\x07\x1b[32mPASS\x1b[0m all good\r\n\x1b]633;D;0\x07";
    const out = extractCompletionOutput(raw, "npm test");
    expect(out).toContain("PASS");
    expect(out).toContain("all good");
    expect(out).not.toContain("npm test");
    expect(out).not.toContain("\x1b");
  });

  it("returns (no output) when nothing but markers were captured", () => {
    expect(extractCompletionOutput("\x1b]633;D;0\x07", "ls")).toBe("(no output)");
  });

  it("drops the sentinel's echoed printf, its result line, and the trailing prompt", () => {
    const token = "__JAIT_BACKGROUND_DONE_019f74ed-1111-7222-a333-abcdefabcdef__";
    const raw =
      "sleep 1; echo hi\r\nhi\r\n"
      + `jakob@host:/tmp$ printf '\\n${token}:%s\\n' "$?"\r\n`
      + `\r\n${token}:0\r\n`
      + "jakob@host:/tmp$ ";
    expect(extractCompletionOutput(raw, "sleep 1; echo hi", "/bin/bash")).toBe("hi");
  });

  it("drops the sourcing line used to run multi-line commands atomically", () => {
    const out = extractCompletionOutput(
      ". '/tmp/jait-terminal/cmd-019f.ps1'\r\none\r\ntwo\r\njakob@host:/tmp$ ",
      "echo one\nsleep 3\necho two",
      "/bin/bash",
    );
    expect(out).toBe("one\ntwo");
  });
});


class ExitSurface extends FakeSurface {
  private readonly exits = new Set<(exitCode: number | null) => void>();
  addExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.add(listener);
  }
  removeExitListener(listener: (exitCode: number | null) => void): void {
    this.exits.delete(listener);
  }
  exit(exitCode: number | null): void {
    for (const listener of [...this.exits]) listener(exitCode);
  }
}

describe("BackgroundCommandMonitor execution inspection and cancellation", () => {
  beforeEach(() => backgroundCommandMonitor.clearForTests());
  afterEach(() => backgroundCommandMonitor.clearForTests());

  it("inspects a running execution and reads its completed history", async () => {
    const surface = new FakeSurface();
    backgroundCommandMonitor.setCompletionHandler(() => {});
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, executionId: "exec-1" });

    const running = backgroundCommandMonitor.inspectExecution("s", "t", "exec-1");
    expect(running?.status).toBe("running");
    expect(running?.executionId).toBe("exec-1");
    expect(running?.exitCode).toBeNull();

    surface.emit("npm test\r\nPASS\r\n" + oscDone(0));
    await flush();

    const done = backgroundCommandMonitor.inspectExecution("s", "t", "exec-1");
    expect(done?.status).toBe("completed");
    expect(done?.exitCode).toBe(0);
    expect(backgroundCommandMonitor.activeCount).toBe(0);
  });

  it("cancels a running execution and records a cancelled snapshot", () => {
    const surface = new FakeSurface();
    backgroundCommandMonitor.setCompletionHandler(() => {});
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, executionId: "exec-1", onCancel: () => {} });

    const cancelled = backgroundCommandMonitor.cancelExecution("s", "t", "exec-1");
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.executionId).toBe("exec-1");
    expect(backgroundCommandMonitor.activeCount).toBe(0);
    // Cancelled execution is now inspectable through history.
    expect(backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status).toBe("cancelled");
  });

  it("returns null for an unknown execution", () => {
    expect(backgroundCommandMonitor.inspectExecution("s", "t", "nope")).toBeNull();
    expect(backgroundCommandMonitor.cancelExecution("s", "t", "nope")).toBeNull();
  });

  it("tracks an external process through its exit promise and records failed status", async () => {
    backgroundCommandMonitor.setCompletionHandler(() => {});
    const startedAt = Date.now() - 1000;
    let resolve: (value: { exitCode: number | null; output: string; timedOut?: boolean }) => void = () => {};
    const promise = new Promise<{ exitCode: number | null; output: string; timedOut?: boolean }>((r) => { resolve = r; });

    expect(backgroundCommandMonitor.trackExternal({
      sessionId: "s", terminalId: "t", command: "build", startedAt,
      exitPromise: promise, executionId: "exec-1", getOutput: () => "building…",
    })).toBe(true);
    expect(backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status).toBe("running");

    resolve({ exitCode: 1, output: "failed" });
    await flush();

    const done = backgroundCommandMonitor.inspectExecution("s", "t", "exec-1");
    expect(done?.status).toBe("failed");
    expect(done?.exitCode).toBe(1);
    expect(done?.output).toBe("failed");
  });

  it("records a timed-out external process without notifying when shouldNotify is false", async () => {
    const notified = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notified);
    const promise = Promise.resolve({ exitCode: null, output: "", timedOut: true });
    backgroundCommandMonitor.trackExternal({
      sessionId: "s", terminalId: "t", command: "hang", startedAt: Date.now(),
      exitPromise: promise, executionId: "exec-1", shouldNotify: () => false,
    });
    await flush();
    expect(backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status).toBe("timed_out");
    expect(notified).not.toHaveBeenCalled();
  });

  it("finishes through the surface exit listener", async () => {
    const surface = new ExitSurface();
    const results: BackgroundCommandResult[] = [];
    backgroundCommandMonitor.setCompletionHandler((r) => results.push(r));
    backgroundCommandMonitor.track({ sessionId: "s", terminalId: "t", command: "npm test", surface, executionId: "exec-1" });

    surface.exit(0);
    await flush();

    expect(results).toHaveLength(1);
    expect(results[0]!.exitCode).toBe(0);
    expect(backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status).toBe("completed");
  });

  it("reports a timed-out execution through onTimeout", async () => {
    vi.useFakeTimers();
    try {
      const surface = new ExitSurface();
      const notified = vi.fn();
      const onTimeout = vi.fn();
      backgroundCommandMonitor.setCompletionHandler(notified);
      backgroundCommandMonitor.track({
        sessionId: "s", terminalId: "t", command: "npm run dev", surface,
        executionId: "exec-1", maxWatchMs: 1000, onTimeout,
      });

      await vi.advanceTimersByTimeAsync(1001);

      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(backgroundCommandMonitor.inspectExecution("s", "t", "exec-1")?.status).toBe("timed_out");
      expect(notified).toHaveBeenCalledWith(expect.objectContaining({ timedOut: true }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("BackgroundCommandMonitor cancellation during output delivery", () => {
  afterEach(() => backgroundCommandMonitor.clearForTests());
  it.each([undefined, "__JAIT_BACKGROUND_DONE_abc-123__"])("does not complete or notify when onOutput cancels the session (token=%s)", async (completionToken) => {
    const surface = new FakeSurface();
    const complete = vi.fn();
    const stopped = vi.fn();
    const notified = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notified);
    backgroundCommandMonitor.track({
      sessionId: "cancel-during-output", terminalId: "terminal", command: "run", surface,
      onOutput: () => backgroundCommandMonitor.stopForSession("cancel-during-output"),
      onComplete: complete, onStop: stopped, completionToken,
    });
    surface.emit("run\r\nresult\r\n" + oscDone(0));
    await Promise.resolve();
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();
    expect(notified).not.toHaveBeenCalled();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(surface.listenerCount).toBe(0);
    expect(backgroundCommandMonitor.activeCount).toBe(0);
  });
});
