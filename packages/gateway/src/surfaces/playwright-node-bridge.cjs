#!/usr/bin/env node
"use strict";
const { clickWithVisibleCursor } = require("./browser-cursor.cjs");

const { chromium } = require("playwright");
const { createInterface } = require("node:readline");
const { mkdir } = require("node:fs/promises");
const { dirname, resolve } = require("node:path");

function parsePositiveIntegerEnv(raw, fallback) {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseCsvEnv(raw, fallback) {
  const values = (raw || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function buildLaunchStrategies(headless, timeoutMs) {
  const strategies = [];
  const seen = new Set();
  const add = (label, options) => {
    const key = JSON.stringify(options);
    if (seen.has(key)) return;
    seen.add(key);
    strategies.push({ label, options });
  };

  const preferredChannel = process.env.BROWSER_CHANNEL?.trim();
  if (preferredChannel) {
    add(`channel=${preferredChannel}`, {
      headless,
      channel: preferredChannel,
      timeout: timeoutMs,
    });
  }

  add("default", { headless, timeout: timeoutMs });
  for (const channel of parseCsvEnv(process.env.BROWSER_FALLBACK_CHANNELS, ["chromium", "chrome", "msedge"])) {
    if (channel === preferredChannel) continue;
    add(`fallback channel=${channel}`, { headless, channel, timeout: timeoutMs });
  }
  return strategies;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const MAX_BROWSER_RUNTIME_EVENTS = 200;

const CONSOLE_FLOOD_WINDOW_MS = 2000;
const CONSOLE_FLOOD_THRESHOLD = 60;
const CONSOLE_FLOOD_COOLDOWN_MS = 30000;

const NETWORK_LOG_LIMIT = 3000;
const NETWORK_BODY_LIMIT = 20000;

function clampBody(text, limit = NETWORK_BODY_LIMIT) {
  const value = typeof text === "string" ? text : String(text ?? "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…[truncated ${value.length - limit} chars]`;
}

/**
 * Ring buffer over the CDP Network domain for one page.
 * Always on: request/response headers and bodies (including POST payloads)
 * stay inspectable without an opt-in toggle.
 */
function createNetworkRecorder(limit = NETWORK_LOG_LIMIT) {
  const entries = [];
  const byRequestId = new Map();
  let seq = 0;

  const trim = () => {
    while (entries.length > limit) {
      const dropped = entries.shift();
      if (dropped?.requestId) byRequestId.delete(dropped.requestId);
    }
  };

  const patch = (requestId, updates) => {
    const entry = byRequestId.get(requestId);
    if (!entry) return null;
    Object.assign(entry, updates);
    return entry;
  };

  return {
    entries: () => entries,
    find: (requestId) => byRequestId.get(requestId) ?? null,
    clear() {
      entries.length = 0;
      byRequestId.clear();
    },
    request(p) {
      if (!p || !p.requestId) return null;
      seq += 1;
      const entry = {
        seq,
        requestId: p.requestId,
        url: p.request?.url ?? null,
        method: p.request?.method ?? null,
        resourceType: p.type ?? null,
        documentUrl: p.documentURL ?? null,
        requestHeaders: p.request?.headers ?? null,
        requestBody: typeof p.request?.postData === "string"
          ? { text: clampBody(p.request.postData) }
          : null,
        hasPostData: p.request?.hasPostData === true,
        status: null,
        statusText: null,
        mimeType: null,
        responseHeaders: null,
        responseBody: null,
        finished: false,
        failed: null,
        startedAt: Date.now(),
      };
      entries.push(entry);
      byRequestId.set(entry.requestId, entry);
      trim();
      return entry;
    },
    response(p) {
      return patch(p?.requestId, {
        status: p?.response?.status ?? null,
        statusText: p?.response?.statusText ?? null,
        mimeType: p?.response?.mimeType ?? null,
        responseHeaders: p?.response?.headers ?? null,
      });
    },
    finished(p) {
      patch(p?.requestId, { finished: true });
    },
    failed(p) {
      patch(p?.requestId, { finished: true, failed: p?.errorText ?? "failed" });
    },
  };
}

/**
 * Flood guard mirroring the gateway-side guard in browser.ts.
 * Pauses console capture for a cooldown timeout when the page emits a burst
 * of console messages, so a chatty page cannot saturate the stdio pipe or the
 * bounded runtime-event buffer.
 */
function createConsoleFloodGuard(env) {
  const windowMs = parsePositiveIntegerEnv(env.BROWSER_CONSOLE_FLOOD_WINDOW_MS, CONSOLE_FLOOD_WINDOW_MS);
  const threshold = parsePositiveIntegerEnv(env.BROWSER_CONSOLE_FLOOD_THRESHOLD, CONSOLE_FLOOD_THRESHOLD);
  const cooldownMs = parsePositiveIntegerEnv(env.BROWSER_CONSOLE_FLOOD_COOLDOWN_MS, CONSOLE_FLOOD_COOLDOWN_MS);
  const recent = [];
  let resumesAt = null;
  let dropped = 0;

  function isPaused(at) {
    if (resumesAt === null) return false;
    if (at >= resumesAt) {
      resumesAt = null;
      return false;
    }
    return true;
  }

  return {
    record(at = Date.now()) {
      const wasPaused = resumesAt !== null;
      if (isPaused(at)) {
        dropped += 1;
        return { drop: true, notice: null };
      }
      if (wasPaused) {
        return {
          drop: false,
          notice: { type: "console", level: "info", text: "Console capture resumed after flood pause." },
        };
      }
      while (recent.length > 0 && at - recent[0] > windowMs) recent.shift();
      recent.push(at);
      if (recent.length >= threshold) {
        recent.length = 0;
        resumesAt = at + cooldownMs;
        return {
          drop: true,
          notice: {
            type: "console",
            level: "warn",
            text: `Console capture paused for ${Math.round(cooldownMs / 1000)}s — the page emitted ${threshold} console messages in the last ${Math.round(windowMs / 1000)}s (flood detected). New console messages are skipped until the cooldown expires.`,
          },
        };
      }
      return { drop: false, notice: null };
    },
    isPaused(at = Date.now()) {
      return resumesAt !== null && at < resumesAt;
    },
  };
}

function pushRuntimeEvent(events, next, guard) {
  if (next.type === "console" && guard) {
    const result = guard.record();
    if (result.notice) appendRuntimeEvent(events, result.notice);
    if (result.drop) return;
  }
  appendRuntimeEvent(events, next);
}

function appendRuntimeEvent(events, next) {
  const event = {
    id: (events.length > 0 ? events[events.length - 1].id : 0) + 1,
    timestamp: new Date().toISOString(),
    ...next,
  };
  events.push(event);
  send({ event: "runtime", payload: event });
  if (events.length > MAX_BROWSER_RUNTIME_EVENTS) {
    events.splice(0, events.length - MAX_BROWSER_RUNTIME_EVENTS);
  }
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

async function selectInitialPage(context) {
  const pages = typeof context.pages === "function"
    ? context.pages().filter((candidate) => !isPageClosed(candidate))
    : [];
  const blankPage = pages.find((candidate) => {
    try {
      return typeof candidate.url === "function" && isReusableBootstrapPageUrl(candidate.url());
    } catch {
      return false;
    }
  });
  return blankPage || await context.newPage();
}

function isReusableBootstrapPageUrl(url) {
  const normalized = String(url || "").trim().toLowerCase();
  return normalized === "about:blank"
    || normalized === "chrome://newtab/"
    || normalized === "chrome://new-tab-page/"
    || normalized === "edge://newtab/";
}

function isPageClosed(page) {
  try {
    return typeof page?.isClosed === "function" && page.isClosed();
  } catch {
    return true;
  }
}

async function launchWithFallback(strategies) {
  const errors = [];
  for (const strategy of strategies) {
    try {
      const browser = await chromium.launch(strategy.options);
      return { browser, strategy };
    } catch (err) {
      errors.push(`${strategy.label}: ${errorMessage(err)}`);
    }
  }
  throw new Error(`Playwright launch failed after ${strategies.length} attempt(s): ${errors.join(" | ")}`);
}

async function selectVisiblePage(pages, fallback) {
  let visiblePage;
  // Multiple windows can all report focus (e.g. Chromium under Xvfb).
  // Prefer the most recently adopted page when visibility is ambiguous.
  for (const candidate of [fallback, ...pages.filter(page => page !== fallback)]) {
    if (isPageClosed(candidate)) continue;
    try {
      const state = await candidate.evaluate(() => ({ visible: document.visibilityState === "visible", focused: document.hasFocus() }));
      if (state.visible && state.focused) return candidate;
      if (state.visible) visiblePage ??= candidate;
    } catch { /* A closing or navigating tab cannot be inspected yet. */ }
  }
  return visiblePage ?? fallback;
}

async function main() {
  const cdpUrl = process.env.BROWSER_CDP_URL?.trim();
  const headless = process.env.BROWSER_HEADLESS !== "false";
  const timeoutMs = parsePositiveIntegerEnv(process.env.BROWSER_LAUNCH_TIMEOUT_MS, 45000);
  const launchStrategies = buildLaunchStrategies(headless, timeoutMs);
  const browser = cdpUrl
    ? await chromium.connectOverCDP(cdpUrl)
    : (await launchWithFallback(launchStrategies)).browser;
  const context = browser.contexts()[0] || await browser.newContext({
    ignoreHTTPSErrors: process.env.BROWSER_IGNORE_HTTPS_ERRORS === "true",
  });
  browser.on("disconnected", () => send({ event: "disconnected" }));
  context.on("close", () => send({ event: "disconnected" }));
  let page = await selectInitialPage(context);
  // CDP attachment does not activate the app window on the live desktop.
  // Display the attached page so VNC shows it and keyboard input reaches it.
  const presentPage = async (targetPage) => {
    if (process.env.BROWSER_COMPACT_VIEW !== "true") {
      if (cdpUrl) await targetPage.bringToFront();
      return;
    }
    // Hide Chromium's tabs and window buttons without cropping the VNC canvas
    // (cropping would change pointer coordinates).
    const session = await context.newCDPSession(targetPage);
    try {
      const { windowId } = await session.send("Browser.getWindowForTarget");
      await session.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "fullscreen" } });
    } finally {
      await session.detach();
    }
    await targetPage.bringToFront();
  };
  await presentPage(page);

  const events = [];
  const consoleGuard = createConsoleFloodGuard(process.env);

  const instrumentedPages = new WeakSet();
  // Every page gets a CDP session with the Network domain enabled, so request
  // and response bodies (POST payloads, OAuth token responses, ...) are always
  // available to browser.network / browser.eval without a separate opt-in.
  const cdpByPage = new Map();
  const cdpForPage = (targetPage) => {
    const existing = cdpByPage.get(targetPage);
    if (existing) return existing;
    const pending = (async () => {
      const session = await context.newCDPSession(targetPage);
      const binding = { session, recorder: createNetworkRecorder() };
      session.on("Network.requestWillBeSent", (p) => binding.recorder.request(p));
      session.on("Network.responseReceived", (p) => binding.recorder.response(p));
      session.on("Network.loadingFinished", (p) => binding.recorder.finished(p));
      session.on("Network.loadingFailed", (p) => binding.recorder.failed(p));
      session.on("detach", () => {
        if (cdpByPage.get(targetPage) === pending) cdpByPage.delete(targetPage);
      });
      await session.send("Network.enable", {
        maxTotalBufferSize: 104857600,
        maxResourceBufferSize: 20971520,
        maxPostDataSize: 65536,
      }).catch(() => undefined);
      await session.send("Runtime.enable").catch(() => undefined);
      return binding;
    })().catch((err) => {
      cdpByPage.delete(targetPage);
      throw err;
    });
    cdpByPage.set(targetPage, pending);
    return pending;
  };
  const activeCdpBindings = async () => {
    const pending = [...cdpByPage.values()];
    const resolved = await Promise.all(pending.map((p) => Promise.resolve(p).catch(() => null)));
    return resolved.filter(Boolean);
  };

  const attachPageEvents = (targetPage) => {
    if (!targetPage || instrumentedPages.has(targetPage)) return;
    instrumentedPages.add(targetPage);
    void cdpForPage(targetPage).catch(() => undefined);
    targetPage.on?.("console", (msg) => {
      const level = typeof msg?.type === "function" ? msg.type() : String(msg?.type ?? "log");
      const text = typeof msg?.text === "function" ? msg.text() : String(msg?.text ?? "");
      pushRuntimeEvent(events, { type: "console", level, text }, consoleGuard);
    });
    targetPage.on?.("pageerror", (err) => {
      pushRuntimeEvent(events, {
        type: "pageerror",
        level: "error",
        text: err?.message ?? String(err),
      });
    });
    targetPage.on?.("requestfailed", (request) => {
      pushRuntimeEvent(events, {
        type: "requestfailed",
        level: "error",
        text: request?.failure?.()?.errorText ?? "Request failed",
        url: request?.url?.(),
        method: request?.method?.(),
      });
    });
    targetPage.on?.("response", (response) => {
      const status = typeof response?.status === "function" ? response.status() : undefined;
      if (typeof status !== "number") return;
      const request = response.request?.();
      pushRuntimeEvent(events, {
        type: "response",
        level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        text: `HTTP ${status}`,
        url: response.url?.(),
        method: request?.method?.(),
        status,
      });
    });
    targetPage.on?.("close", () => {
      if (targetPage !== page) return;
      const openPages = typeof context.pages === "function"
        ? context.pages().filter((candidate) => !isPageClosed(candidate))
        : [];
      if (openPages.length > 0) {
        page = openPages[0];
        void presentPage(page).catch(() => {});
        attachPageEvents(page);
        return;
      }
      context.newPage()
        .then((nextPage) => {
          page = nextPage;
          return presentPage(nextPage).then(() => attachPageEvents(nextPage));
        })
        .catch((err) => {
          pushRuntimeEvent(events, {
            type: "pageerror",
            level: "error",
            text: `Failed to reopen browser page after close: ${errorMessage(err)}`,
          });
        });
    });
  };
  let presentingPage = Promise.resolve();
  context.on("page", (nextPage) => {
    page = nextPage;
    attachPageEvents(nextPage);
    presentingPage = presentPage(nextPage);
    void presentingPage.catch(() => {});
  });
  const ensurePage = async () => {
    await presentingPage;
    const previousPage = page;
    const visiblePage = await selectVisiblePage(context.pages(), previousPage);
    if (page === previousPage) page = visiblePage;
    else await presentingPage;
    if (page && !isPageClosed(page)) {
      attachPageEvents(page);
      await presentPage(page);
      return page;
    }
    page = await selectInitialPage(context);
    await presentPage(page);
    attachPageEvents(page);
    return page;
  };
  attachPageEvents(page);

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  const handlers = {
    navigate: async (params) => {
      await (await ensurePage()).goto(String(params.url || ""), { waitUntil: "domcontentloaded", timeout: 30000 });
      return null;
    },
    devToolsTarget: async () => {
      const session = await context.newCDPSession(await ensurePage());
      try {
        const { targetInfo } = await session.send("Target.getTargetInfo");
        return { targetId: targetInfo.targetId };
      } finally { await session.detach(); }
    },
    history: async (params) => {
      const page = await ensurePage();
      if (params.direction === "back") await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
      else if (params.direction === "forward") await page.goForward({ waitUntil: "domcontentloaded", timeout: 30000 });
      else throw new Error("Invalid history direction");
      return null;
    },
    reload: async () => {
      await (await ensurePage()).reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      return null;
    },
    click: async (params) => {
      await clickWithVisibleCursor(await ensurePage(), String(params.selector || ""));
      return null;
    },
    typeText: async (params) => {
      await (await ensurePage()).fill(String(params.selector || ""), String(params.text || ""));
      return null;
    },
    scroll: async (params) => {
      const x = Number(params.x || 0);
      const y = Number(params.y || 0);
      await (await ensurePage()).evaluate(([targetX, targetY]) => window.scrollTo(targetX, targetY), [x, y]);
      return null;
    },
    select: async (params) => {
      await (await ensurePage()).selectOption(String(params.selector || ""), String(params.value || ""));
      return null;
    },
    waitFor: async (params) => {
      const timeout = Number(params.timeoutMs || 10000);
      await (await ensurePage()).waitForSelector(String(params.selector || ""), { timeout });
      return null;
    },
    screenshot: async (params) => {
      const outPath = params.path
        ? resolve(String(params.path))
        : resolve(process.cwd(), ".jait", "shots", `browser-${Date.now()}.png`);
      await mkdir(dirname(outPath), { recursive: true });
      await (await ensurePage()).screenshot({ path: outPath, fullPage: true });
      return outPath;
    },
    snapshot: async () => (await ensurePage()).evaluate(() => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const bodyText = normalize(document.body?.innerText ?? "").slice(0, 12000);
      const title = document.title || "(untitled)";
      const esc = (raw) => {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(raw);
        return String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "_");
      };
      const isVisible = (el) => {
        if (!el || !(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const guessRole = (el, tag) =>
        el.getAttribute("role")
        ?? (tag === "a" ? "link" : tag === "input" ? (el.type === "checkbox" ? "checkbox" : "textbox") : tag);
      const getName = (el) => normalize(
        el.getAttribute("aria-label")
          ?? el.getAttribute("aria-labelledby")
          ?? el.getAttribute("name")
          ?? el.getAttribute("title")
          ?? el.getAttribute("placeholder")
          ?? el.innerText
          ?? el.textContent
          ?? "",
      ).slice(0, 200);
      const buildSelectors = (el, tag, role, name) => {
        const suggestions = [];
        const push = (kind, value, selector) => {
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
      const serializeElement = (el) => {
        const tag = el.tagName.toLowerCase();
        const role = guessRole(el, tag);
        const name = getName(el);
        const text = normalize(el.innerText ?? el.textContent ?? "").slice(0, 200);
        const id = el.getAttribute("id") ?? undefined;
        const testId = el.getAttribute("data-testid") ?? undefined;
        const placeholder = el.getAttribute("placeholder") ?? undefined;
        const selectors = buildSelectors(el, tag, role, name);
        const selectedValue = tag === "select"
          ? normalize(Array.from(el.selectedOptions ?? []).map((option) => option.textContent ?? option.value ?? "").join(", ")).slice(0, 200)
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
      );
      const elements = rawElements.filter((el) => isVisible(el)).slice(0, 60).map((el) => serializeElement(el));
      const activeElement = document.activeElement && document.activeElement !== document.body
        ? {
          ...serializeElement(document.activeElement),
          type: document.activeElement.getAttribute("type") ?? undefined,
          readOnly: document.activeElement.readOnly === true,
          isContentEditable: document.activeElement.isContentEditable === true,
        }
        : null;
      const dialogs = Array.from(document.querySelectorAll("dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true']"))
        .filter((el) => isVisible(el))
        .slice(0, 10)
        .map((el) => ({
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
        .filter((el) => {
          if (!isVisible(el)) return false;
          const style = window.getComputedStyle(el);
          if (style.pointerEvents === "none") return false;
          if (!(style.position === "fixed" || style.position === "sticky")) return false;
          const rect = el.getBoundingClientRect();
          return rect.width >= window.innerWidth * 0.35 && rect.height >= window.innerHeight * 0.2;
        })
        .slice(0, 6)
        .map((el) => {
          const style = window.getComputedStyle(el);
          return {
            ...serializeElement(el),
            reason: "fixed or sticky overlay",
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
          hasModal: dialogs.some((dialog) => dialog.ariaModal),
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
    }),
    getMetrics: async () => (await ensurePage()).evaluate(() => {
      const navEntries = performance.getEntriesByType("navigation");
      const nav = navEntries.length > 0 ? navEntries[0] : null;
      const paintEntries = performance.getEntriesByType("paint");
      const firstPaint = paintEntries.find((entry) => entry.name === "first-paint");
      const firstContentfulPaint = paintEntries.find((entry) => entry.name === "first-contentful-paint");
      const resourceEntries = performance.getEntriesByType("resource");
      const resources = {
        total: resourceEntries.length,
        scripts: resourceEntries.filter((entry) => entry.initiatorType === "script").length,
        stylesheets: resourceEntries.filter((entry) => entry.initiatorType === "link" || entry.initiatorType === "css").length,
        images: resourceEntries.filter((entry) => entry.initiatorType === "img").length,
        fonts: resourceEntries.filter((entry) => entry.initiatorType === "font").length,
        largestTransferSize: resourceEntries.reduce((max, entry) => Math.max(max, entry.transferSize || 0), 0),
      };

      const w = window;
      if (!w.__jaitMetricsObserversInstalled && typeof PerformanceObserver !== "undefined") {
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1];
            if (last) w.__jaitLcpMs = last.startTime;
          });
          lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
        } catch {}
        try {
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                w.__jaitCls = (w.__jaitCls || 0) + (entry.value || 0);
              }
            }
          });
          clsObserver.observe({ type: "layout-shift", buffered: true });
        } catch {}
        try {
          const inpObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              w.__jaitInpMs = Math.max(w.__jaitInpMs || 0, entry.duration || 0);
            }
          });
          inpObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
        } catch {}
        w.__jaitMetricsObserversInstalled = true;
      }

      const memory = performance.memory;
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
          lcpMs: w.__jaitLcpMs ?? null,
          cls: w.__jaitCls ?? 0,
          inpMs: w.__jaitInpMs ?? null,
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
    }),
    diagnose: async (params) => (await ensurePage()).evaluate((targetSelector) => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const esc = (raw) => {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(raw);
        return String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "_");
      };
      const buildSelectors = (el) => {
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
        const suggestions = [];
        const push = (kind, value, selector) => {
          if (!value || !selector || suggestions.some((item) => item.selector === selector)) return;
          suggestions.push({ kind, value, selector });
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
      const describeElement = (el, reason) => ({
        role: el?.getAttribute?.("role") ?? el?.tagName?.toLowerCase?.(),
        tagName: el?.tagName?.toLowerCase?.(),
        text: normalize(el?.innerText ?? el?.textContent ?? "").slice(0, 120),
        selector: buildSelectors(el)[0]?.selector,
        selectors: buildSelectors(el),
        reason,
        zIndex: Number.parseInt(window.getComputedStyle(el).zIndex || "0", 10) || 0,
      });
      const target = document.querySelector(targetSelector);
      if (!target) {
        return { selector: targetSelector, found: false };
      }
      const rect = target.getBoundingClientRect();
      const centerX = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const centerY = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const topElement = document.elementFromPoint(centerX, centerY);
      const intercepted = topElement && topElement !== target && !target.contains(topElement) ? topElement : null;
      const dialog = target.closest("dialog,[role='dialog'],[role='alertdialog'],[aria-modal='true']");
      return {
        selector: buildSelectors(target)[0]?.selector ?? targetSelector,
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
        selectors: buildSelectors(target),
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
    }, String(params.selector || "")),
    evaluate: async (params) => {
      const targetPage = await ensurePage();
      const expression = String(params?.expression ?? "");
      if (!expression.trim()) throw new Error("Expression is required");
      const timeoutMs = Math.max(1000, Math.min(300000, Number(params?.timeoutMs ?? 30000) || 30000));
      const binding = await cdpForPage(targetPage);
      const run = (returnByValue) => binding.session.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue,
        userGesture: true,
        includeCommandLineAPI: true,
        timeout: timeoutMs,
      });
      let result;
      try {
        result = await run(params?.returnByValue !== false);
      } catch (err) {
        result = await run(false);
      }
      if (result?.exceptionDetails) {
        const details = result.exceptionDetails;
        return {
          ok: false,
          error: normalizeText(details.exception?.description ?? details.text ?? "Evaluation failed").slice(0, 4000),
          lineNumber: details.lineNumber ?? null,
          columnNumber: details.columnNumber ?? null,
        };
      }
      const remote = result?.result ?? {};
      return {
        ok: true,
        type: remote.type ?? null,
        subtype: remote.subtype ?? null,
        value: remote.value === undefined ? null : remote.value,
        unserializableValue: remote.unserializableValue ?? null,
        description: remote.description ? normalizeText(remote.description).slice(0, 4000) : null,
      };
    },
    networkLog: async (params) => {
      const p = params ?? {};
      const targetPage = await ensurePage();
      await cdpForPage(targetPage).catch(() => null);
      const bindings = await activeCdpBindings();
      if (p.clear === true) {
        for (const binding of bindings) binding.recorder.clear();
        return { entries: [], nextSeq: 0, cleared: true };
      }
      const limit = Math.max(1, Math.min(1000, Number(p.limit ?? 50) || 50));
      const bodyLimit = Math.max(0, Math.min(200000, Number(p.bodyLimit ?? 20000) || 20000));
      const urlIncludes = typeof p.urlIncludes === "string" && p.urlIncludes ? p.urlIncludes : null;
      let urlRegex = null;
      if (typeof p.urlRegex === "string" && p.urlRegex) urlRegex = new RegExp(p.urlRegex);
      const methodFilter = typeof p.method === "string" && p.method ? p.method.toUpperCase() : null;
      const statusAtLeast = Number.isFinite(Number(p.statusAtLeast)) ? Number(p.statusAtLeast) : null;
      const sinceSeq = Number.isFinite(Number(p.sinceSeq)) ? Number(p.sinceSeq) : null;
      const wantBodies = p.includeBodies !== false && bodyLimit > 0;

      const collected = [];
      for (const binding of bindings) {
        for (const entry of binding.recorder.entries()) {
          if (sinceSeq !== null && entry.seq <= sinceSeq) continue;
          if (methodFilter && String(entry.method ?? "").toUpperCase() !== methodFilter) continue;
          if (statusAtLeast !== null && !(Number(entry.status ?? 0) >= statusAtLeast)) continue;
          if (urlIncludes && !String(entry.url ?? "").includes(urlIncludes)) continue;
          if (urlRegex && !urlRegex.test(String(entry.url ?? ""))) continue;
          collected.push({ binding, entry });
        }
      }
      collected.sort((a, b) => (a.entry.startedAt - b.entry.startedAt) || (a.entry.seq - b.entry.seq));
      const selected = collected.slice(-limit);

      for (const { binding, entry } of selected) {
        if (!wantBodies) {
          entry.requestBody = entry.requestBody ? { text: clampBody(entry.requestBody.text, bodyLimit) } : null;
          entry.responseBody = null;
          continue;
        }
        if (entry.hasPostData && !entry.requestBody?.text) {
          try {
            const body = await binding.session.send("Network.getRequestPostData", { requestId: entry.requestId });
            if (body?.postData) entry.requestBody = { text: clampBody(body.postData, bodyLimit) };
          } catch {
            // Request body no longer retained by the browser.
          }
        } else if (entry.requestBody?.text) {
          entry.requestBody = { text: clampBody(entry.requestBody.text, bodyLimit) };
        }
        if (!entry.responseBody && entry.status) {
          try {
            const body = await binding.session.send("Network.getResponseBody", { requestId: entry.requestId });
            const text = body?.base64Encoded
              ? Buffer.from(String(body.body ?? ""), "base64").toString("utf8")
              : String(body?.body ?? "");
            entry.responseBody = { text: clampBody(text, bodyLimit) };
          } catch (err) {
            entry.responseBody = { error: normalizeText(String(err?.message ?? err)).slice(0, 300) };
          }
        }
      }

      const includeHeaders = p.includeHeaders === true;
      return {
        url: typeof targetPage.url === "function" ? targetPage.url() : null,
        nextSeq: selected.length ? selected[selected.length - 1].entry.seq : (sinceSeq ?? 0),
        entries: selected.map(({ entry }) => ({
          seq: entry.seq,
          requestId: entry.requestId,
          url: entry.url,
          method: entry.method,
          resourceType: entry.resourceType,
          status: entry.status,
          statusText: entry.statusText,
          mimeType: entry.mimeType,
          failed: entry.failed,
          finished: entry.finished === true,
          startedAt: entry.startedAt,
          requestHeaders: includeHeaders ? entry.requestHeaders : null,
          responseHeaders: includeHeaders ? entry.responseHeaders : null,
          requestBody: entry.requestBody ?? null,
          responseBody: entry.responseBody ?? null,
        })),
      };
    },
    cdp: async (params) => {
      const method = String(params?.method ?? "").trim();
      if (!method) throw new Error("CDP method is required");
      const binding = await cdpForPage(await ensurePage());
      const cdpParams = params?.params && typeof params.params === "object" ? params.params : {};
      return await binding.session.send(method, cdpParams);
    },
    close: async () => {
      await context.close();
      await browser.close();
      return null;
    },
  };

  send({ event: "ready", strategy: cdpUrl ? "cdp" : "launch" });

  rl.on("line", async (line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      send({ id: null, ok: false, error: "Invalid JSON command" });
      return;
    }
    const id = parsed.id;
    const method = String(parsed.method || "");
    const params = parsed.params && typeof parsed.params === "object" ? parsed.params : {};
    const handler = handlers[method];
    if (!handler) {
      send({ id, ok: false, error: `Unknown method: ${method}` });
      return;
    }
    try {
      const result = await handler(params);
      send({ id, ok: true, result });
      if (method === "close") {
        process.exit(0);
      }
    } catch (err) {
      send({ id, ok: false, error: normalizeText(errorMessage(err)) });
    }
  });
}

module.exports = { selectVisiblePage };

if (require.main === module) main().catch((err) => {
  send({ event: "fatal", error: normalizeText(errorMessage(err)) });
  process.exit(1);
});
