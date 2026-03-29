import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBrowserRuntimeMode } from "./browser.js";

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
