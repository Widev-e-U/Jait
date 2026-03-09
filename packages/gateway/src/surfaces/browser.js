import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS = 45_000;
const DEFAULT_NODE_BRIDGE_READY_TIMEOUT_MS = 60_000;
const DEFAULT_NODE_BRIDGE_COMMAND_TIMEOUT_MS = 60_000;
export class BrowserSurface {
    id;
    options;
    type = "browser";
    _state = "idle";
    _sessionId = null;
    _startedAt = null;
    _lastUrl = "";
    _lastTitle = "";
    _actionCount = 0;
    driver = null;
    onOutput;
    onStateChange;
    constructor(id, options = {}) {
        this.id = id;
        this.options = options;
    }
    get state() {
        return this._state;
    }
    get sessionId() {
        return this._sessionId;
    }
    async start(input) {
        if (this._state === "running")
            return;
        this._setState("starting");
        this._sessionId = input.sessionId;
        this._startedAt = new Date().toISOString();
        try {
            const factory = this.options.driverFactory ?? createPlaywrightDriver;
            this.driver = await factory();
            this._setState("running");
        }
        catch (err) {
            this._setState("error");
            throw err;
        }
    }
    async stop(_input) {
        this._setState("stopping");
        await this.driver?.close();
        this.driver = null;
        this._setState("stopped");
    }
    snapshot() {
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
    async navigate(url, signal) {
        const driver = this.requireDriver();
        await driver.navigate(url, signal);
        this._actionCount++;
        const snap = await driver.snapshot(signal);
        this.captureSnapshotMeta(snap);
        this.onOutput?.(`navigate ${snap.url}`);
        return snap;
    }
    async describe(signal) {
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
    async click(selector, signal) {
        await this.requireDriver().click(selector, signal);
        this._actionCount++;
    }
    async typeText(selector, text, signal) {
        await this.requireDriver().typeText(selector, text, signal);
        this._actionCount++;
    }
    async scroll(x, y, signal) {
        await this.requireDriver().scroll(x, y, signal);
        this._actionCount++;
    }
    async select(selector, value, signal) {
        await this.requireDriver().select(selector, value, signal);
        this._actionCount++;
    }
    async waitFor(selector, timeoutMs, signal) {
        await this.requireDriver().waitFor(selector, timeoutMs, signal);
        this._actionCount++;
    }
    async screenshot(path, signal) {
        this._actionCount++;
        return this.requireDriver().screenshot(path, signal);
    }
    captureSnapshotMeta(snap) {
        this._lastUrl = snap.url;
        this._lastTitle = snap.title;
    }
    requireDriver() {
        if (!this.driver || this._state !== "running") {
            throw new Error("Browser surface is not running");
        }
        return this.driver;
    }
    _setState(next) {
        this._state = next;
        this.onStateChange?.(next);
    }
}
export class BrowserSurfaceFactory {
    options;
    type = "browser";
    constructor(options = {}) {
        this.options = options;
    }
    create(id) {
        return new BrowserSurface(id, this.options);
    }
}
async function createPlaywrightDriver() {
    const runtime = resolveBrowserRuntimeMode();
    if (runtime === "node-bridge") {
        return createNodeBridgePlaywrightDriver();
    }
    try {
        return await createInProcessPlaywrightDriver();
    }
    catch (err) {
        if (runtime === "auto" && isBunWindowsRuntime() && shouldFallbackToNodeBridge(err)) {
            return createNodeBridgePlaywrightDriver();
        }
        throw err;
    }
}
function resolveBrowserRuntimeMode() {
    const configured = process.env["BROWSER_RUNTIME"]?.trim().toLowerCase();
    if (configured === "in-process")
        return "in-process";
    if (configured === "node" || configured === "node-bridge")
        return "node-bridge";
    if (isBunWindowsRuntime())
        return "node-bridge";
    return "auto";
}
function isBunWindowsRuntime() {
    return process.platform === "win32" && Boolean(process.versions.bun);
}
function shouldFallbackToNodeBridge(err) {
    const message = extractErrorMessage(err).toLowerCase();
    return message.includes("launch: timeout")
        || message.includes("playwright browser launch failed")
        || message.includes("failed to create playwright browser context");
}
async function createInProcessPlaywrightDriver() {
    // Optional runtime dependency: keep static imports out so gateway can still
    // boot in environments that do not need browser automation.
    const loadPlaywright = new Function("return import('playwright')");
    let mod;
    try {
        mod = await loadPlaywright();
    }
    catch {
        throw new Error("Playwright is not installed. Install it in @jait/gateway: `bun add playwright --cwd packages/gateway`");
    }
    const chromium = mod.chromium;
    if (!chromium) {
        throw new Error("Failed to load Playwright chromium driver.");
    }
    const headless = process.env["BROWSER_HEADLESS"] !== "false";
    const launchTimeoutMs = parsePositiveIntegerEnv(process.env["BROWSER_LAUNCH_TIMEOUT_MS"], DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS);
    const launchStrategies = buildBrowserLaunchStrategies(headless, launchTimeoutMs);
    const browser = await launchBrowserWithFallback(chromium, launchStrategies);
    let context = null;
    let page = null;
    try {
        context = await browser.newContext({
            ignoreHTTPSErrors: process.env["BROWSER_IGNORE_HTTPS_ERRORS"] === "true",
        });
        page = await context.newPage();
    }
    catch (err) {
        await browser.close().catch(() => { });
        throw err;
    }
    if (!context || !page) {
        await browser.close().catch(() => { });
        throw new Error("Failed to create Playwright browser context.");
    }
    const activeContext = context;
    const activePage = page;
    /**
     * Race a Playwright page operation against an AbortSignal.
     * If the signal fires, we call `window.stop()` on the page (cancels in-flight
     * network requests and navigation) and reject with "Cancelled".
     */
    function withSignal(op, signal) {
        if (!signal)
            return op;
        if (signal.aborted)
            return Promise.reject(new Error("Cancelled"));
        return new Promise((resolve, reject) => {
            let settled = false;
            const onAbort = () => {
                if (settled)
                    return;
                settled = true;
                // Stop the page's in-flight navigation / network requests
                activePage.evaluate(() => window.stop()).catch(() => { });
                reject(new Error("Cancelled"));
            };
            signal.addEventListener("abort", onAbort, { once: true });
            op.then((v) => { if (!settled) {
                settled = true;
                signal.removeEventListener("abort", onAbort);
                resolve(v);
            } }, (e) => { if (!settled) {
                settled = true;
                signal.removeEventListener("abort", onAbort);
                reject(e);
            } });
        });
    }
    const driver = {
        async navigate(url, signal) {
            await withSignal(activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }), signal);
        },
        async click(selector, signal) {
            await withSignal(activePage.click(selector), signal);
        },
        async typeText(selector, text, signal) {
            await withSignal(activePage.fill(selector, text), signal);
        },
        async scroll(x, y, signal) {
            await withSignal(activePage.evaluate(([targetX, targetY]) => window.scrollTo(targetX, targetY), [x, y]), signal);
        },
        async select(selector, value, signal) {
            const selectPage = activePage;
            if (!selectPage.selectOption) {
                throw new Error("Browser driver does not support selectOption.");
            }
            await withSignal(selectPage.selectOption(selector, value), signal);
        },
        async waitFor(selector, timeoutMs, signal) {
            await withSignal(activePage.waitForSelector(selector, { timeout: timeoutMs }), signal);
        },
        async screenshot(path, signal) {
            const outPath = path
                ? resolve(path)
                : resolve(process.cwd(), "artifacts", `browser-${Date.now()}.png`);
            await mkdir(dirname(outPath), { recursive: true });
            await withSignal(activePage.screenshot({ path: outPath, fullPage: true }), signal);
            return outPath;
        },
        async snapshot(signal) {
            return withSignal(activePage.evaluate(() => {
                const normalize = (value) => value.replace(/\s+/g, " ").trim();
                const bodyText = normalize(document.body?.innerText ?? "").slice(0, 12_000);
                const title = document.title || "(untitled)";
                const esc = (raw) => {
                    if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
                        return CSS.escape(raw);
                    return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
                };
                const rawElements = Array.from(document.querySelectorAll("a, button, input, textarea, select, [role], [onclick], [tabindex]"));
                const limited = rawElements.slice(0, 60);
                const elements = limited.map((el) => {
                    const tag = el.tagName.toLowerCase();
                    const role = el.getAttribute("role") ?? tag;
                    const name = el.getAttribute("aria-label") ??
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
            }), signal);
        },
        async close() {
            await activeContext.close();
            await browser.close();
        },
    };
    return driver;
}
async function createNodeBridgePlaywrightDriver() {
    const nodeBinary = process.env["BROWSER_NODE_BINARY"]?.trim() || "node";
    const scriptPath = resolveNodeBridgeScriptPath();
    const launchTimeoutMs = parsePositiveIntegerEnv(process.env["BROWSER_LAUNCH_TIMEOUT_MS"], DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS);
    const readyTimeoutMs = parsePositiveIntegerEnv(process.env["BROWSER_NODE_BRIDGE_READY_TIMEOUT_MS"], Math.max(DEFAULT_NODE_BRIDGE_READY_TIMEOUT_MS, launchTimeoutMs + 15_000));
    const commandTimeoutMs = parsePositiveIntegerEnv(process.env["BROWSER_NODE_BRIDGE_COMMAND_TIMEOUT_MS"], DEFAULT_NODE_BRIDGE_COMMAND_TIMEOUT_MS);
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
    const stderrChunks = [];
    stderr.setEncoding("utf8");
    stderr.on("data", (chunk) => {
        if (!chunk)
            return;
        stderrChunks.push(chunk);
        if (stderrChunks.length > 20)
            stderrChunks.shift();
    });
    const pending = new Map();
    let nextId = 1;
    let stopped = false;
    let startResolve = null;
    let startReject = null;
    const startPromise = new Promise((resolve, reject) => {
        startResolve = resolve;
        startReject = reject;
    });
    const readyTimer = setTimeout(() => {
        startReject?.(new Error(`Node bridge startup timed out after ${readyTimeoutMs}ms`));
    }, readyTimeoutMs);
    const rejectAllPending = (reason) => {
        for (const [id, entry] of pending.entries()) {
            clearTimeout(entry.timer);
            pending.delete(id);
            entry.reject(reason);
        }
    };
    const teardownReason = (prefix) => {
        const stderrText = stderrChunks.join("").trim();
        return new Error(stderrText ? `${prefix}: ${stderrText}` : prefix);
    };
    const rl = createInterface({ input: stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
        let payload;
        try {
            payload = JSON.parse(line);
        }
        catch {
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
        if (typeof payload.id !== "number")
            return;
        const entry = pending.get(payload.id);
        if (!entry)
            return;
        pending.delete(payload.id);
        clearTimeout(entry.timer);
        if (payload.ok)
            entry.resolve(payload.result);
        else
            entry.reject(new Error(payload.error?.trim() || "Node bridge command failed"));
    });
    child.on("exit", (code, signal) => {
        stopped = true;
        clearTimeout(readyTimer);
        const reason = teardownReason(`Node bridge exited before completion (code=${code ?? "null"}, signal=${signal ?? "null"})`);
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
    }
    catch (err) {
        clearTimeout(readyTimer);
        if (!stopped)
            child.kill();
        throw err;
    }
    clearTimeout(readyTimer);
    const sendCommand = async (method, params, signal) => {
        if (signal?.aborted) {
            throw new Error("Cancelled");
        }
        if (stopped) {
            throw teardownReason("Node bridge process is not running");
        }
        const id = nextId++;
        const op = new Promise((resolveCommand, rejectCommand) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                rejectCommand(new Error(`Node bridge command '${method}' timed out after ${commandTimeoutMs}ms`));
            }, commandTimeoutMs);
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
            const payload = JSON.stringify({ id, method, params });
            stdin.write(`${payload}\n`);
        });
        if (!signal)
            return op;
        return new Promise((resolveOp, rejectOp) => {
            let done = false;
            const onAbort = () => {
                if (done)
                    return;
                done = true;
                const pendingEntry = pending.get(id);
                if (pendingEntry) {
                    clearTimeout(pendingEntry.timer);
                    pending.delete(id);
                }
                rejectOp(new Error("Cancelled"));
            };
            signal.addEventListener("abort", onAbort, { once: true });
            op.then((value) => {
                if (done)
                    return;
                done = true;
                signal.removeEventListener("abort", onAbort);
                resolveOp(value);
            }, (error) => {
                if (done)
                    return;
                done = true;
                signal.removeEventListener("abort", onAbort);
                rejectOp(error);
            });
        });
    };
    const closeBridge = async () => {
        if (stopped)
            return;
        try {
            await sendCommand("close", {});
        }
        catch {
            child.kill();
        }
        stopped = true;
        child.kill();
        await once(child, "exit").catch(() => { });
    };
    const driver = {
        async navigate(url, signal) {
            await sendCommand("navigate", { url }, signal);
        },
        async click(selector, signal) {
            await sendCommand("click", { selector }, signal);
        },
        async typeText(selector, text, signal) {
            await sendCommand("typeText", { selector, text }, signal);
        },
        async scroll(x, y, signal) {
            await sendCommand("scroll", { x, y }, signal);
        },
        async select(selector, value, signal) {
            await sendCommand("select", { selector, value }, signal);
        },
        async waitFor(selector, timeoutMs, signal) {
            await sendCommand("waitFor", { selector, timeoutMs }, signal);
        },
        async screenshot(path, signal) {
            const result = await sendCommand("screenshot", { path }, signal);
            if (typeof result !== "string") {
                throw new Error("Node bridge returned an invalid screenshot path.");
            }
            return result;
        },
        async snapshot(signal) {
            const result = await sendCommand("snapshot", {}, signal);
            if (!result || typeof result !== "object") {
                throw new Error("Node bridge returned an invalid browser snapshot.");
            }
            return result;
        },
        async close() {
            await closeBridge();
        },
    };
    return driver;
}
function resolveNodeBridgeScriptPath() {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        resolve(moduleDir, "playwright-node-bridge.cjs"),
        resolve(process.cwd(), "packages", "gateway", "src", "surfaces", "playwright-node-bridge.cjs"),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    throw new Error(`Unable to locate Playwright node bridge script. Looked in: ${candidates.join(", ")}`);
}
function parsePositiveIntegerEnv(raw, fallback) {
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return parsed;
}
function buildBrowserLaunchStrategies(headless, timeoutMs) {
    const strategies = [];
    const seen = new Set();
    const addStrategy = (label, options) => {
        const key = JSON.stringify(options);
        if (seen.has(key))
            return;
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
    const fallbackChannels = parseCsvEnv(process.env["BROWSER_FALLBACK_CHANNELS"], ["chromium", "chrome", "msedge"]);
    for (const channel of fallbackChannels) {
        if (channel === preferredChannel)
            continue;
        addStrategy(`fallback channel=${channel}`, {
            headless,
            channel,
            timeout: timeoutMs,
        });
    }
    return strategies;
}
function parseCsvEnv(raw, fallback) {
    const values = (raw ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    return values.length > 0 ? values : fallback;
}
async function launchBrowserWithFallback(chromium, strategies) {
    const errors = [];
    for (const strategy of strategies) {
        try {
            return await chromium.launch(strategy.options);
        }
        catch (err) {
            errors.push(`${strategy.label}: ${extractErrorMessage(err)}`);
        }
    }
    const summary = errors.length > 0 ? errors.join(" | ") : "No launch strategies configured.";
    throw new Error(`Playwright browser launch failed after ${strategies.length} attempt(s): ${summary}`);
}
function extractErrorMessage(err) {
    if (err instanceof Error)
        return err.message;
    return String(err);
}
//# sourceMappingURL=browser.js.map