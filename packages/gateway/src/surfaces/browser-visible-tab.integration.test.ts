import { createServer } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BrowserSurface } from "./browser.js";

// Run under xvfb-run on Linux to exercise actual foreground-tab visibility.
describe.skipIf(process.env["JAIT_BROWSER_INTEGRATION"] !== "1").each(["in-process", "node-bridge"])("visible browser tabs (%s)", runtime => {
  it("follows a visible popup and returns to the original page when it closes", async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "false");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(req.url === "/popup"
        ? '<title>Visible sign in</title><h1>Browser input goes here</h1><button id="close" onclick="window.close()">Finish</button>'
        : '<title>Original page</title><h1>Original page</h1><a id="open" target="_blank" href="/popup">Sign in</a>');
    });
    const browser = new BrowserSurface(`visible-tab-${runtime}`);
    try {
      await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing fixture port");
      await browser.start({ sessionId: "visible-tabs", projectRoot: resolve(import.meta.dirname, "../../../..") });
      await browser.navigate(`http://127.0.0.1:${address.port}`);
      await browser.click("#open");
      await expect.poll(() => browser.describe()).toContain("Visible sign in");
      await browser.click("#close");
      await expect.poll(() => browser.describe()).toContain("Original page");
    } finally {
      await browser.stop();
      await new Promise<void>(done => server.close(() => done()));
      vi.unstubAllEnvs();
    }
  }, 30_000);
});
