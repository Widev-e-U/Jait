import type {
  Surface,
  SurfaceStartInput,
  SurfaceState,
  SurfaceStopInput,
  SurfaceSnapshot,
} from "./contracts.js";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

declare const window: any;
declare const document: any;
declare const CSS: any;

export interface BrowserInteractiveElement {
  role?: string;
  name?: string;
  text?: string;
  selector?: string;
}

export interface BrowserPageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: BrowserInteractiveElement[];
}

export interface BrowserDriver {
  navigate(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  typeText(selector: string, text: string): Promise<void>;
  scroll(x: number, y: number): Promise<void>;
  select(selector: string, value: string): Promise<void>;
  waitFor(selector: string, timeoutMs: number): Promise<void>;
  screenshot(path?: string): Promise<string>;
  snapshot(): Promise<BrowserPageSnapshot>;
  close(): Promise<void>;
}

export interface BrowserSurfaceOptions {
  driverFactory?: () => Promise<BrowserDriver>;
}

export class BrowserSurface implements Surface {
  readonly type = "browser" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private _lastUrl = "";
  private _lastTitle = "";
  private _actionCount = 0;
  private driver: BrowserDriver | null = null;

  onOutput?: (data: string) => void;
  onStateChange?: (state: SurfaceState) => void;

  constructor(
    public readonly id: string,
    private readonly options: BrowserSurfaceOptions = {},
  ) {}

  get state(): SurfaceState {
    return this._state;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  async start(input: SurfaceStartInput): Promise<void> {
    if (this._state === "running") return;
    this._setState("starting");
    this._sessionId = input.sessionId;
    this._startedAt = new Date().toISOString();

    try {
      const factory = this.options.driverFactory ?? createPlaywrightDriver;
      this.driver = await factory();
      this._setState("running");
    } catch (err) {
      this._setState("error");
      throw err;
    }
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    this._setState("stopping");
    await this.driver?.close();
    this.driver = null;
    this._setState("stopped");
  }

  snapshot(): SurfaceSnapshot {
    return {
      id: this.id,
      type: this.type,
      state: this._state,
      sessionId: this._sessionId ?? "",
      startedAt: this._startedAt ?? undefined,
      metadata: {
        currentUrl: this._lastUrl || null,
        title: this._lastTitle || null,
        actionCount: this._actionCount,
      },
    };
  }

  async navigate(url: string): Promise<BrowserPageSnapshot> {
    const driver = this.requireDriver();
    await driver.navigate(url);
    this._actionCount++;
    const snap = await driver.snapshot();
    this.captureSnapshotMeta(snap);
    this.onOutput?.(`navigate ${snap.url}`);
    return snap;
  }

  async describe(): Promise<string> {
    const snap = await this.requireDriver().snapshot();
    this.captureSnapshotMeta(snap);
    const lines = [
      `URL: ${snap.url}`,
      `Title: ${snap.title || "(untitled)"}`,
      "",
      "Text:",
      snap.text.trim() || "(no textual content)",
      "",
      "Interactive elements:",
      ...snap.elements.slice(0, 30).map((el, i) => {
        const parts = [el.role ?? "element", el.name, el.text].filter(Boolean).join(" — ");
        return `${i + 1}. ${parts || "unnamed"}${el.selector ? ` [${el.selector}]` : ""}`;
      }),
    ];
    return lines.join("\n").trim();
  }

  async click(selector: string): Promise<void> {
    await this.requireDriver().click(selector);
    this._actionCount++;
  }

  async typeText(selector: string, text: string): Promise<void> {
    await this.requireDriver().typeText(selector, text);
    this._actionCount++;
  }

  async scroll(x: number, y: number): Promise<void> {
    await this.requireDriver().scroll(x, y);
    this._actionCount++;
  }

  async select(selector: string, value: string): Promise<void> {
    await this.requireDriver().select(selector, value);
    this._actionCount++;
  }

  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    await this.requireDriver().waitFor(selector, timeoutMs);
    this._actionCount++;
  }

  async screenshot(path?: string): Promise<string> {
    this._actionCount++;
    return this.requireDriver().screenshot(path);
  }

  private captureSnapshotMeta(snap: BrowserPageSnapshot): void {
    this._lastUrl = snap.url;
    this._lastTitle = snap.title;
  }

  private requireDriver(): BrowserDriver {
    if (!this.driver || this._state !== "running") {
      throw new Error("Browser surface is not running");
    }
    return this.driver;
  }

  private _setState(next: SurfaceState): void {
    this._state = next;
    this.onStateChange?.(next);
  }
}

export class BrowserSurfaceFactory {
  readonly type = "browser" as const;

  constructor(private readonly options: BrowserSurfaceOptions = {}) {}

  create(id: string): BrowserSurface {
    return new BrowserSurface(id, this.options);
  }
}

async function createPlaywrightDriver(): Promise<BrowserDriver> {
  // Optional runtime dependency: keep static imports out so gateway can still
  // boot in environments that do not need browser automation.
  const loadPlaywright = new Function("return import('playwright')") as () => Promise<unknown>;

  let mod: unknown;
  try {
    mod = await loadPlaywright();
  } catch {
    throw new Error(
      "Playwright is not installed. Install it in @jait/gateway: `bun add playwright --cwd packages/gateway`",
    );
  }

  const chromium = (mod as { chromium?: { launch: (opts: Record<string, unknown>) => Promise<unknown> } }).chromium;
  if (!chromium) {
    throw new Error("Failed to load Playwright chromium driver.");
  }

  const browser = await chromium.launch({
    headless: process.env["BROWSER_HEADLESS"] !== "false",
  }) as {
    newContext: (opts: Record<string, unknown>) => Promise<{
      newPage: () => Promise<{
        goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
        click: (selector: string) => Promise<void>;
        fill: (selector: string, text: string) => Promise<void>;
        evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
        waitForSelector: (selector: string, opts?: Record<string, unknown>) => Promise<unknown>;
        screenshot: (opts?: Record<string, unknown>) => Promise<unknown>;
      }>;
      close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
  };

  const context = await browser.newContext({
    ignoreHTTPSErrors: process.env["BROWSER_IGNORE_HTTPS_ERRORS"] === "true",
  });
  const page = await context.newPage();

  const driver: BrowserDriver = {
    async navigate(url: string) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    },
    async click(selector: string) {
      await page.click(selector);
    },
    async typeText(selector: string, text: string) {
      await page.fill(selector, text);
    },
    async scroll(x: number, y: number) {
      await page.evaluate(
        ([targetX, targetY]: [number, number]) => window.scrollTo(targetX, targetY),
        [x, y],
      );
    },
    async select(selector: string, value: string) {
      const selectPage = page as {
        selectOption?: (s: string, v: string) => Promise<unknown>;
      };
      if (!selectPage.selectOption) {
        throw new Error("Browser driver does not support selectOption.");
      }
      await selectPage.selectOption(selector, value);
    },
    async waitFor(selector: string, timeoutMs: number) {
      await page.waitForSelector(selector, { timeout: timeoutMs });
    },
    async screenshot(path?: string) {
      const outPath = path
        ? resolve(path)
        : resolve(process.cwd(), "artifacts", `browser-${Date.now()}.png`);
      await mkdir(dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath, fullPage: true });
      return outPath;
    },
    async snapshot() {
      return page.evaluate(() => {
        const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
        const bodyText = normalize(document.body?.innerText ?? "").slice(0, 12_000);
        const title = document.title || "(untitled)";
        const esc = (raw: string) => {
          if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(raw);
          return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
        };

        const rawElements = Array.from(
          document.querySelectorAll("a, button, input, textarea, select, [role], [onclick], [tabindex]"),
        ) as any[];
        const limited = rawElements.slice(0, 60);

        const elements = limited.map((el: any) => {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute("role") ?? tag;
          const name =
            el.getAttribute("aria-label") ??
            el.getAttribute("name") ??
            el.getAttribute("title") ??
            el.getAttribute("placeholder") ??
            el.innerText?.trim() ??
            "";
          const text = el.innerText?.trim() ?? "";
          const id = el.getAttribute("id");
          const testId = el.getAttribute("data-testid");
          const selector = id
            ? `#${esc(id)}`
            : testId
              ? `${tag}[data-testid="${testId}"]`
              : `${tag}${el.getAttribute("name") ? `[name="${el.getAttribute("name")}"]` : ""}`;
          return {
            role,
            name: normalize(name).slice(0, 200),
            text: normalize(text).slice(0, 200),
            selector,
          };
        });

        return {
          url: window.location.href,
          title,
          text: bodyText,
          elements,
        };
      }) as Promise<BrowserPageSnapshot>;
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };

  return driver;
}
