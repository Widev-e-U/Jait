import { describe, expect, it, vi } from "vitest";
import { PreviewService } from "./preview.js";

describe("PreviewService", () => {
  it("attaches to an existing localhost target instead of spawning a managed preview", async () => {
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    const runnerStart = vi.fn();
    (service as any).runner = {
      mode: "local",
      start: runnerStart,
      stop: vi.fn(),
    };

    const session = await service.start({
      sessionId: "session-1",
      workspaceRoot: "/workspace/app",
      target: "4173",
    });

    expect(runnerStart).not.toHaveBeenCalled();
    expect(session.mode).toBe("url");
    expect(session.status).toBe("ready");
    expect(surfaceRegistry.startSurface).toHaveBeenCalledWith("browser", "preview-browser-session-1", {
      sessionId: "session-1",
      workspaceRoot: "/workspace/app",
    });
    expect(browser.navigate).toHaveBeenCalledWith("http://127.0.0.1:4173/");
  });
});
