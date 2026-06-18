/**
 * screenshot.capture — standalone headless screenshot tool.
 *
 * Captures a PNG of any URL or local HTML file using Playwright (the same
 * optional dependency the browser surface uses) and returns the saved PNG
 * path. Because the result payload contains an image `path`, the web UI
 * renders it inline as an image (via the existing screenshot body-kind
 * logic) instead of a generic toolcard.
 */

import type { ToolDefinition, ToolResult } from "./contracts.js";

interface ScreenshotCaptureInput {
  /** URL (http/https), "dev" (frontend dev url), or a local HTML file path. */
  target: string;
  /** Output file path. Default: .jait/shots/screenshot-<timestamp>.png */
  path?: string;
  /** Viewport width. Default 1280. */
  width?: number;
  /** Viewport height. Default 800. */
  height?: number;
  /** Emulate a Pixel-5-ish mobile viewport (393x851, DPR 3). */
  mobile?: boolean;
  /** Emulate prefers-color-scheme: dark. */
  dark?: boolean;
  /** Capture the full scrollable page. Default true. */
  fullPage?: boolean;
  /** Crop to the first element matching this CSS selector. */
  selector?: string;
  /** Extra settle delay (ms) after load. Default 500. */
  waitMs?: number;
  /** Wait for a selector to be visible before capturing. */
  waitForSelector?: string;
  /** Click an element before capturing (repeatable). */
  click?: string[];
  /** Fill `selector:text` pairs before capturing (repeatable). */
  fill?: string[];
}

const FRONTEND_URL = process.env["FRONTEND_URL"] ?? "http://localhost:3100";

export function createScreenshotCaptureTool(): ToolDefinition<ScreenshotCaptureInput> {
  return {
    name: "screenshot.capture",
    description:
      "Capture a headless browser screenshot (PNG) of a URL, local HTML file, or the running dev frontend ('dev') and return the saved PNG path. The image renders inline in chat. Use this to visually show the user UI state, designs, or layout issues.",
    tier: "standard",
    category: "screen",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "URL (http/https), the literal 'dev' (the frontend dev server), or a local HTML file path.",
        },
        path: { type: "string", description: "Optional output PNG path. Defaults to .jait/shots/screenshot-<timestamp>.png" },
        width: { type: "number", description: "Viewport width (default 1280)" },
        height: { type: "number", description: "Viewport height (default 800)" },
        mobile: { type: "boolean", description: "Pixel-5-ish mobile viewport (393x851, DPR 3)" },
        dark: { type: "boolean", description: "Emulate prefers-color-scheme: dark" },
        fullPage: { type: "boolean", description: "Capture the full scrollable page (default true)" },
        selector: { type: "string", description: "Crop to the first element matching this CSS selector" },
        waitMs: { type: "number", description: "Extra settle delay in ms after load (default 500)" },
        waitForSelector: { type: "string", description: "CSS selector to wait for (visible) before capturing" },
        click: {
          type: "array",
          items: { type: "string", description: "CSS selector to click before capturing" },
          description: "Click these elements before capturing (in order).",
        },
        fill: {
          type: "array",
          items: { type: "string", description: "'selector:text' pair" },
          description: "Fill inputs before capturing. Each item is 'cssSelector:text'.",
        },
      },
      required: ["target"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };

      const outPath = resolveOutPath(input.path);
      const url = resolveTarget(input.target, context.projectRoot);
      const width = input.mobile ? 393 : Number(input.width ?? 1280);
      const height = input.mobile ? 851 : Number(input.height ?? 800);
      const deviceScaleFactor = input.mobile ? 3 : 2;
      const fullPage = input.fullPage !== false && !input.selector;

      let chromium: unknown;
      try {
        const loadPlaywright = new Function("return import('playwright')") as () => Promise<unknown>;
        const mod = (await loadPlaywright()) as { chromium?: { launch: () => Promise<unknown> } };
        chromium = mod.chromium;
        if (!chromium) throw new Error("chromium not found in playwright module");
      } catch (err) {
        return {
          ok: false,
          message: `Playwright unavailable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Ensure output directory exists
      const fs = await import("node:fs");
      const pathMod = await import("node:path");
      fs.mkdirSync(pathMod.dirname(outPath), { recursive: true });

      let browser: { close: () => Promise<void> } | null = null;
      try {
        browser = (await (chromium as { launch: () => Promise<unknown> }).launch()) as { close: () => Promise<void> };
        const ctx = await (browser as unknown as {
          newContext: (opts: unknown) => Promise<{
            newPage: () => Promise<{
              goto: (u: string, opts: unknown) => Promise<unknown>;
              waitForSelector: (s: string, opts: unknown) => Promise<unknown>;
              locator: (s: string) => { first: () => { click: (o: unknown) => Promise<unknown>; fill: (t: string, o: unknown) => Promise<unknown>; waitFor: (o: unknown) => Promise<unknown>; screenshot: (o: unknown) => Promise<void> } };
              waitForTimeout: (ms: number) => Promise<void>;
              addInitScript: (fn: () => void) => Promise<void>;
              keyboard: { type: (t: string) => Promise<void> };
              screenshot: (o: unknown) => Promise<void>;
            }>;
          }>;
        }).newContext({
          viewport: { width, height },
          deviceScaleFactor,
          colorScheme: input.dark ? "dark" : "light",
        });

        const page = await ctx.newPage();

        if (input.dark) {
          await (page as unknown as { addInitScript: (s: string) => Promise<void> }).addInitScript("document.documentElement.classList.add('dark')");
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        if (input.waitForSelector) {
          await page.waitForSelector(input.waitForSelector, { state: "visible", timeout: 30000 });
        }

        for (const sel of arrayify(input.click)) {
          await page.locator(sel).first().click({ timeout: 10000 }).catch((e: Error) => {
            /* best-effort */
            void e;
          });
        }
        for (const pair of arrayify(input.fill)) {
          const [sel, text] = splitPair(pair);
          if (sel) {
            await page.locator(sel).first().fill(text, { timeout: 10000 }).catch((e: Error) => {
              void e;
            });
          }
        }

        await page.waitForTimeout(Number(input.waitMs ?? 500));

        if (input.selector) {
          const el = page.locator(input.selector).first();
          await el.waitFor({ state: "visible", timeout: 30000 });
          await el.screenshot({ path: outPath });
        } else {
          await page.screenshot({ path: outPath, fullPage });
        }

        return {
          ok: true,
          message: `Screenshot saved to ${outPath}`,
          data: { path: outPath, target: input.target, url, width, height, mobile: Boolean(input.mobile) },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `Screenshot failed: ${message}`, data: { target: input.target, url } };
      } finally {
        try { await browser?.close(); } catch { /* ignore */ }
      }
    },
  };
}

function resolveTarget(target: string, projectRoot: string): string {
  const t = target.trim();
  if (t === "dev") return FRONTEND_URL;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("file://")) return t;
  const fs = require("node:fs");
  const pathMod = require("node:path");
  const abs = pathMod.isAbsolute(t) ? t : pathMod.resolve(projectRoot, t);
  if (!fs.existsSync(abs)) throw new Error(`target not found: ${t} (resolved ${abs})`);
  return "file://" + abs;
}

function resolveOutPath(inputPath: string | undefined): string {
  const pathMod = require("node:path");
  if (inputPath && inputPath.trim()) {
    const resolved = pathMod.isAbsolute(inputPath) ? inputPath : pathMod.resolve(process.cwd(), inputPath);
    if (!resolved.endsWith(".png")) return `${resolved}.png`;
    return resolved;
  }
  const dir = pathMod.resolve(process.cwd(), ".jait", "shots");
  return pathMod.join(dir, `screenshot-${timestamp()}.png`);
}

function arrayify<T>(value: T[] | T | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function splitPair(s: string): [string, string] {
  const i = s.indexOf(":");
  return i < 0 ? ["", s] : [s.slice(0, i), s.slice(i + 1)];
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}