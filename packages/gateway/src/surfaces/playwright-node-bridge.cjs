#!/usr/bin/env node
"use strict";

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

function pushRuntimeEvent(events, next) {
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
  const pages = typeof context.pages === "function" ? context.pages() : [];
  const blankPage = pages.find((candidate) => {
    try {
      return typeof candidate.url === "function" && candidate.url() === "about:blank";
    } catch {
      return false;
    }
  });
  return blankPage || await context.newPage();
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
  const page = await selectInitialPage(context);
  const events = [];

  page.on("console", (msg) => {
    const level = typeof msg?.type === "function" ? msg.type() : String(msg?.type ?? "log");
    const text = typeof msg?.text === "function" ? msg.text() : String(msg?.text ?? "");
    pushRuntimeEvent(events, { type: "console", level, text });
  });
  page.on("pageerror", (err) => {
    pushRuntimeEvent(events, {
      type: "pageerror",
      level: "error",
      text: err?.message ?? String(err),
    });
  });
  page.on("requestfailed", (request) => {
    pushRuntimeEvent(events, {
      type: "requestfailed",
      level: "error",
      text: request?.failure?.()?.errorText ?? "Request failed",
      url: request?.url?.(),
      method: request?.method?.(),
    });
  });
  page.on("response", (response) => {
    const status = typeof response?.status === "function" ? response.status() : undefined;
    if (typeof status !== "number" || status < 400) return;
    const request = response.request?.();
    pushRuntimeEvent(events, {
      type: "response",
      level: status >= 500 ? "error" : "warn",
      text: `HTTP ${status}`,
      url: response.url?.(),
      method: request?.method?.(),
      status,
    });
  });

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  const handlers = {
    navigate: async (params) => {
      await page.goto(String(params.url || ""), { waitUntil: "domcontentloaded", timeout: 30000 });
      return null;
    },
    click: async (params) => {
      await page.click(String(params.selector || ""));
      return null;
    },
    typeText: async (params) => {
      await page.fill(String(params.selector || ""), String(params.text || ""));
      return null;
    },
    scroll: async (params) => {
      const x = Number(params.x || 0);
      const y = Number(params.y || 0);
      await page.evaluate(([targetX, targetY]) => window.scrollTo(targetX, targetY), [x, y]);
      return null;
    },
    select: async (params) => {
      await page.selectOption(String(params.selector || ""), String(params.value || ""));
      return null;
    },
    waitFor: async (params) => {
      const timeout = Number(params.timeoutMs || 10000);
      await page.waitForSelector(String(params.selector || ""), { timeout });
      return null;
    },
    screenshot: async (params) => {
      const outPath = params.path
        ? resolve(String(params.path))
        : resolve(process.cwd(), "artifacts", `browser-${Date.now()}.png`);
      await mkdir(dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath, fullPage: true });
      return outPath;
    },
    snapshot: async () => page.evaluate(() => {
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
    getMetrics: async () => page.evaluate(() => {
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
    diagnose: async (params) => page.evaluate((targetSelector) => {
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

main().catch((err) => {
  send({ event: "fatal", error: normalizeText(errorMessage(err)) });
  process.exit(1);
});
