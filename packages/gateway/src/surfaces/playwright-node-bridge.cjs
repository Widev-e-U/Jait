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

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
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
  const headless = process.env.BROWSER_HEADLESS !== "false";
  const timeoutMs = parsePositiveIntegerEnv(process.env.BROWSER_LAUNCH_TIMEOUT_MS, 45000);
  const launchStrategies = buildLaunchStrategies(headless, timeoutMs);
  const { browser, strategy } = await launchWithFallback(launchStrategies);
  const context = await browser.newContext({
    ignoreHTTPSErrors: process.env.BROWSER_IGNORE_HTTPS_ERRORS === "true",
  });
  const page = await context.newPage();

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

      const rawElements = Array.from(
        document.querySelectorAll("a, button, input, textarea, select, [role], [onclick], [tabindex]"),
      );
      const limited = rawElements.slice(0, 60);
      const elements = limited.map((el) => {
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
    }),
    close: async () => {
      await context.close();
      await browser.close();
      return null;
    },
  };

  send({ event: "ready", strategy: strategy.label });

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
