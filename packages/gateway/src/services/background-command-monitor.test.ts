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
});
