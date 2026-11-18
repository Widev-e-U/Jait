import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createScreenshotCaptureTool } from "./screenshot-tools.js";

const { launch, close, screenshot } = vi.hoisted(() => ({
  launch: vi.fn(), close: vi.fn(), screenshot: vi.fn(),
}));
vi.mock("playwright", () => ({ chromium: { launch } }));

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("screenshot browser launch", () => {
  it("falls back to an installed channel when bundled Chromium is absent", async () => {
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "chrome");
    screenshot.mockImplementation(async ({ path }: { path: string }) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "test screenshot");
    });
    close.mockResolvedValue(undefined);
    const browser = { close, newContext: async () => ({ newPage: async () => ({
      goto: vi.fn(), waitForTimeout: vi.fn(), screenshot,
    }) }) };
    launch.mockRejectedValueOnce(new Error("Executable doesn't exist at /cache/chromium/headless_shell"))
      .mockResolvedValueOnce(browser);
    const projectRoot = resolve(import.meta.dirname, "../../../..");
    const result = await createScreenshotCaptureTool().execute({
      target: "http://127.0.0.1:4173/", path: ".jait/shots/screenshot-launch-regression.png",
    }, { sessionId: "launch-test", actionId: "test", requestedBy: "assistant", projectRoot });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("displayed in chat");
    expect(result.message).toContain("Do not call image.view");
    expect(launch).toHaveBeenCalledTimes(2);
    expect(launch.mock.calls[1][0]).toMatchObject({ headless: true, channel: "chrome" });
    expect(close).toHaveBeenCalledOnce();
  });
});
