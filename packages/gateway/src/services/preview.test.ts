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

  it("returns the browser page snapshot in preview inspection results", async () => {
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([{ id: 1, timestamp: "2026-03-27T00:00:00.000Z", type: "console", text: "ready" }]),
      screenshot: vi.fn().mockResolvedValue("/tmp/preview.png"),
      inspect: vi.fn().mockResolvedValue({
        snapshot: {
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
          text: "Dashboard loaded",
          elements: [{ role: "button", name: "Save", selector: "button" }],
          activeElement: { role: "textbox", name: "Search", selector: "input[name=\"q\"]" },
          dialogs: [{ role: "dialog", title: "Settings" }],
          obstruction: {
            hasModal: true,
            dialogCount: 1,
            activeDialogTitle: "Settings",
            topLayer: [],
            notes: ["1 dialog visible."],
          },
        },
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    (service as any).runner = {
      mode: "local",
      start: vi.fn(),
      stop: vi.fn(),
    };

    await service.start({
      sessionId: "session-1",
      workspaceRoot: "/workspace/app",
      target: "4173",
    });

    const inspection = await service.inspect("session-1");
    expect(inspection).not.toBeNull();
    expect(inspection).toMatchObject({
      status: "ready",
      url: "/api/dev-proxy/4173/",
      screenshot: "/tmp/preview.png",
      page: {
        title: "Preview App",
        activeElement: { name: "Search" },
        dialogs: [{ title: "Settings" }],
        obstruction: { hasModal: true },
      },
    });
    expect(inspection?.snapshot).toContain("Title: Preview App");
    expect(inspection?.snapshot).toContain("Active element: textbox - Search - input[name=\"q\"]");
  });

  it("passes selector diagnostics through preview inspection results", async () => {
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      screenshot: vi.fn().mockResolvedValue("/tmp/preview.png"),
      inspect: vi.fn().mockResolvedValue({
        snapshot: {
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
          text: "Dashboard loaded",
          elements: [],
          activeElement: null,
          dialogs: [],
          obstruction: null,
        },
        target: {
          selector: "#submit",
          found: true,
          obscured: true,
          obstructionReason: "Another element is receiving pointer hits at the target center point.",
        },
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    (service as any).runner = {
      mode: "local",
      start: vi.fn(),
      stop: vi.fn(),
    };

    await service.start({
      sessionId: "session-1",
      workspaceRoot: "/workspace/app",
      target: "4173",
    });

    const inspection = await service.inspect("session-1", "#submit");
    expect(browser.inspect).toHaveBeenCalledWith("#submit");
    expect(inspection?.target).toMatchObject({
      selector: "#submit",
      obscured: true,
    });
  });
});
