import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBrowserRuntimeMode, selectInitialBrowserPage } from "./browser.js";

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

  it("opens a page when there is no reusable blank page", async () => {
    const createdPage = { url: () => "about:blank" };
    const newPage = vi.fn().mockResolvedValue(createdPage);

    await expect(selectInitialBrowserPage({
      pages: () => [{ url: () => "http://127.0.0.1:8000/" }],
      newPage,
    })).resolves.toBe(createdPage);

    expect(newPage).toHaveBeenCalledOnce();
  });
});
