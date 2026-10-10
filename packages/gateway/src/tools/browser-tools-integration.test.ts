import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSurface } from "../surfaces/browser.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { ToolRegistry } from "./registry.js";
import { createScreenshotCaptureTool } from "./screenshot-tools.js";
import {
  createBrowserNavigateTool, createBrowserSnapshotTool, createBrowserInspectTool,
  createBrowserInteractionTools,
} from "./browser-tools.js";

// Requires Playwright Chromium: bun run test:tools:browser.
// Exercise both shipping drivers. Fail, rather than skip, if enabled but broken.
describe.skipIf(process.env["JAIT_BROWSER_INTEGRATION"] !== "1").each(["in-process", "node-bridge", "packaged-node-bridge"])(
  "real Chromium browser tools (%s)", (runtime) => {
    let server: Server;
    let url: string;
    let surface: BrowserSurface;
    let tools: ToolRegistry;
    let directory: string;
    const artifacts: string[] = [];
    const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
    beforeAll(async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      directory = await mkdtemp(join(tmpdir(), "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    }, 30_000);
    beforeEach(async () => { await surface.navigate(url); });
    afterEach(async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    });
    afterAll(async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    });

    it("browser.navigate returns the loaded page", async () => {
      expect(await tools.execute("browser.navigate", { url }, context)).toMatchObject({
        ok: true, data: { url, title: "Tool integration fixture", textPreview: expect.stringContaining("Authorized asset inventory") },
      });
    });
    it("browser.snapshot captures real page text and controls", async () => {
      const result = await tools.execute("browser.snapshot", {}, context);
      expect(result).toMatchObject({ ok: true, data: { snapshot: expect.stringContaining("Authorized asset inventory") } });
      expect((result.data as { interactiveElements: unknown[] }).interactiveElements).toContainEqual(expect.objectContaining({ id: "save" }));
    });
    it("browser.inspect diagnoses existing and missing elements", async () => {
      expect(await tools.execute("browser.inspect", { selector: "#save" }, context)).toMatchObject({
        ok: true, data: { target: { found: true, name: "Save" } },
      });
      expect(await tools.execute("browser.inspect", { selector: "#missing" }, context)).toMatchObject({
        ok: true, data: { target: { found: false } },
      });
    });
    it("browser.click changes the DOM and returns the new state", async () => {
      expect(await tools.execute("browser.click", { selector: "button:has-text('Save')" }, context)).toMatchObject({
        ok: true, data: { textPreview: expect.stringContaining("Asset saved") },
      });
    });
    it("browser.type fills the real input", async () => {
      expect((await tools.execute("browser.type", { selector: "#asset", text: "workstation-01" }, context)).ok).toBe(true);
      expect(await tools.execute("browser.inspect", { selector: "#asset" }, context)).toMatchObject({
        ok: true, data: { textPreview: expect.stringContaining("workstation-01") },
      });
    });
    it("browser.select fires change events on a real select", async () => {
      expect(await tools.execute("browser.select", { selector: "#status", value: "owned" }, context)).toMatchObject({
        ok: true, data: { textPreview: expect.stringContaining("owned") },
      });
    });
    it("browser.scroll moves an offscreen target into view", async () => {
      expect(await tools.execute("browser.inspect", { selector: "#footer" }, context)).toMatchObject({ data: { target: { offscreen: true } } });
      expect((await tools.execute("browser.scroll", { x: 0, y: 10000 }, context)).ok).toBe(true);
      expect(await tools.execute("browser.inspect", { selector: "#footer" }, context)).toMatchObject({ data: { target: { offscreen: false } } });
    });
    it("browser.wait finds a real selector and reports timeouts", async () => {
      expect((await tools.execute("browser.wait", { selector: "#save", timeoutMs: 100 }, context)).ok).toBe(true);
      const missing = await tools.execute("browser.wait", { selector: "#missing", timeoutMs: 100 }, context);
      expect(missing.ok).toBe(false);
      expect(missing.message).toMatch(/timeout/i);
    });
    it("screenshot.capture produces a standalone PNG", async () => {
      const path = join(directory, "standalone.png");
      const result = await createScreenshotCaptureTool().execute({ target: url, path, waitMs: 0 }, context);
      expect(result.ok, result.message).toBe(true);
      expect([...(await readFile(path)).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    });
    it("browser.screenshot produces a displayable PNG", async () => {
      const result = await tools.execute("browser.screenshot", { path: join(directory, "fixture.png") }, context);
      expect(result.ok).toBe(true);
      const data = result.data as { result: { path: string } };
      artifacts.push(data.result.path);
      const bytes = await readFile(data.result.path);
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(bytes.length).toBeGreaterThan(1000);
    });
  },
);
