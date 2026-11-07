import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const screenshotDir = resolve(import.meta.dirname, "../../../../.jait/shots");
import { describe, expect, it, vi } from "vitest";
import { PreviewService } from "./preview.js";

describe("PreviewService", () => {
  it("revokes DevTools grants across handoff, restart and pending attachment", async () => {
    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      getDevToolsConnection: vi.fn().mockResolvedValue({ endpoint: "http://127.0.0.1:9222", targetId: "page-1" }),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), stopSurface: vi.fn().mockResolvedValue(undefined) };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    const grant = await service.getDevToolsConnection("owner");
    expect(grant).not.toBeNull();
    service.setSharedWithAgent("owner", true);
    expect(service.isDevToolsConnectionActive("owner", "browser-1", grant!.revision)).toBe(false);
    service.setSharedWithAgent("owner", false);
    expect(service.isDevToolsConnectionActive("owner", "browser-1", grant!.revision)).toBe(false);
    const second = await service.getDevToolsConnection("owner");
    await service.stop("owner");
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    expect(service.isDevToolsConnectionActive("owner", "browser-1", second!.revision)).toBe(false);
    let resolveConnection!: (value: { endpoint: string; targetId: string }) => void;
    browser.getDevToolsConnection.mockImplementationOnce(() => new Promise(resolve => { resolveConnection = resolve; }));
    const pending = service.getDevToolsConnection("owner");
    service.setSharedWithAgent("owner", true);
    service.setSharedWithAgent("owner", false);
    resolveConnection({ endpoint: "http://127.0.0.1:9222", targetId: "page-1" });
    expect(await pending).toBeNull();
  });

  it("reloads the current page without recreating the browser or granting control", async () => {
    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      reload: vi.fn().mockResolvedValue({ url: "https://example.com/#details" }),
      getEvents: vi.fn().mockReturnValue([]), getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), startSurface: vi.fn() };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    expect(await service.reload("missing")).toBeNull();
    const result = await service.reload("owner");
    expect(browser.reload).toHaveBeenCalledOnce();
    expect(result?.browserId).toBe("browser-1");
    expect(result?.sharedWithAgent).toBe(false);
    expect(registry.startSurface).not.toHaveBeenCalled();
    service.setSharedWithAgent("owner", true);
    const sharedResult = await service.reload("owner");
    expect(sharedResult?.sharedWithAgent).toBe(true);
    expect(sharedResult?.browserId).toBe("browser-1");
    expect(browser.reload).toHaveBeenCalledTimes(2);
    expect(() => service.assertAgentControl("browser-1")).not.toThrow();
  });

  it("moves through history without replacing the browser or changing control", async () => {
    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      history: vi.fn().mockResolvedValue({ url: "https://example.com/previous" }),
      getEvents: vi.fn().mockReturnValue([]), getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), startSurface: vi.fn() };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    expect(await service.history("missing", "back")).toBeNull();
    expect(await service.history("owner", "back")).toMatchObject({ browserId: "browser-1", sharedWithAgent: false });
    expect(browser.history).toHaveBeenCalledWith("back");
    service.setSharedWithAgent("owner", true);
    expect(await service.history("owner", "forward")).toMatchObject({ browserId: "browser-1", sharedWithAgent: true });
    expect(browser.history).toHaveBeenCalledWith("forward");
    registry.getSurface.mockReturnValueOnce(null as any);
    expect(await service.history("owner", "back")).toBeNull();
    expect(registry.startSurface).not.toHaveBeenCalled();
  });

  it("navigates the owner's browser without recreating it or granting agent control", async () => {
    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      navigate: vi.fn().mockResolvedValue({ url: "https://example.com/redirected" }),
      getEvents: vi.fn().mockReturnValue([]), getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), startSurface: vi.fn() };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    await expect(service.navigate("owner", "file:///etc/passwd")).rejects.toThrow("HTTP");
    await expect(service.navigate("owner", "javascript:alert(1)")).rejects.toThrow("HTTP");
    await expect(service.navigate("owner", "https://user:password@example.com/")).rejects.toThrow("credentials");
    expect(browser.navigate).not.toHaveBeenCalled();
    expect(await service.navigate("missing", "https://example.com/")).toBeNull();
    const result = await service.navigate("owner", "https://example.com/");
    expect(browser.navigate).toHaveBeenCalledWith("https://example.com/");
    expect(result?.browserId).toBe("browser-1");
    expect(result?.sharedWithAgent).toBe(false);
    expect(registry.startSurface).not.toHaveBeenCalled();
    service.setSharedWithAgent("owner", true);
    const sharedResult = await service.navigate("owner", "https://example.com/");
    expect(sharedResult?.sharedWithAgent).toBe(true);
    expect(sharedResult?.browserId).toBe("browser-1");
    expect(() => service.assertAgentControl("browser-1")).not.toThrow();
    await expect(service.navigate("owner", "file:///etc/passwd")).rejects.toThrow("HTTP");
  });

  it("cleans up a managed server when the preview browser fails", async () => {
    const registry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockRejectedValue(new Error("browser unavailable")),
      getSurface: vi.fn().mockReturnValue(null),
    };
    const service = new PreviewService(registry as any);
    const runnerResult = {
      process: null, port: 4173, command: "npm run dev", url: "http://127.0.0.1:4173/",
      mode: "local" as const,
    };
    const runnerStop = vi.fn().mockResolvedValue(undefined);
    (service as any).runner = {
      mode: "local",
      start: vi.fn().mockResolvedValue(runnerResult),
      stop: runnerStop,
    };
    const result = await service.start({ sessionId: "broken-browser", projectRoot: "/project/app" });
    expect(result.status).toBe("error");
    expect(result.lastError).toBe("browser unavailable");
    expect(runnerStop).toHaveBeenCalledWith(runnerResult);
    expect(registry.stopSurface).toHaveBeenCalledWith("preview-browser-broken-browser", "preview-failed");
  });

  it("reuses an unchanged healthy preview and only recreates it on restart", async () => {
    const browser = {
      type: "browser", state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue({ vncPort: 5900, websockifyPort: 6080, novncUrl: "ws://127.0.0.1:6080" }),
    };
    const registry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(registry as any);
    const first = await service.start({ sessionId: "same-session", target: "4173" });
    const second = await service.start({ sessionId: "same-session", target: "4173" });
    expect(second.createdAt).toBe(first.createdAt);
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
    await service.restart("same-session");
    expect(registry.startSurface).toHaveBeenCalledTimes(2);
  });

  it("gates agent browser control by the preview sharing state and preserves it on restart", async () => {
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue({ vncPort: 5900, websockifyPort: 6080, novncUrl: "ws://127.0.0.1:6080" }),
    };
    const registry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(registry as any);
    const started = await service.start({ sessionId: "sharing-session", target: "4173" });
    expect(started.sharedWithAgent).toBe(true);
    expect(() => service.assertAgentControl(started.browserId!)).not.toThrow();
    service.setSharedWithAgent("sharing-session", false);
    expect(() => service.assertAgentControl(started.browserId!)).toThrow(/not shared with the agent/i);

    const shared = service.setSharedWithAgent("sharing-session", true);
    expect(shared?.sharedWithAgent).toBe(true);
    expect(service.getSessionByPreviewSessionId("sharing-session")?.browserId).toBe(started.browserId);
    expect(() => service.assertAgentControl(started.browserId!)).not.toThrow();

    const restarted = await service.restart("sharing-session");
    expect(restarted?.sharedWithAgent).toBe(true);
    const reloaded = await service.start({ sessionId: "sharing-session", target: "4174" });
    expect(reloaded.sharedWithAgent).toBe(true);
    service.setSharedWithAgent("sharing-session", false);
    expect(() => service.assertAgentControl(started.browserId!)).toThrow(/not shared with the agent/i);
  });

  it("does not revive a preview stopped while its browser is starting", async () => {
    let finishStart!: (browser: unknown) => void;
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue({ vncPort: 5900, websockifyPort: 6080, novncUrl: "ws://127.0.0.1:6080" }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockImplementation(() => new Promise((resolve) => { finishStart = resolve; })),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    const starting = service.start({ sessionId: "closing-session", target: "4173" });
    await vi.waitFor(() => expect(surfaceRegistry.startSurface).toHaveBeenCalledOnce());
    expect(await service.stop("closing-session")).toBe(true);
    finishStart(browser);
    const result = await starting;
    expect(result.status).toBe("stopped");
    expect(service.get("closing-session")).toBeNull();
    expect(surfaceRegistry.stopSurface).toHaveBeenCalledWith("preview-browser-closing-session", "preview-stop");
  });

  it("attaches to an existing localhost target instead of spawning a managed preview", async () => {
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
      }),
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
      projectRoot: "/project/app",
      target: "4173",
    });

    expect(runnerStart).not.toHaveBeenCalled();
    expect(session.mode).toBe("url");
    expect(session.status).toBe("ready");
    expect(session.url).toBe("/noVNC/vnc_lite.html?path=api/live-view/6080/websockify");
    expect(session.remoteBrowser).toMatchObject({
      containerName: "live-view",
      novncUrl: "/noVNC/vnc_lite.html?path=api/live-view/6080/websockify",
    });
    expect(surfaceRegistry.startSurface).toHaveBeenCalledWith("browser", "preview-browser-session-1", {
      sessionId: "session-1",
      projectRoot: "/project/app",
      requireLiveView: true,
    });
    expect(browser.navigate).toHaveBeenCalledWith("http://127.0.0.1:4173/");
  });

  it("attaches to an existing private-network target URL instead of spawning a managed preview", async () => {
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://172.17.0.1:4174/",
        title: "Preview App",
      }),
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
      projectRoot: "/project/app",
      target: "http://172.17.0.1:4174/",
    });

    expect(runnerStart).not.toHaveBeenCalled();
    expect(session.mode).toBe("url");
    expect(session.status).toBe("ready");
    expect(browser.navigate).toHaveBeenCalledWith("http://172.17.0.1:4174/");
  });

  it("returns the browser page snapshot in preview inspection results", async () => {
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, `preview-${Date.now()}.png`);
    await writeFile(screenshotPath, Buffer.from("preview-image"));
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([{ id: 1, timestamp: "2026-03-27T00:00:00.000Z", type: "console", text: "ready" }]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:01.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
        webVitals: { lcpMs: 180, cls: 0.01, inpMs: 40 },
      }),
      screenshot: vi.fn().mockResolvedValue(screenshotPath),
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
        metrics: {
          sampledAt: "2026-03-27T00:00:01.000Z",
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
          webVitals: { lcpMs: 180, cls: 0.01, inpMs: 40 },
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
      projectRoot: "/project/app",
      target: "4173",
    });

    const inspection = await service.inspect("session-1");
    expect(inspection).not.toBeNull();
    expect(inspection).toMatchObject({
      status: "ready",
      url: "/noVNC/vnc_lite.html?path=api/live-view/6080/websockify",
      screenshot: Buffer.from("preview-image").toString("base64"),
      page: {
        title: "Preview App",
        activeElement: { name: "Search" },
        dialogs: [{ title: "Settings" }],
        obstruction: { hasModal: true },
      },
      metrics: {
        title: "Preview App",
        webVitals: { lcpMs: 180, cls: 0.01, inpMs: 40 },
      },
    });
    expect(inspection?.snapshot).toContain("Title: Preview App");
    expect(inspection?.snapshot).toContain("Active element: textbox - Search - input[name=\"q\"]");
  });

  it("passes selector diagnostics through preview inspection results", async () => {
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, `preview-${Date.now()}-selector.png`);
    await writeFile(screenshotPath, Buffer.from("selector-preview-image"));
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
      }),
      screenshot: vi.fn().mockResolvedValue(screenshotPath),
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
        metrics: {
          sampledAt: "2026-03-27T00:00:00.000Z",
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
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
      projectRoot: "/project/app",
      target: "4173",
    });

    const inspection = await service.inspect("session-1", "#submit");
    expect(browser.inspect).toHaveBeenCalledWith("#submit");
    expect(inspection?.target).toMatchObject({
      selector: "#submit",
      obscured: true,
    });
  });

  it("requires live view for preview browser sessions", async () => {
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
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

    const session = await service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });

    expect(surfaceRegistry.startSurface).toHaveBeenCalledWith("browser", "preview-browser-session-1", {
      sessionId: "session-1",
      projectRoot: "/project/app",
      requireLiveView: true,
    });
    expect(session.status).toBe("error");
    expect(session.url).toBe("/api/dev-proxy/4173/");
    expect(session.remoteBrowser).toBeNull();
    expect(session.lastError).toBe("Preview browser did not expose a live VNC session");
  });

  it("coalesces duplicate start requests for the same chat session", async () => {
    let resolveNavigate: (() => void) | null = null;
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
        resolveNavigate = resolve;
      })),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
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

    const first = service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });
    const second = service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(browser.navigate).toHaveBeenCalled();
    resolveNavigate?.();
    const [firstSession, secondSession] = await Promise.all([first, second]);

    expect(firstSession.status).toBe("ready");
    expect(secondSession.status).toBe("ready");
    expect(surfaceRegistry.startSurface).toHaveBeenCalledTimes(1);
    expect(browser.navigate).toHaveBeenCalledTimes(1);
  });

});
