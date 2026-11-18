import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startFixtureSite, type FixtureSite } from "./browser-bench/fixture-site.js";
import { percentile, startJaitHarness, type JaitFlowHarness } from "./browser-bench/flow.js";

/**
 * Per-operation latency and correctness of the agent browser tools on a heavy
 * fixture site. Ceilings are generous so CI noise does not flake them; they
 * catch regressions such as whole-document style scans or extra round trips.
 *
 *   JAIT_BROWSER_INTEGRATION=1 npx vitest run packages/gateway/src/surfaces/browser-speed.integration.test.ts
 */
const repoRoot = resolve(import.meta.dirname, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";

describe.skipIf(!enabled).each(["in-process", "node-bridge"])("browser tool speed (%s)", runtime => {
  let site: FixtureSite;
  let harness: JaitFlowHarness;
  const latencies: Record<string, number> = {};

  const run = async (tool: string, input: Record<string, unknown>) => {
    const t0 = performance.now();
    const result = await harness.tools.get(tool)!.execute(input, harness.context);
    const ms = performance.now() - t0;
    if (!result.ok) throw new Error(`${tool} failed: ${result.message}`);
    return { data: (result.data ?? {}) as Record<string, any>, ms };
  };
  const timed = async (name: string, times: number, call: () => Promise<{ ms: number }>) => {
    const samples: number[] = [];
    for (let i = 0; i < times; i++) samples.push((await call()).ms);
    latencies[name] = Math.round(percentile(samples, 50));
    return latencies[name]!;
  };

  beforeAll(async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  }, 60_000);

  afterAll(async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  });

  it("snapshots a 26k-node page quickly and reports the cookie banner as an overlay", async () => {
    await run("browser.navigate", { url: `${site.baseUrl}/?fresh=1` });
    const { data } = await run("browser.snapshot", { maxElements: 30 });
    const overlays = JSON.stringify(data);
    expect(overlays).toContain("cookie-banner");
    expect(await timed("snapshot heavy page", 7, () => run("browser.snapshot", { maxElements: 30 }))).toBeLessThan(250);
  }, 60_000);

  it("types, selects and clicks within bounded latency", async () => {
    await run("browser.navigate", { url: `${site.baseUrl}/checkout/shipping` });
    expect(await timed("type", 5, () => run("browser.type", { selector: "#full-name", text: "Ada Lovelace" }))).toBeLessThan(250);
    expect(await timed("select 200 options", 5, () => run("browser.select", { selector: "#country", value: "Country 150" }))).toBeLessThan(250);
    expect(await timed("click checkbox", 6, () => run("browser.click", { selector: "#terms" }))).toBeLessThan(300);
  }, 60_000);

  it("follows a redirect chain plus script redirect after a click", async () => {
    await run("browser.navigate", { url: `${site.baseUrl}/cart` });
    await run("browser.click", { selector: "#checkout" });
    const { data, ms } = await run("browser.wait", { selector: "#shipping-form", timeoutMs: 10_000 });
    expect(data.title).toMatch(/Shipping/);
    expect(ms).toBeLessThan(2_000);
  }, 60_000);

  it("adopts a target=_blank tab before the click returns", async () => {
    await run("browser.navigate", { url: `${site.baseUrl}/product/3` });
    const { data, ms } = await run("browser.click", { selector: "#size-guide" });
    // No wait step: the snapshot returned with the click is already the new tab.
    expect(data.title).toBe("Size guide");
    latencies["click opening popup"] = Math.round(ms);
    expect(ms).toBeLessThan(2_000);
  }, 60_000);

  it("reports a showModal dialog as a modal obstruction", async () => {
    await run("browser.navigate", { url: `${site.baseUrl}/checkout/payment` });
    await run("browser.type", { selector: "#card-holder", text: "Ada" });
    await run("browser.type", { selector: "#card-number", text: "4242424242424242" });
    const { data } = await run("browser.click", { selector: "#place-order" });
    expect(JSON.stringify(data)).toMatch(/"hasModal":true/);
  }, 60_000);

  it("keeps per-call overhead on a small page low", async () => {
    await run("browser.navigate", { url: `${site.baseUrl}/size-guide` });
    expect(await timed("snapshot small page", 9, () => run("browser.snapshot", { maxElements: 30 }))).toBeLessThan(100);
    expect(await timed("scroll small page", 5, () => run("browser.scroll", { x: 0, y: 200 }))).toBeLessThan(150);
  }, 60_000);
});
