import type {
  Surface,
  SurfaceStartInput,
  SurfaceState,
  SurfaceStopInput,
  SurfaceSnapshot,
} from "./contracts.js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

declare const window: any;
declare const document: any;
declare const CSS: any;
declare const Element: any;

export interface BrowserInteractiveElement {
  role?: string;
  name?: string;
  text?: string;
  selector?: string;
  selectors?: BrowserSelectorSuggestion[];
  tagName?: string;
  placeholder?: string;
  testId?: string;
  id?: string;
  disabled?: boolean;
  selected?: boolean;
  active?: boolean;
  value?: string;
}

export interface BrowserSelectorSuggestion {
  kind: "role" | "name" | "placeholder" | "testId" | "id" | "css";
  value: string;
  selector: string;
}

export interface BrowserActiveElement extends BrowserInteractiveElement {
  type?: string;
  readOnly?: boolean;
  isContentEditable?: boolean;
}

export interface BrowserDialogPresence extends BrowserInteractiveElement {
  title?: string;
  ariaModal?: boolean;
  open?: boolean;
}

export interface BrowserObstructionElement {
  role?: string;
  tagName?: string;
  text?: string;
  selector?: string;
  selectors?: BrowserSelectorSuggestion[];
  reason: string;
  zIndex?: number;
}

export interface BrowserObstructionDiagnostics {
  hasModal: boolean;
  dialogCount: number;
  activeDialogTitle?: string | null;
  topLayer: BrowserObstructionElement[];
  notes: string[];
}

export interface BrowserTargetDiagnostics extends BrowserInteractiveElement {
  selector: string;
  found: boolean;
  offscreen?: boolean;
  obscured?: boolean;
  obstructionReason?: string;
  interceptedBy?: BrowserObstructionElement | null;
  inDialog?: boolean;
  dialogTitle?: string | null;
}

export interface BrowserPageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: BrowserInteractiveElement[];
  activeElement?: BrowserActiveElement | null;
  dialogs?: BrowserDialogPresence[];
  obstruction?: BrowserObstructionDiagnostics;
}

export interface BrowserRuntimeEvent {
  id: number;
  timestamp: string;
  type: "console" | "pageerror" | "requestfailed" | "response";
  level?: string;
  text?: string;
  url?: string;
  method?: string;
  status?: number;
}

export interface BrowserPerformanceMetrics {
  sampledAt: string;
  url: string;
  title: string;
  navigation?: {
    type?: string;
    domContentLoadedMs?: number | null;
    loadMs?: number | null;
    transferSize?: number | null;
    encodedBodySize?: number | null;
    decodedBodySize?: number | null;
  } | null;
  paint?: {
    firstPaintMs?: number | null;
    firstContentfulPaintMs?: number | null;
  } | null;
  webVitals?: {
    lcpMs?: number | null;
    cls?: number | null;
    inpMs?: number | null;
  } | null;
  resources?: {
    total?: number;
    scripts?: number;
    stylesheets?: number;
    images?: number;
    fonts?: number;
    largestTransferSize?: number | null;
  } | null;
  memory?: {
    usedJsHeapSize?: number | null;
    totalJsHeapSize?: number | null;
    jsHeapSizeLimit?: number | null;
  } | null;
}

export interface BrowserDriver {
  navigate(url: string, signal?: AbortSignal): Promise<void>;
  click(selector: string, signal?: AbortSignal): Promise<void>;
  typeText(selector: string, text: string, signal?: AbortSignal): Promise<void>;
  scroll(x: number, y: number, signal?: AbortSignal): Promise<void>;
  select(selector: string, value: string, signal?: AbortSignal): Promise<void>;
  waitFor(selector: string, timeoutMs: number, signal?: AbortSignal): Promise<void>;
  screenshot(path?: string, signal?: AbortSignal): Promise<string>;
  snapshot(signal?: AbortSignal): Promise<BrowserPageSnapshot>;
  diagnose(selector: string, signal?: AbortSignal): Promise<BrowserTargetDiagnostics>;
  getMetrics(signal?: AbortSignal): Promise<BrowserPerformanceMetrics>;
  getEvents(): BrowserRuntimeEvent[];
  close(): Promise<void>;
  liveView?: {
    display: string;
    vncPort: number;
    websockifyPort: number;
    novncUrl: string;
  };
}

export interface BrowserSurfaceOptions {
  driverFactory?: (input: SurfaceStartInput) => Promise<BrowserDriver>;
}

type PlaywrightBrowser = {
  contexts?: () => Array<{
    newPage: () => Promise<{
      goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
      click: (selector: string) => Promise<void>;
      fill: (selector: string, text: string) => Promise<void>;
      evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
      waitForSelector: (selector: string, opts?: Record<string, unknown>) => Promise<unknown>;
      screenshot: (opts?: Record<string, unknown>) => Promise<unknown>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      url?: () => string;
    }>;
    close: () => Promise<void>;
  }>;
  newContext: (opts: Record<string, unknown>) => Promise<{
    newPage: () => Promise<{
      goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
      click: (selector: string) => Promise<void>;
      fill: (selector: string, text: string) => Promise<void>;
      evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
      waitForSelector: (selector: string, opts?: Record<string, unknown>) => Promise<unknown>;
      screenshot: (opts?: Record<string, unknown>) => Promise<unknown>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      url?: () => string;
    }>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

type PlaywrightChromium = {
  launch: (opts: Record<string, unknown>) => Promise<PlaywrightBrowser>;
  connectOverCDP?: (endpointURL: string) => Promise<PlaywrightBrowser>;
};

interface BrowserLaunchStrategy {
  label: string;
  options: Record<string, unknown>;
}

interface NodeBridgeResponse {
  id: number | null;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface NodeBridgeEvent {
  event: "ready" | "fatal" | "runtime";
  strategy?: string;
  error?: string;
  payload?: BrowserRuntimeEvent;
}

const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS = 45_000;
const DEFAULT_NODE_BRIDGE_READY_TIMEOUT_MS = 60_000;
const DEFAULT_NODE_BRIDGE_COMMAND_TIMEOUT_MS = 60_000;
const MAX_BROWSER_RUNTIME_EVENTS = 200;

function pushBrowserRuntimeEvent(
  events: BrowserRuntimeEvent[],
  next: Omit<BrowserRuntimeEvent, "id" | "timestamp">,
): void {
  const previousId = events[events.length - 1]?.id ?? 0;
  events.push({
    id: previousId + 1,
    timestamp: new Date().toISOString(),
    ...next,
  });
  if (events.length > MAX_BROWSER_RUNTIME_EVENTS) {
    events.splice(0, events.length - MAX_BROWSER_RUNTIME_EVENTS);
  }
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
      this.driver = await factory(input);
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

  getLiveViewInfo(): { display: string; vncPort: number; websockifyPort: number; novncUrl: string } | null {
    return this.driver?.liveView ?? null;
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

  async navigate(url: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    const driver = this.requireDriver();
    await driver.navigate(url, signal);
    this._actionCount++;
    const snap = await driver.snapshot(signal);
    this.captureSnapshotMeta(snap);
    this.onOutput?.(`navigate ${snap.url}`);
    return snap;
  }

  async describe(signal?: AbortSignal): Promise<string> {
    const snap = await this.requireDriver().snapshot(signal);
    this.captureSnapshotMeta(snap);
    const lines = [
      `URL: ${snap.url}`,
      `Title: ${snap.title || "(untitled)"}`,
      snap.activeElement
        ? `Active element: ${[
          snap.activeElement.role ?? snap.activeElement.tagName ?? "element",
          snap.activeElement.name,
          snap.activeElement.selector,
        ].filter(Boolean).join(" — ")}`
        : "Active element: (none)",
      snap.dialogs?.length
        ? `Dialogs: ${snap.dialogs.map((dialog) => dialog.title || dialog.name || dialog.selector || dialog.role || "dialog").join(", ")}`
        : "Dialogs: (none)",
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

  async inspect(selector?: string, signal?: AbortSignal): Promise<{
    snapshot: BrowserPageSnapshot;
    target?: BrowserTargetDiagnostics;
    metrics: BrowserPerformanceMetrics;
  }> {
    const driver = this.requireDriver();
    const snapshot = await driver.snapshot(signal);
    this.captureSnapshotMeta(snapshot);
    const target = selector ? await driver.diagnose(selector, signal) : undefined;
    const metrics = await driver.getMetrics(signal);
    return { snapshot, target, metrics };
  }

  async click(selector: string, signal?: AbortSignal): Promise<void> {
    try {
      await this.requireDriver().click(selector, signal);
    } catch (err) {
      const diagnostics = await this.tryDiagnose(selector, signal);
      throw enrichBrowserActionError("click", selector, err, diagnostics);
    }
    this._actionCount++;
  }

  async typeText(selector: string, text: string, signal?: AbortSignal): Promise<void> {
    await this.requireDriver().typeText(selector, text, signal);
    this._actionCount++;
  }

  async scroll(x: number, y: number, signal?: AbortSignal): Promise<void> {
    await this.requireDriver().scroll(x, y, signal);
    this._actionCount++;
  }

  async select(selector: string, value: string, signal?: AbortSignal): Promise<void> {
    await this.requireDriver().select(selector, value, signal);
    this._actionCount++;
  }

  async waitFor(selector: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    await this.requireDriver().waitFor(selector, timeoutMs, signal);
    this._actionCount++;
  }

  async screenshot(path?: string, signal?: AbortSignal): Promise<string> {
    this._actionCount++;
    return this.requireDriver().screenshot(path, signal);
  }

  async getMetrics(signal?: AbortSignal): Promise<BrowserPerformanceMetrics> {
    return this.requireDriver().getMetrics(signal);
  }

  getEvents(): BrowserRuntimeEvent[] {
    return this.requireDriver().getEvents();
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

  private async tryDiagnose(
    selector: string,
    signal?: AbortSignal,
  ): Promise<BrowserTargetDiagnostics | null> {
    try {
      return await this.requireDriver().diagnose(selector, signal);
    } catch {
      return null;
    }
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

async function createPlaywrightDriver(input: SurfaceStartInput): Promise<BrowserDriver> {
  const runtime = resolveBrowserRuntimeMode();
  if (runtime === "node-bridge") {
    return createNodeBridgePlaywrightDriver();
  }

  try {
    return await createInProcessPlaywrightDriver(input);
  } catch (err) {
    if (runtime === "auto" && isBunWindowsRuntime() && shouldFallbackToNodeBridge(err)) {
      return createNodeBridgePlaywrightDriver();
    }
    throw err;
  }
}

type BrowserRuntimeMode = "auto" | "in-process" | "node-bridge";

function resolveBrowserRuntimeMode(): BrowserRuntimeMode {
  const configured = process.env["BROWSER_RUNTIME"]?.trim().toLowerCase();
  if (configured === "in-process") return "in-process";
  if (configured === "node" || configured === "node-bridge") return "node-bridge";
  if (isBunWindowsRuntime()) return "node-bridge";
  return "auto";
}

function isBunWindowsRuntime(): boolean {
  return process.platform === "win32" && Boolean(process.versions.bun);
}

function shouldFallbackToNodeBridge(err: unknown): boolean {
  const message = extractErrorMessage(err).toLowerCase();
  return message.includes("launch: timeout")
    || message.includes("playwright browser launch failed")
    || message.includes("failed to create playwright browser context");
}

async function connectOrLaunchBrowser(
  chromium: PlaywrightChromium,
  liveViewSession: Awaited<ReturnType<typeof import("../services/live-view-manager.js").startLiveView>> | null,
  headless: boolean,
): Promise<PlaywrightBrowser> {
  if (liveViewSession?.kind === "container" && liveViewSession.cdpUrl) {
    if (!chromium.connectOverCDP) {
      throw new Error("Current Playwright runtime does not support connectOverCDP.");
    }
    return await chromium.connectOverCDP(liveViewSession.cdpUrl);
  }

  const launchTimeoutMs = parsePositiveIntegerEnv(
    process.env["BROWSER_LAUNCH_TIMEOUT_MS"],
    DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS,
  );
  const launchStrategies = buildBrowserLaunchStrategies(headless, launchTimeoutMs);
  return await launchBrowserWithFallback(chromium, launchStrategies);
}

function rewritePublicUrlForContainerBrowser(
  url: string,
  liveViewSession: Awaited<ReturnType<typeof import("../services/live-view-manager.js").startLiveView>> | null,
): string {
  if (liveViewSession?.kind !== "container") return url;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return url;
    if (!["127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"].includes(parsed.hostname)) return url;
    parsed.hostname = "host.docker.internal";
    return parsed.toString();
  } catch {
    return url;
  }
}

function rewriteContainerBrowserUrlToPublic(
  url: string | undefined,
  liveViewSession: Awaited<ReturnType<typeof import("../services/live-view-manager.js").startLiveView>> | null,
): string | undefined {
  if (!url || liveViewSession?.kind !== "container") return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "host.docker.internal") return url;
    parsed.hostname = "127.0.0.1";
    return parsed.toString();
  } catch {
    return url;
  }
}

async function createInProcessPlaywrightDriver(input: SurfaceStartInput): Promise<BrowserDriver> {
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

  const chromium = (mod as { chromium?: PlaywrightChromium }).chromium;
  if (!chromium) {
    throw new Error("Failed to load Playwright chromium driver.");
  }

  // Start Xvfb + VNC so users can watch the agent's browser in real time via noVNC.
  // Disabled only when BROWSER_LIVE_VIEW is explicitly set to "false".
  const enableLiveView = process.env["BROWSER_LIVE_VIEW"] !== "false";
  let liveViewSession: Awaited<ReturnType<typeof import("../services/live-view-manager.js").startLiveView>> | null = null;

  if (enableLiveView) {
    try {
      const { startLiveView } = await import("../services/live-view-manager.js");
      liveViewSession = await startLiveView({ workspaceRoot: input.workspaceRoot });
      if (liveViewSession.kind === "host") {
        process.env["DISPLAY"] = liveViewSession.display;
      }
    } catch {
      // Docker or host live-view dependencies unavailable — fall back to headless
      liveViewSession = null;
    }
  }

  const headless = liveViewSession ? false : process.env["BROWSER_HEADLESS"] !== "false";
  if (liveViewSession?.kind === "container") {
    return createNodeBridgePlaywrightDriver(liveViewSession);
  }

  const browser = await connectOrLaunchBrowser(chromium, liveViewSession, headless);

  let context: Awaited<ReturnType<PlaywrightBrowser["newContext"]>> | null = null;
  let page: Awaited<ReturnType<Awaited<ReturnType<PlaywrightBrowser["newContext"]>>["newPage"]>> | null = null;
  try {
    const connectedContexts = browser.contexts?.() ?? [];
    if (connectedContexts.length > 0) {
      context = connectedContexts[0] as Awaited<ReturnType<PlaywrightBrowser["newContext"]>>;
    } else {
      context = await browser.newContext({
        ignoreHTTPSErrors: process.env["BROWSER_IGNORE_HTTPS_ERRORS"] === "true",
      });
    }
    page = await context.newPage();
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
  if (!context || !page) {
    await browser.close().catch(() => {});
    throw new Error("Failed to create Playwright browser context.");
  }
  const activeContext = context;
  const activePage = page;
  const events: BrowserRuntimeEvent[] = [];

  activePage.on?.("console", (msg: any) => {
    const level = typeof msg?.type === "function" ? msg.type() : String(msg?.type ?? "log");
    const text = typeof msg?.text === "function" ? msg.text() : String(msg?.text ?? "");
    pushBrowserRuntimeEvent(events, { type: "console", level, text });
  });
  activePage.on?.("pageerror", (err: Error) => {
    pushBrowserRuntimeEvent(events, {
      type: "pageerror",
      level: "error",
      text: err?.message ?? String(err),
    });
  });
  activePage.on?.("requestfailed", (request: any) => {
    pushBrowserRuntimeEvent(events, {
      type: "requestfailed",
      level: "error",
      text: request?.failure?.()?.errorText ?? "Request failed",
      url: rewriteContainerBrowserUrlToPublic(request?.url?.(), liveViewSession),
      method: request?.method?.(),
    });
  });
  activePage.on?.("response", (response: any) => {
    const status = typeof response?.status === "function" ? response.status() : undefined;
    if (typeof status !== "number") return;
    const request = response.request?.();
    pushBrowserRuntimeEvent(events, {
      type: "response",
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      text: `HTTP ${status}`,
      url: rewriteContainerBrowserUrlToPublic(response.url?.(), liveViewSession),
      method: request?.method?.(),
      status,
    });
  });

  /**
   * Race a Playwright page operation against an AbortSignal.
   * If the signal fires, we call `window.stop()` on the page (cancels in-flight
   * network requests and navigation) and reject with "Cancelled".
   */
  function withSignal<T>(op: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return op;
    if (signal.aborted) return Promise.reject(new Error("Cancelled"));
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        // Stop the page's in-flight navigation / network requests
        activePage.evaluate(() => window.stop()).catch(() => { /* page may be gone */ });
        reject(new Error("Cancelled"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      op.then(
        (v) => { if (!settled) { settled = true; signal.removeEventListener("abort", onAbort); resolve(v); } },
        (e) => { if (!settled) { settled = true; signal.removeEventListener("abort", onAbort); reject(e); } },
      );
    });
  }

  const driver: BrowserDriver = {
    async navigate(url: string, signal?: AbortSignal) {
      await withSignal(
        activePage.goto(rewritePublicUrlForContainerBrowser(url, liveViewSession), { waitUntil: "domcontentloaded", timeout: 30_000 }),
        signal,
      );
    },
    async click(selector: string, signal?: AbortSignal) {
      await withSignal(activePage.click(selector), signal);
    },
    async typeText(selector: string, text: string, signal?: AbortSignal) {
      await withSignal(activePage.fill(selector, text), signal);
    },
    async scroll(x: number, y: number, signal?: AbortSignal) {
      await withSignal(
        activePage.evaluate(
          ([targetX, targetY]: [number, number]) => window.scrollTo(targetX, targetY),
          [x, y],
        ),
        signal,
      );
    },
    async select(selector: string, value: string, signal?: AbortSignal) {
      const selectPage = activePage as {
        selectOption?: (s: string, v: string) => Promise<unknown>;
      };
      if (!selectPage.selectOption) {
        throw new Error("Browser driver does not support selectOption.");
      }
      await withSignal(selectPage.selectOption(selector, value), signal);
    },
    async waitFor(selector: string, timeoutMs: number, signal?: AbortSignal) {
      await withSignal(activePage.waitForSelector(selector, { timeout: timeoutMs }), signal);
    },
    async screenshot(path?: string, signal?: AbortSignal) {
      const outPath = path
        ? resolve(path)
        : resolve(process.cwd(), "artifacts", `browser-${Date.now()}.png`);
      await mkdir(dirname(outPath), { recursive: true });
      await withSignal(activePage.screenshot({ path: outPath, fullPage: true }), signal);
      return outPath;
    },
    async snapshot(signal?: AbortSignal) {
      const snapshot = await withSignal(activePage.evaluate(() => {
        const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
        const bodyText = normalize(document.body?.innerText ?? "").slice(0, 12_000);
        const title = document.title || "(untitled)";
        const esc = (raw: string) => {
          if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(raw);
          return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
        };
        const isVisible = (el: any) => {
          if (!el || !(el instanceof Element)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const guessRole = (el: any, tag: string) =>
          el.getAttribute("role")
          ?? (tag === "a" ? "link" : tag === "input" ? (el.type === "checkbox" ? "checkbox" : "textbox") : tag);
        const getName = (el: any) => normalize(
          el.getAttribute("aria-label")
            ?? el.getAttribute("aria-labelledby")
            ?? el.getAttribute("name")
            ?? el.getAttribute("title")
            ?? el.getAttribute("placeholder")
            ?? el.innerText
            ?? el.textContent
            ?? "",
        ).slice(0, 200);
        const buildSelectors = (el: any, tag: string, role: string, name: string) => {
          const suggestions: Array<{ kind: "role" | "name" | "placeholder" | "testId" | "id" | "css"; value: string; selector: string }> = [];
          const push = (kind: "role" | "name" | "placeholder" | "testId" | "id" | "css", value: string, selector: string) => {
            if (!value || !selector || suggestions.some((item) => item.selector === selector)) return;
            suggestions.push({ kind, value: normalize(value).slice(0, 200), selector });
          };
          const id = el.getAttribute("id");
          const testId = el.getAttribute("data-testid");
          const placeholder = el.getAttribute("placeholder");
          const fieldName = el.getAttribute("name");
          if (role && name) push("role", `${role}:${name}`, `role=${role}[name="${name.replace(/"/g, '\\"')}"]`);
          if (fieldName) push("name", fieldName, `${tag}[name="${fieldName.replace(/"/g, '\\"')}"]`);
          if (placeholder) push("placeholder", placeholder, `placeholder=${placeholder.replace(/"/g, '\\"')}`);
          if (testId) push("testId", testId, `[data-testid="${testId.replace(/"/g, '\\"')}"]`);
          if (id) push("id", id, `#${esc(id)}`);
          const css = id
            ? `#${esc(id)}`
            : testId
              ? `${tag}[data-testid="${testId.replace(/"/g, '\\"')}"]`
              : `${tag}${fieldName ? `[name="${fieldName.replace(/"/g, '\\"')}"]` : ""}`;
          push("css", css, css);
          return suggestions;
        };
        const serializeElement = (el: any) => {
          const tag = el.tagName.toLowerCase();
          const role = guessRole(el, tag);
          const name = getName(el);
          const text = normalize(el.innerText ?? el.textContent ?? "").slice(0, 200);
          const id = el.getAttribute("id") ?? undefined;
          const testId = el.getAttribute("data-testid") ?? undefined;
          const placeholder = el.getAttribute("placeholder") ?? undefined;
          const selectors = buildSelectors(el, tag, role, name);
          const selectedValue = tag === "select"
            ? normalize(Array.from(el.selectedOptions ?? []).map((option: any) => option.textContent ?? option.value ?? "").join(", ")).slice(0, 200)
            : role === "tab" || role === "radio" || role === "checkbox"
              ? String(el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true" || el.checked === true)
              : undefined;
          return {
            role,
            name,
            text,
            selector: selectors[0]?.selector ?? undefined,
            selectors,
            tagName: tag,
            placeholder,
            testId,
            id,
            disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
            selected: el.selected === true || el.checked === true || el.getAttribute("aria-selected") === "true",
            active: document.activeElement === el,
            value: selectedValue,
          };
        };

        const rawElements = Array.from(
          document.querySelectorAll("a, button, input, textarea, select, [role], [onclick], [tabindex]"),
        ) as any[];
        const elements = rawElements.filter((el: any) => isVisible(el)).slice(0, 60).map((el: any) => serializeElement(el));
        const activeElement = document.activeElement && document.activeElement !== document.body
          ? {
            ...serializeElement(document.activeElement),
            type: document.activeElement.getAttribute("type") ?? undefined,
            readOnly: document.activeElement.readOnly === true,
            isContentEditable: document.activeElement.isContentEditable === true,
          }
          : null;
        const dialogs = Array.from(document.querySelectorAll("dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true']"))
          .filter((el: any) => isVisible(el))
          .slice(0, 10)
          .map((el: any) => ({
            ...serializeElement(el),
            title: normalize(
              el.getAttribute("aria-label")
                ?? document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent
                ?? el.querySelector("h1, h2, h3, [data-dialog-title]")?.textContent
                ?? el.innerText
                ?? "",
            ).slice(0, 200),
            ariaModal: el.getAttribute("aria-modal") === "true",
            open: el.hasAttribute("open") || el.getAttribute("aria-hidden") !== "true",
          }));
        const topLayer = Array.from(document.querySelectorAll("body *"))
          .filter((el: any) => {
            if (!isVisible(el)) return false;
            const style = window.getComputedStyle(el);
            if (style.pointerEvents === "none") return false;
            if (!(style.position === "fixed" || style.position === "sticky")) return false;
            const rect = el.getBoundingClientRect();
            return rect.width >= window.innerWidth * 0.35 && rect.height >= window.innerHeight * 0.2;
          })
          .slice(0, 6)
          .map((el: any) => {
            const style = window.getComputedStyle(el);
            return {
              ...serializeElement(el),
              reason: dialogs.some((dialog: any) => dialog.selector === buildSelectors(el, el.tagName.toLowerCase(), guessRole(el, el.tagName.toLowerCase()), getName(el))[0]?.selector)
                ? "open dialog"
                : "fixed or sticky overlay",
              zIndex: Number.parseInt(style.zIndex || "0", 10) || 0,
            };
          });

        return {
          url: window.location.href,
          title,
          text: bodyText,
          elements,
          activeElement,
          dialogs,
          obstruction: {
            hasModal: dialogs.some((dialog: any) => dialog.ariaModal),
            dialogCount: dialogs.length,
            activeDialogTitle: dialogs[0]?.title ?? null,
            topLayer,
            notes: [
              dialogs.length > 0 ? `${dialogs.length} dialog(s) visible.` : "No visible dialogs detected.",
              topLayer.length > 0
                ? "Top-layer obstruction diagnostics are heuristic and should be confirmed with a hit test when an action fails."
                : "No likely top-layer blockers detected from static DOM inspection.",
            ],
          },
        };
      }) as Promise<BrowserPageSnapshot>, signal);
      return {
        ...snapshot,
        url: rewriteContainerBrowserUrlToPublic(snapshot.url, liveViewSession) ?? snapshot.url,
      };
    },
    async diagnose(selector: string, signal?: AbortSignal) {
      return withSignal(activePage.evaluate((targetSelector: string) => {
        const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
        const esc = (raw: string) => {
          if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(raw);
          return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
        };
        const buildSelectors = (el: any) => {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute("role") ?? tag;
          const name = normalize(
            el.getAttribute("aria-label")
              ?? el.getAttribute("name")
              ?? el.getAttribute("title")
              ?? el.getAttribute("placeholder")
              ?? el.innerText
              ?? el.textContent
              ?? "",
          ).slice(0, 200);
          const suggestions: Array<{ kind: "role" | "name" | "placeholder" | "testId" | "id" | "css"; value: string; selector: string }> = [];
          const push = (kind: "role" | "name" | "placeholder" | "testId" | "id" | "css", value: string, valueSelector: string) => {
            if (!value || !valueSelector || suggestions.some((item) => item.selector === valueSelector)) return;
            suggestions.push({ kind, value, selector: valueSelector });
          };
          const id = el.getAttribute("id");
          const testId = el.getAttribute("data-testid");
          const placeholder = el.getAttribute("placeholder");
          const fieldName = el.getAttribute("name");
          if (role && name) push("role", `${role}:${name}`, `role=${role}[name="${name.replace(/"/g, '\\"')}"]`);
          if (fieldName) push("name", fieldName, `${tag}[name="${fieldName.replace(/"/g, '\\"')}"]`);
          if (placeholder) push("placeholder", placeholder, `placeholder=${placeholder.replace(/"/g, '\\"')}`);
          if (testId) push("testId", testId, `[data-testid="${testId.replace(/"/g, '\\"')}"]`);
          if (id) push("id", id, `#${esc(id)}`);
          push("css", id ? `#${esc(id)}` : tag, id ? `#${esc(id)}` : tag);
          return suggestions;
        };
        const describeElement = (el: any, reason: string) => ({
          role: el?.getAttribute?.("role") ?? el?.tagName?.toLowerCase?.(),
          tagName: el?.tagName?.toLowerCase?.(),
          text: normalize(el?.innerText ?? el?.textContent ?? "").slice(0, 120),
          selector: buildSelectors(el)[0]?.selector,
          selectors: buildSelectors(el),
          reason,
          zIndex: Number.parseInt(window.getComputedStyle(el).zIndex || "0", 10) || 0,
        });
        const target = document.querySelector(targetSelector) as any;
        if (!target) {
          return { selector: targetSelector, found: false };
        }
        const selectors = buildSelectors(target);
        const rect = target.getBoundingClientRect();
        const centerX = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const centerY = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
        const topElement = document.elementFromPoint(centerX, centerY) as any;
        const intercepted = topElement && topElement !== target && !target.contains(topElement) ? topElement : null;
        const dialog = target.closest("dialog,[role='dialog'],[role='alertdialog'],[aria-modal='true']") as any;
        return {
          found: true,
          role: target.getAttribute("role") ?? target.tagName.toLowerCase(),
          name: normalize(
            target.getAttribute("aria-label")
              ?? target.getAttribute("name")
              ?? target.getAttribute("title")
              ?? target.getAttribute("placeholder")
              ?? target.innerText
              ?? target.textContent
              ?? "",
          ).slice(0, 200),
          text: normalize(target.innerText ?? target.textContent ?? "").slice(0, 200),
          selector: selectors[0]?.selector ?? targetSelector,
          selectors,
          tagName: target.tagName.toLowerCase(),
          disabled: target.disabled === true || target.getAttribute("aria-disabled") === "true",
          offscreen: rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth,
          obscured: Boolean(intercepted),
          obstructionReason: intercepted ? "Another element is receiving pointer hits at the target center point." : undefined,
          interceptedBy: intercepted ? describeElement(intercepted, "hit-test interceptor") : null,
          inDialog: Boolean(dialog),
          dialogTitle: dialog
            ? normalize(
              dialog.getAttribute("aria-label")
                ?? document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent
                ?? dialog.querySelector("h1, h2, h3, [data-dialog-title]")?.textContent
                ?? dialog.innerText
                ?? "",
            ).slice(0, 200)
            : null,
        };
      }, selector) as Promise<BrowserTargetDiagnostics>, signal);
    },
    async getMetrics(signal?: AbortSignal) {
      const metrics = await withSignal(activePage.evaluate(() => {
        const perf = performance as any;
        const navEntries = perf.getEntriesByType("navigation") as any[];
        const nav = navEntries.length > 0 ? navEntries[0] : null;
        const paintEntries = perf.getEntriesByType("paint") as any[];
        const firstPaint = paintEntries.find((entry) => entry.name === "first-paint");
        const firstContentfulPaint = paintEntries.find((entry) => entry.name === "first-contentful-paint");
        const resourceEntries = perf.getEntriesByType("resource") as any[];
        const resources = {
          total: resourceEntries.length,
          scripts: resourceEntries.filter((entry) => entry.initiatorType === "script").length,
          stylesheets: resourceEntries.filter((entry) => entry.initiatorType === "link" || entry.initiatorType === "css").length,
          images: resourceEntries.filter((entry) => entry.initiatorType === "img").length,
          fonts: resourceEntries.filter((entry) => entry.initiatorType === "font").length,
          largestTransferSize: resourceEntries.reduce((max, entry) => Math.max(max, entry.transferSize || 0), 0),
        };

        let lcpMs: number | null = null;
        let cls = 0;
        let inpMs: number | null = null;
        const w = window as Window & {
          __jaitLcpMs?: number;
          __jaitCls?: number;
          __jaitInpMs?: number;
          __jaitMetricsObserversInstalled?: boolean;
        };
        const Observer = (globalThis as { PerformanceObserver?: new (cb: (list: any) => void) => { observe: (options: any) => void } }).PerformanceObserver;
        if (!w.__jaitMetricsObserversInstalled && typeof Observer === "function") {
          try {
            const lcpObserver = new Observer((list: any) => {
              const entries = list.getEntries();
              const last = entries[entries.length - 1];
              if (last) w.__jaitLcpMs = last.startTime;
            });
            lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
          } catch {}
          try {
            const clsObserver = new Observer((list: any) => {
              for (const entry of list.getEntries() as Array<{ value?: number; hadRecentInput?: boolean }>) {
                if (!entry.hadRecentInput) {
                  w.__jaitCls = (w.__jaitCls ?? 0) + (entry.value ?? 0);
                }
              }
            });
            clsObserver.observe({ type: "layout-shift", buffered: true });
          } catch {}
          try {
            const inpObserver = new Observer((list: any) => {
              for (const entry of list.getEntries() as Array<{ duration?: number }>) {
                const duration = entry.duration ?? 0;
                w.__jaitInpMs = Math.max(w.__jaitInpMs ?? 0, duration);
              }
            });
            inpObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
          } catch {}
          w.__jaitMetricsObserversInstalled = true;
        }
        lcpMs = w.__jaitLcpMs ?? null;
        cls = w.__jaitCls ?? 0;
        inpMs = w.__jaitInpMs ?? null;

        const memory = (perf as {
          memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number };
        }).memory;

        return {
          sampledAt: new Date().toISOString(),
          url: window.location.href,
          title: document.title || "(untitled)",
          navigation: nav
            ? {
                type: nav.type,
                domContentLoadedMs: Number.isFinite(nav.domContentLoadedEventEnd) ? nav.domContentLoadedEventEnd : null,
                loadMs: Number.isFinite(nav.loadEventEnd) ? nav.loadEventEnd : null,
                transferSize: nav.transferSize ?? null,
                encodedBodySize: nav.encodedBodySize ?? null,
                decodedBodySize: nav.decodedBodySize ?? null,
              }
            : null,
          paint: {
            firstPaintMs: firstPaint?.startTime ?? null,
            firstContentfulPaintMs: firstContentfulPaint?.startTime ?? null,
          },
          webVitals: {
            lcpMs,
            cls,
            inpMs,
          },
          resources,
          memory: memory
            ? {
                usedJsHeapSize: memory.usedJSHeapSize ?? null,
                totalJsHeapSize: memory.totalJSHeapSize ?? null,
                jsHeapSizeLimit: memory.jsHeapSizeLimit ?? null,
              }
            : null,
        };
      }) as Promise<BrowserPerformanceMetrics>, signal);
      return {
        ...metrics,
        url: rewriteContainerBrowserUrlToPublic(metrics.url, liveViewSession) ?? metrics.url,
      };
    },
    getEvents() {
      return [...events];
    },
    async close() {
      await activeContext.close();
      await browser.close();
      if (liveViewSession) {
        const { stopLiveView } = await import("../services/live-view-manager.js");
        await stopLiveView(liveViewSession);
      }
    },
    liveView: liveViewSession
      ? {
          display: liveViewSession.display,
          vncPort: liveViewSession.vncPort,
          websockifyPort: liveViewSession.websockifyPort,
          novncUrl: liveViewSession.novncUrl,
        }
      : undefined,
  };

  return driver;
}

async function createNodeBridgePlaywrightDriver(
  liveViewSession: Awaited<ReturnType<typeof import("../services/live-view-manager.js").startLiveView>> | null = null,
): Promise<BrowserDriver> {
  const nodeBinary = process.env["BROWSER_NODE_BINARY"]?.trim() || "node";
  const scriptPath = resolveNodeBridgeScriptPath();
  const launchTimeoutMs = parsePositiveIntegerEnv(
    process.env["BROWSER_LAUNCH_TIMEOUT_MS"],
    DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS,
  );
  const readyTimeoutMs = parsePositiveIntegerEnv(
    process.env["BROWSER_NODE_BRIDGE_READY_TIMEOUT_MS"],
    Math.max(DEFAULT_NODE_BRIDGE_READY_TIMEOUT_MS, launchTimeoutMs + 15_000),
  );
  const commandTimeoutMs = parsePositiveIntegerEnv(
    process.env["BROWSER_NODE_BRIDGE_COMMAND_TIMEOUT_MS"],
    DEFAULT_NODE_BRIDGE_COMMAND_TIMEOUT_MS,
  );

  const child = spawn(nodeBinary, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(liveViewSession?.kind === "container" && liveViewSession.cdpUrl
        ? { BROWSER_CDP_URL: liveViewSession.cdpUrl }
        : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const stdout = child.stdout;
  const stderr = child.stderr;
  const stdin = child.stdin;
  if (!stdout || !stderr || !stdin) {
    child.kill();
    throw new Error("Failed to initialize node bridge stdio streams.");
  }

  const stderrChunks: string[] = [];
  stderr.setEncoding("utf8");
  stderr.on("data", (chunk: string) => {
    if (!chunk) return;
    stderrChunks.push(chunk);
    if (stderrChunks.length > 20) stderrChunks.shift();
  });

  type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const pending = new Map<number, PendingRequest>();
  const events: BrowserRuntimeEvent[] = [];
  let nextId = 1;
  let stopped = false;

  let startResolve: (() => void) | null = null;
  let startReject: ((reason?: unknown) => void) | null = null;
  const startPromise = new Promise<void>((resolve, reject) => {
    startResolve = resolve;
    startReject = reject;
  });
  const readyTimer = setTimeout(() => {
    startReject?.(new Error(`Node bridge startup timed out after ${readyTimeoutMs}ms`));
  }, readyTimeoutMs);

  const rejectAllPending = (reason: unknown) => {
    for (const [id, entry] of pending.entries()) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(reason);
    }
  };
  const teardownReason = (prefix: string): Error => {
    const stderrText = stderrChunks.join("").trim();
    return new Error(stderrText ? `${prefix}: ${stderrText}` : prefix);
  };

  const rl = createInterface({ input: stdout, crlfDelay: Infinity });
  rl.on("line", (line) => {
    let payload: NodeBridgeEvent | NodeBridgeResponse;
    try {
      payload = JSON.parse(line) as NodeBridgeEvent | NodeBridgeResponse;
    } catch {
      return;
    }
    if ("event" in payload) {
      if (payload.event === "ready") {
        startResolve?.();
        return;
      }
      if (payload.event === "runtime") {
        if (payload.payload) pushBrowserRuntimeEvent(events, payload.payload);
        return;
      }
      if (payload.event === "fatal") {
        const message = payload.error?.trim() || "Node bridge reported fatal error";
        const err = new Error(message);
        startReject?.(err);
        rejectAllPending(err);
        return;
      }
      return;
    }
    if (typeof payload.id !== "number") return;
    const entry = pending.get(payload.id);
    if (!entry) return;
    pending.delete(payload.id);
    clearTimeout(entry.timer);
    if (payload.ok) entry.resolve(payload.result);
    else entry.reject(new Error(payload.error?.trim() || "Node bridge command failed"));
  });

  child.on("exit", (code, signal) => {
    stopped = true;
    clearTimeout(readyTimer);
    const reason = teardownReason(
      `Node bridge exited before completion (code=${code ?? "null"}, signal=${signal ?? "null"})`,
    );
    startReject?.(reason);
    rejectAllPending(reason);
  });

  child.on("error", (err) => {
    stopped = true;
    clearTimeout(readyTimer);
    startReject?.(err);
    rejectAllPending(err);
  });

  try {
    await startPromise;
  } catch (err) {
    clearTimeout(readyTimer);
    if (!stopped) child.kill();
    throw err;
  }
  clearTimeout(readyTimer);

  const sendCommand = async (
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    if (signal?.aborted) {
      throw new Error("Cancelled");
    }
    if (stopped) {
      throw teardownReason("Node bridge process is not running");
    }

    const id = nextId++;
    const op = new Promise<unknown>((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectCommand(new Error(`Node bridge command '${method}' timed out after ${commandTimeoutMs}ms`));
      }, commandTimeoutMs);
      pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
      const payload = JSON.stringify({ id, method, params });
      stdin.write(`${payload}\n`);
    });

    if (!signal) return op;
    return new Promise<unknown>((resolveOp, rejectOp) => {
      let done = false;
      const onAbort = () => {
        if (done) return;
        done = true;
        const pendingEntry = pending.get(id);
        if (pendingEntry) {
          clearTimeout(pendingEntry.timer);
          pending.delete(id);
        }
        rejectOp(new Error("Cancelled"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      op.then(
        (value) => {
          if (done) return;
          done = true;
          signal.removeEventListener("abort", onAbort);
          resolveOp(value);
        },
        (error) => {
          if (done) return;
          done = true;
          signal.removeEventListener("abort", onAbort);
          rejectOp(error);
        },
      );
    });
  };

  const closeBridge = async () => {
    if (stopped) return;
    try {
      await sendCommand("close", {});
    } catch {
      child.kill();
    }
    stopped = true;
    child.kill();
    await once(child, "exit").catch(() => {});
  };

  const driver: BrowserDriver = {
    async navigate(url: string, signal?: AbortSignal) {
      await sendCommand("navigate", { url: rewritePublicUrlForContainerBrowser(url, liveViewSession) }, signal);
    },
    async click(selector: string, signal?: AbortSignal) {
      await sendCommand("click", { selector }, signal);
    },
    async typeText(selector: string, text: string, signal?: AbortSignal) {
      await sendCommand("typeText", { selector, text }, signal);
    },
    async scroll(x: number, y: number, signal?: AbortSignal) {
      await sendCommand("scroll", { x, y }, signal);
    },
    async select(selector: string, value: string, signal?: AbortSignal) {
      await sendCommand("select", { selector, value }, signal);
    },
    async waitFor(selector: string, timeoutMs: number, signal?: AbortSignal) {
      await sendCommand("waitFor", { selector, timeoutMs }, signal);
    },
    async screenshot(path?: string, signal?: AbortSignal) {
      const result = await sendCommand("screenshot", { path }, signal);
      if (typeof result !== "string") {
        throw new Error("Node bridge returned an invalid screenshot path.");
      }
      return result;
    },
    async snapshot(signal?: AbortSignal) {
      const result = await sendCommand("snapshot", {}, signal);
      if (!result || typeof result !== "object") {
        throw new Error("Node bridge returned an invalid browser snapshot.");
      }
      const snapshot = result as BrowserPageSnapshot;
      return {
        ...snapshot,
        url: rewriteContainerBrowserUrlToPublic(snapshot.url, liveViewSession) ?? snapshot.url,
      };
    },
    async diagnose(selector: string, signal?: AbortSignal) {
      const result = await sendCommand("diagnose", { selector }, signal);
      if (!result || typeof result !== "object") {
        throw new Error("Node bridge returned invalid browser diagnostics.");
      }
      return result as BrowserTargetDiagnostics;
    },
    async getMetrics(signal?: AbortSignal) {
      const result = await sendCommand("getMetrics", {}, signal);
      if (!result || typeof result !== "object") {
        throw new Error("Node bridge returned invalid browser metrics.");
      }
      const metrics = result as BrowserPerformanceMetrics;
      return {
        ...metrics,
        url: rewriteContainerBrowserUrlToPublic(metrics.url, liveViewSession) ?? metrics.url,
      };
    },
    getEvents() {
      return [...events];
    },
    async close() {
      await closeBridge();
      if (liveViewSession) {
        const { stopLiveView } = await import("../services/live-view-manager.js");
        await stopLiveView(liveViewSession);
      }
    },
    liveView: liveViewSession
      ? {
          display: liveViewSession.display,
          vncPort: liveViewSession.vncPort,
          websockifyPort: liveViewSession.websockifyPort,
          novncUrl: liveViewSession.novncUrl,
        }
      : undefined,
  };

  return driver;
}

function resolveNodeBridgeScriptPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, "playwright-node-bridge.cjs"),
    resolve(process.cwd(), "packages", "gateway", "src", "surfaces", "playwright-node-bridge.cjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Unable to locate Playwright node bridge script. Looked in: ${candidates.join(", ")}`,
  );
}

function parsePositiveIntegerEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function buildBrowserLaunchStrategies(headless: boolean, timeoutMs: number): BrowserLaunchStrategy[] {
  const strategies: BrowserLaunchStrategy[] = [];
  const seen = new Set<string>();
  const addStrategy = (label: string, options: Record<string, unknown>) => {
    const key = JSON.stringify(options);
    if (seen.has(key)) return;
    seen.add(key);
    strategies.push({ label, options });
  };

  const preferredChannel = process.env["BROWSER_CHANNEL"]?.trim();
  if (preferredChannel) {
    addStrategy(`channel=${preferredChannel}`, {
      headless,
      channel: preferredChannel,
      timeout: timeoutMs,
    });
  }

  addStrategy("default", { headless, timeout: timeoutMs });

  const fallbackChannels = parseCsvEnv(
    process.env["BROWSER_FALLBACK_CHANNELS"],
    ["chromium", "chrome", "msedge"],
  );
  for (const channel of fallbackChannels) {
    if (channel === preferredChannel) continue;
    addStrategy(`fallback channel=${channel}`, {
      headless,
      channel,
      timeout: timeoutMs,
    });
  }

  return strategies;
}

function parseCsvEnv(raw: string | undefined, fallback: string[]): string[] {
  const values = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

async function launchBrowserWithFallback(
  chromium: PlaywrightChromium,
  strategies: BrowserLaunchStrategy[],
): Promise<PlaywrightBrowser> {
  const errors: string[] = [];

  for (const strategy of strategies) {
    try {
      return await chromium.launch(strategy.options);
    } catch (err) {
      errors.push(`${strategy.label}: ${extractErrorMessage(err)}`);
    }
  }

  const summary = errors.length > 0 ? errors.join(" | ") : "No launch strategies configured.";
  throw new Error(`Playwright browser launch failed after ${strategies.length} attempt(s): ${summary}`);
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function enrichBrowserActionError(
  action: string,
  selector: string,
  err: unknown,
  diagnostics: BrowserTargetDiagnostics | null,
): Error {
  const parts = [`browser.${action} failed for '${selector}': ${extractErrorMessage(err)}`];
  if (!diagnostics) return new Error(parts.join(" "));
  if (!diagnostics.found) {
    parts.push("Target was not found in the DOM.");
    return new Error(parts.join(" "));
  }
  if (diagnostics.offscreen) parts.push("Target appears offscreen.");
  if (diagnostics.disabled) parts.push("Target is disabled.");
  if (diagnostics.inDialog) {
    parts.push(`Target is inside dialog${diagnostics.dialogTitle ? ` '${diagnostics.dialogTitle}'` : ""}.`);
  }
  if (diagnostics.obscured) {
    const interceptedBy = diagnostics.interceptedBy;
    const interceptedLabel = interceptedBy
      ? [interceptedBy.role ?? interceptedBy.tagName ?? "element", interceptedBy.text, interceptedBy.selector]
        .filter(Boolean)
        .join(" — ")
      : null;
    parts.push(
      diagnostics.obstructionReason
        ?? (interceptedLabel ? `Click may be intercepted by ${interceptedLabel}.` : "Click appears obstructed."),
    );
  }
  return new Error(parts.join(" "));
}
