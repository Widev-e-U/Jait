import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startFixtureSite, type FixtureSite } from "./fixture-site.js";
import { SHOP_JOURNEY, runJaitFlow, runRawFlow, startJaitHarness, summarizeRuns, type FlowRun, type FlowStep, type RawPage } from "./flow.js";

/**
 * End-to-end browser steering benchmark.
 *
 *   bun run bench:browser
 *
 * Env:
 *   JAIT_BROWSER_BENCH_RUNS=5           measured journeys per runtime (default 3)
 *   JAIT_BROWSER_BENCH_RUNTIMES=in-process,node-bridge
 *   JAIT_BROWSER_BENCH_BASELINE=<report.json>   print per-tool deltas against a previous report
 *   JAIT_BROWSER_BENCH_LIVE=1           also drive a few real public websites
 *   JAIT_BROWSER_BENCH_SKIP=popup       skip journey steps whose name contains any listed text
 *
 * Reports are written to .jait/artifacts/browser-bench/.
 */
const enabled = process.env["JAIT_BROWSER_BENCH"] === "1";
const repoRoot = resolve(import.meta.dirname, "../../../../..");
const reportDir = resolve(repoRoot, ".jait/artifacts/browser-bench");
const runs = Math.max(1, Number(process.env["JAIT_BROWSER_BENCH_RUNS"] ?? 3) || 3);
const runtimes = (process.env["JAIT_BROWSER_BENCH_RUNTIMES"] ?? "in-process,node-bridge").split(",").map(value => value.trim()).filter(Boolean);

const skipped = (process.env["JAIT_BROWSER_BENCH_SKIP"] ?? "").split(",").map(value => value.trim()).filter(Boolean);
const journey = SHOP_JOURNEY.filter(step => !skipped.some(text => step.name.includes(text)));

type Summary = ReturnType<typeof summarizeRuns>;
const report: {
  createdAt: string;
  runs: number;
  journeySteps: number;
  heavyHomeDomNodes?: number;
  raw?: Summary;
  runtimes: Record<string, Summary & { overheadVsRawMs: number }>;
  live?: Record<string, Array<{ name: string; ms: number; ok: boolean; error?: string }>>;
} = { createdAt: new Date().toISOString(), runs, journeySteps: journey.length, runtimes: {} };

describe.skipIf(!enabled)("browser steering benchmark", () => {
  let site: FixtureSite;

  beforeAll(async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    site = await startFixtureSite();
  });

  afterAll(async () => {
    await site?.close();
    vi.unstubAllEnvs();
    if (!enabled) return;
    mkdirSync(reportDir, { recursive: true });
    const stamp = report.createdAt.replace(/[:.]/g, "-");
    const jsonPath = resolve(reportDir, `browser-flow-${stamp}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeFileSync(resolve(reportDir, "latest.json"), JSON.stringify(report, null, 2));
    const markdown = renderMarkdown();
    writeFileSync(resolve(reportDir, `browser-flow-${stamp}.md`), markdown);
    console.log(`\n${markdown}\nReport: ${jsonPath}`);
  });

  it("raw Playwright floor for the same journey", async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const results: FlowRun[] = [];
      for (let i = 0; i <= runs; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const run = await runRawFlow(page as unknown as RawPage, site.baseUrl, journey, async () => await context.waitForEvent("page") as unknown as RawPage);
        if (i === 0) {
          await page.goto(`${site.baseUrl}/`, { waitUntil: "domcontentloaded" });
          report.heavyHomeDomNodes = await page.evaluate(() => document.getElementsByTagName("*").length);
        } else results.push(run); // first run warms caches and JIT
        await context.close();
      }
      report.raw = summarizeRuns(results);
    } finally {
      await browser.close();
    }
  }, 600_000);

  for (const runtime of runtimes) {
    it(`Jait tools journey (${runtime})`, async () => {
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      const harness = await startJaitHarness(`bench-${runtime}-${Date.now()}`, repoRoot);
      try {
        const results: FlowRun[] = [];
        for (let i = 0; i <= runs; i++) {
          const run = await runJaitFlow(harness, site.baseUrl, journey);
          if (i > 0) results.push(run);
        }
        const summary = summarizeRuns(results);
        report.runtimes[runtime] = { ...summary, overheadVsRawMs: Math.round(summary.totalMs.median - (report.raw?.totalMs.median ?? 0)) };
        expect(results).toHaveLength(runs);
      } finally {
        await harness.surface.stop();
      }
    }, 900_000);
  }

  it.skipIf(process.env["JAIT_BROWSER_BENCH_LIVE"] !== "1")("live internet journey", async () => {
    vi.stubEnv("BROWSER_RUNTIME", runtimes[0] ?? "in-process");
    const harness = await startJaitHarness(`bench-live-${Date.now()}`, repoRoot);
    const steps: Array<Pick<FlowStep, "name" | "tool"> & { input: Record<string, unknown> }> = [
      { name: "open Wikipedia article", tool: "browser.navigate", input: { url: "https://en.wikipedia.org/wiki/Web_browser" } },
      { name: "observe Wikipedia article", tool: "browser.snapshot", input: { maxElements: 30 } },
      { name: "follow first article link", tool: "browser.click", input: { selector: "#mw-content-text p a[href^='/wiki/']:not([href*=':'])" } },
      { name: "observe linked article", tool: "browser.snapshot", input: { maxElements: 30 } },
      { name: "type into Wikipedia search", tool: "browser.type", input: { selector: "input[name='search']", text: "Hypertext" } },
      { name: "open Hacker News", tool: "browser.navigate", input: { url: "https://news.ycombinator.com/" } },
      { name: "observe Hacker News", tool: "browser.snapshot", input: { maxElements: 30 } },
      { name: "open first comments page", tool: "browser.click", input: { selector: ".subline a[href^='item?id=']:last-child" } },
      { name: "observe comments", tool: "browser.snapshot", input: { maxElements: 30 } },
      { name: "open MDN form reference", tool: "browser.navigate", input: { url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form" } },
      { name: "scroll MDN", tool: "browser.scroll", input: { x: 0, y: 4000 } },
      { name: "observe MDN", tool: "browser.snapshot", input: { maxElements: 30 } },
      { name: "open GitHub repository", tool: "browser.navigate", input: { url: "https://github.com/microsoft/playwright" } },
      { name: "observe GitHub repository", tool: "browser.snapshot", input: { maxElements: 30 } },
    ];
    const results: Array<{ name: string; ms: number; ok: boolean; error?: string }> = [];
    try {
      for (const step of steps) {
        const t0 = performance.now();
        try {
          const result = await harness.tools.get(step.tool)!.execute(step.input, harness.context);
          results.push({ name: step.name, ms: Math.round(performance.now() - t0), ok: result.ok, error: result.ok ? undefined : result.message });
        } catch (error) {
          results.push({ name: step.name, ms: Math.round(performance.now() - t0), ok: false, error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
        }
      }
    } finally {
      await harness.surface.stop();
    }
    report.live = { [runtimes[0] ?? "in-process"]: results };
    expect(results.filter(result => result.ok).length).toBeGreaterThan(steps.length / 2);
  }, 300_000);
});

function renderMarkdown(): string {
  const baselinePath = process.env["JAIT_BROWSER_BENCH_BASELINE"];
  const baseline = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) as typeof report : undefined;
  const lines = [
    `# Browser steering benchmark (${report.createdAt})`,
    "",
    `Journey: ${report.journeySteps} agent tool calls. Measured journeys per runtime: ${report.runs} (plus one warm-up). Heavy home page DOM nodes: ${report.heavyHomeDomNodes ?? "?"}.`,
    "",
    "| Runtime | Journey median | Overhead vs raw Playwright |" + (baseline ? " Previous median |" : ""),
    "|---|---:|---:|" + (baseline ? "---:|" : ""),
  ];
  if (report.raw) lines.push(`| raw Playwright (no observation) | ${report.raw.totalMs.median} ms | — |` + (baseline?.raw ? ` ${baseline.raw.totalMs.median} ms |` : baseline ? " |" : ""));
  for (const [runtime, summary] of Object.entries(report.runtimes)) {
    const previous = baseline?.runtimes?.[runtime];
    lines.push(`| ${runtime} | ${summary.totalMs.median} ms | ${summary.overheadVsRawMs} ms |` + (baseline ? ` ${previous ? `${previous.totalMs.median} ms` : "—"} |` : ""));
  }
  for (const [runtime, summary] of Object.entries(report.runtimes)) {
    const previous = baseline?.runtimes?.[runtime];
    lines.push("", `## ${runtime}: per tool`, "", "| Tool | Calls/journey | p50 | p95 | Total/journey |" + (previous ? " Previous p50 |" : ""), "|---|---:|---:|---:|---:|" + (previous ? "---:|" : ""));
    for (const [tool, stats] of Object.entries(summary.byTool)) {
      lines.push(`| ${tool} | ${stats.calls} | ${stats.p50} ms | ${stats.p95} ms | ${stats.sumPerRun} ms |` + (previous ? ` ${previous.byTool[tool]?.p50 ?? "—"} ms |` : ""));
    }
    lines.push("", "Slowest steps (p50):", "", ...summary.slowestSteps.map(step => `- ${step.name}: ${step.p50} ms`));
  }
  if (report.live) {
    for (const [runtime, steps] of Object.entries(report.live)) {
      lines.push("", `## Live internet (${runtime})`, "", "| Step | ms | ok |", "|---|---:|---|", ...steps.map(step => `| ${step.name} | ${step.ms} | ${step.ok ? "yes" : `no: ${step.error ?? ""}`} |`));
    }
  }
  return lines.join("\n");
}
