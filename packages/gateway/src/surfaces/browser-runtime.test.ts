import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSurface, type BrowserDriver, resolveBrowserRuntimeMode, selectInitialBrowserPage } from "./browser.js";

const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}

function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}

describe("resolveBrowserRuntimeMode", () => {
  afterEach(() => {
    vi.useRealTimers();
    setPlatform(originalPlatform);
    setBunVersion(originalBunVersion);
    if (originalBrowserRuntime === undefined) {
      delete process.env.BROWSER_RUNTIME;
    } else {
      process.env.BROWSER_RUNTIME = originalBrowserRuntime;
    }
  });

  it("keeps auto mode on Bun for Windows unless explicitly overridden", () => {
    setBrowserRuntimeEnv("");
    setPlatform("win32");
    setBunVersion("1.2.0");

    expect(resolveBrowserRuntimeMode()).toBe("auto");
  });

  it("uses node-bridge when explicitly configured", () => {
    setBrowserRuntimeEnv("node-bridge");
    setPlatform("win32");
    setBunVersion("1.2.0");

    expect(resolveBrowserRuntimeMode()).toBe("node-bridge");
  });

  it("uses in-process when explicitly configured", () => {
    setBrowserRuntimeEnv("in-process");
    setPlatform("win32");
    setBunVersion("1.2.0");

    expect(resolveBrowserRuntimeMode()).toBe("in-process");
  });
});

describe("BrowserSurface idle tracking", () => {
  it("reports idle age and live-view container metadata", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const close = vi.fn().mockResolvedValue(undefined);
    const driver: BrowserDriver = {
      navigate: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      typeText: vi.fn().mockResolvedValue(undefined),
      scroll: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue("/tmp/screen.png"),
      snapshot: vi.fn().mockResolvedValue({
        url: "about:blank",
        title: "Blank",
        text: "",
        elements: [],
        activeElement: null,
        dialogs: [],
        obstruction: null,
      }),
      diagnose: vi.fn().mockResolvedValue({ selector: "#target", found: false }),
      getMetrics: vi.fn().mockResolvedValue({ sampledAt: new Date().toISOString() }),
      getEvents: vi.fn().mockReturnValue([]),
      close,
      liveView: {
        display: "container:jait-browser-sb-test",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
        containerName: "jait-browser-sb-test",
      },
    };
    const surface = new BrowserSurface("browser-test", {
      driverFactory: async () => driver,
    });

    await surface.start({ sessionId: "session-1", projectRoot: "/project" });
    now.mockReturnValue(5 * 60 * 1000);

    expect(surface.idleMs).toBe(5 * 60 * 1000);
    expect(surface.snapshot().metadata.liveViewContainerName).toBe("jait-browser-sb-test");

    await surface.describe();
    expect(surface.idleMs).toBe(0);

    await surface.stop();
    expect(close).toHaveBeenCalledOnce();
    now.mockRestore();
  });
});

describe("selectInitialBrowserPage", () => {
  it("reuses an existing about:blank bootstrap page", async () => {
    const blankPage = { url: () => "about:blank" };
    const appPage = { url: () => "http://127.0.0.1:8000/" };
    const newPage = vi.fn().mockResolvedValue({ url: () => "about:blank" });

    await expect(selectInitialBrowserPage({
      pages: () => [blankPage, appPage],
      newPage,
    })).resolves.toBe(blankPage);

    expect(newPage).not.toHaveBeenCalled();
  });

  it("reuses an existing Chromium new-tab bootstrap page", async () => {
    const newTabPage = { url: () => "chrome://new-tab-page/" };
    const appPage = { url: () => "http://127.0.0.1:8000/" };
    const newPage = vi.fn().mockResolvedValue({ url: () => "about:blank" });

    await expect(selectInitialBrowserPage({
      pages: () => [newTabPage, appPage],
      newPage,
    })).resolves.toBe(newTabPage);

    expect(newPage).not.toHaveBeenCalled();
  });

  it("opens a page when there is no reusable blank page", async () => {
    const createdPage = { url: () => "about:blank" };
    const newPage = vi.fn().mockResolvedValue(createdPage);

    await expect(selectInitialBrowserPage({
      pages: () => [{ url: () => "http://127.0.0.1:8000/" }],
      newPage,
    })).resolves.toBe(createdPage);

    expect(newPage).toHaveBeenCalledOnce();
  });

  it("ignores closed pages when reusing a bootstrap page", async () => {
    const closedBlankPage = { isClosed: () => true, url: () => "about:blank" };
    const openBlankPage = { isClosed: () => false, url: () => "about:blank" };
    const newPage = vi.fn().mockResolvedValue({ url: () => "about:blank" });

    await expect(selectInitialBrowserPage({
      pages: () => [closedBlankPage, openBlankPage],
      newPage,
    })).resolves.toBe(openBlankPage);

    expect(newPage).not.toHaveBeenCalled();
  });
});
