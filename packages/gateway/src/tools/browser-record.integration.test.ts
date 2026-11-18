import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BrowserSurface } from "../surfaces/browser.js";
import { PreviewService } from "../services/preview.js";
import { createBrowserRecordTool } from "./browser-tools.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";

describe.skipIf(process.env.JAIT_BROWSER_RECORD_INTEGRATION !== "1").each(["in-process", "node-bridge"])("real browser recording (%s)", runtime => {
  it("captures a browser interaction through the Jait surface", async () => {
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    const artifacts = resolve(import.meta.dirname, "../../../../.jait/artifacts");
    await mkdir(artifacts, { recursive: true });
    const projectRoot = await mkdtemp(resolve(artifacts, "record-integration-"));
    const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<button id="change" onclick="document.body.style.background=\'red\'">Change</button>'); });
    const browser = new BrowserSurface("record-browser");
    const registry = { getSurface: () => browser, stopSurface: async () => browser.stop() } as unknown as SurfaceRegistry;
    const preview = new PreviewService(registry);
    try {
      await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No fixture port");
      await browser.start({ sessionId: "record-chat", projectRoot });
      preview.attachAgentBrowser("record-chat", browser, projectRoot);
      await browser.navigate(`http://127.0.0.1:${address.port}`);
      const tool = createBrowserRecordTool(registry, preview);
      const context = { sessionId: "record-chat", actionId: "action", projectRoot, requestedBy: "test" };
      expect((await tool.execute({ action: "start" }, context)).ok).toBe(true);
      await new Promise(r => setTimeout(r, 500));
      await browser.click("#change");
      await new Promise(r => setTimeout(r, 500));
      const result = await tool.execute({ action: "stop" }, context);
      expect(result.ok, result.message).toBe(true);
      const data = result.data as { path: string; frames: number };
      expect(data.frames).toBeGreaterThanOrEqual(2);
      expect(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", data.path], { encoding: "utf8" })).toContain("h264");
    } finally {
      await browser.stop();
      await new Promise<void>(done => server.close(() => done()));
      await rm(projectRoot, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  }, 30000);
});
