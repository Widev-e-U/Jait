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

export interface BrowserDriver {
  navigate(url: string, signal?: AbortSignal): Promise<void>;
  click(selector: string, signal?: AbortSignal): Promise<void>;
  typeText(selector: string, text: string, signal?: AbortSignal): Promise<void>;
  scroll(x: number, y: number, signal?: AbortSignal): Promise<void>;
  select(selector: string, value: string, signal?: AbortSignal): Promise<void>;
  waitFor(selector: string, timeoutMs: number, signal?: AbortSignal): Promise<void>;
  screenshot(path?: string, signal?: AbortSignal): Promise<string>;
  snapshot(signal?: AbortSignal): Promise<BrowserPageSnapshot>;
  getEvents(): BrowserRuntimeEvent[];
  close(): Promise<void>;
}

export interface BrowserSurfaceOptions {
  driverFactory?: () => Promise<BrowserDriver>;
}

type PlaywrightBrowser = {
  newContext: (opts: Record<string, unknown>) => Promise<{
    newPage: () => Promise<{
      goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
      click: (selector: string) => Promise<void>;
      fill: (selector: string, text: string) => Promise<void>;
      evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
      waitForSelector: (selector: string, opts?: Record<string, unknown>) => Promise<unknown>;
      screenshot: (opts?: Record<string, unknown>) => Promise<unknown>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
    }>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

type PlaywrightChromium = {
  launch: (opts: Record<string, unknown>) => Promise<PlaywrightBrowser>;
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
  event: "ready" | "fatal";
  strategy?: string;
  error?: string;
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

  async click(selector: string, signal?: AbortSignal): Promise<void> {
    await this.requireDriver().click(selector, signal);
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
  const runtime = resolveBrowserRuntimeMode();
  if (runtime === "node-bridge") {
    return createNodeBridgePlaywrightDriver();
  }

  try {
    return await createInProcessPlaywrightDriver();
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

async function createInProcessPlaywrightDriver(): Promise<BrowserDriver> {
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

  const headless = process.env["BROWSER_HEADLESS"] !== "false";
  const launchTimeoutMs = parsePositiveIntegerEnv(
    process.env["BROWSER_LAUNCH_TIMEOUT_MS"],
    DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS,
  );
  const launchStrategies = buildBrowserLaunchStrategies(headless, launchTimeoutMs);
  const browser = await launchBrowserWithFallback(chromium, launchStrategies);

  let context: Awaited<ReturnType<PlaywrightBrowser["newContext"]>> | null = null;
  let page: Awaited<ReturnType<Awaited<ReturnType<PlaywrightBrowser["newContext"]>>["newPage"]>> | null = null;
  try {
    context = await browser.newContext({
      ignoreHTTPSErrors: process.env["BROWSER_IGNORE_HTTPS_ERRORS"] === "true",
    });
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
      url: request?.url?.(),
      method: request?.method?.(),
    });
  });
  activePage.on?.("response", (response: any) => {
    const status = typeof response?.status === "function" ? response.status() : undefined;
    if (typeof status !== "number" || status < 400) return;
    const request = response.request?.();
    pushBrowserRuntimeEvent(events, {
      type: "response",
      level: status >= 500 ? "error" : "warn",
      text: `HTTP ${status}`,
      url: response.url?.(),
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
      await withSignal(activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }), signal);
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
      return withSignal(activePage.evaluate(() => {
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
      }) as Promise<BrowserPageSnapshot>, signal);
    },
    getEvents() {
      return [...events];
    },
    async close() {
      await activeContext.close();
      await browser.close();
    },
  };

  return driver;
}

async function createNodeBridgePlaywrightDriver(): Promise<BrowserDriver> {
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
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
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
      await sendCommand("navigate", { url }, signal);
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
      return result as BrowserPageSnapshot;
    },
    getEvents() {
      return [];
    },
    async close() {
      await closeBridge();
    },
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
