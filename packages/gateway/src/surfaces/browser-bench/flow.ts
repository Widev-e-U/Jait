import { performance } from "node:perf_hooks";
import { BrowserSurface } from "../browser.js";
import type { SurfaceRegistry } from "../registry.js";
import { createBrowserInteractionTools, createBrowserNavigateTool, createBrowserSnapshotTool } from "../../tools/browser-tools.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../../tools/contracts.js";

/**
 * One step of a scripted agent journey. `tool` runs it through the real Jait
 * browser tools (what an agent pays per call); `raw` performs the same browser
 * effect with plain Playwright and no observation, as a lower bound.
 */
export interface FlowStep {
  name: string;
  tool: string;
  input: (base: string) => Record<string, unknown>;
  raw: (page: RawPage, base: string) => Promise<unknown>;
  /** Optional verification of the tool result; throw to fail the run. */
  verify?: (result: ToolResult) => void;
  /** The step opens a new tab that the journey continues in. */
  opensPopup?: boolean;
}

/** Minimal Playwright page surface used by the raw baseline. */
export interface RawPage {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  fill(selector: string, value: string): Promise<unknown>;
  selectOption(selector: string, value: string): Promise<unknown>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  evaluate<T>(fn: (arg: any) => T, arg?: unknown): Promise<T>;
  title(): Promise<string>;
}

export interface StepTiming { name: string; tool: string; ms: number }
export interface FlowRun { steps: StepTiming[]; totalMs: number }

const data = (result: ToolResult) => (result.data ?? {}) as Record<string, any>;
const expectTitle = (pattern: RegExp) => (result: ToolResult) => {
  const title = String(data(result).title ?? "");
  if (!pattern.test(title)) throw new Error(`Expected title ${pattern}, got "${title}" at ${data(result).url}`);
};

const click = (name: string, selector: string, verify?: FlowStep["verify"]): FlowStep => ({
  name, tool: "browser.click", input: () => ({ selector }), raw: page => page.click(selector), verify,
});
const type = (name: string, selector: string, text: string): FlowStep => ({
  name, tool: "browser.type", input: () => ({ selector, text }), raw: page => page.fill(selector, text),
});
const waitFor = (name: string, selector: string): FlowStep => ({
  name, tool: "browser.wait", input: () => ({ selector, timeoutMs: 15_000 }), raw: page => page.waitForSelector(selector, { timeout: 15_000 }),
});
const navigate = (name: string, path: string, verify?: FlowStep["verify"]): FlowStep => ({
  name, tool: "browser.navigate", input: base => ({ url: `${base}${path}` }), raw: (page, base) => page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" }), verify,
});
const observe = (name: string, verify?: FlowStep["verify"]): FlowStep => ({
  name, tool: "browser.snapshot", input: () => ({ maxElements: 30 }), raw: page => page.title(), verify,
});
const select = (name: string, selector: string, value: string): FlowStep => ({
  name, tool: "browser.select", input: () => ({ selector, value }), raw: page => page.selectOption(selector, value),
});
const scroll = (name: string, y: number): FlowStep => ({
  name, tool: "browser.scroll", input: () => ({ x: 0, y }), raw: page => page.evaluate((top: number) => (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, top), y),
});

/** A shopping journey across the fixture site: ~40 agent tool calls. */
export const SHOP_JOURNEY: FlowStep[] = [
  navigate("open heavy home page", "/?fresh=1", expectTitle(/Home/)),
  observe("observe home"),
  click("accept cookie banner", "#accept-cookies"),
  type("type search query", "#search-input", "ergonomic chair"),
  click("submit search", "#search-submit"),
  waitFor("wait for client-rendered results", "#results li"),
  observe("observe results", expectTitle(/Search/)),
  click("go to next results page", "#next-page"),
  waitFor("wait for page 2 results", "#results li"),
  click("open product", "#results li:nth-child(3) a"),
  waitFor("wait for product page", "#product-title"),
  click("open reviews tab", "#tab-reviews"),
  click("open options menu", "#options-button"),
  waitFor("wait for lazy menu", "#options-menu"),
  click("choose Compare", "#menu-compare"),
  select("choose size", "#size", "m"),
  type("set quantity", "#quantity", "2"),
  click("add to cart", "#add-to-cart"),
  waitFor("wait for cart toast", "#toast"),
  observe("observe product after add"),
  { ...click("open size guide popup", "#size-guide"), opensPopup: true },
  waitFor("wait for popup content", "table"),
  navigate("go to cart", "/cart", expectTitle(/cart/i)),
  click("proceed to checkout (redirect chain + script redirect)", "#checkout"),
  waitFor("wait for shipping form", "#shipping-form"),
  observe("observe shipping form", expectTitle(/Shipping/)),
  type("fill full name", "#full-name", "Ada Lovelace"),
  type("fill email", "#email", "ada@example.test"),
  type("fill address", "#address", "12 Analytical Engine Way"),
  type("fill city", "#city", "London"),
  select("choose country", "#country", "Country 150"),
  click("choose express delivery", "#speed-express"),
  click("accept terms", "#terms"),
  click("continue to payment", "#continue"),
  waitFor("wait for payment form", "#payment-form"),
  type("fill card holder", "#card-holder", "Ada Lovelace"),
  type("fill card number", "#card-number", "4242424242424242"),
  select("choose expiry month", "#exp-month", "7"),
  click("place order (opens modal)", "#place-order"),
  waitFor("wait for confirm dialog", "#confirm-dialog[open]"),
  click("confirm order in modal", "#confirm-order"),
  waitFor("wait for confirmation", "#confirmation"),
  observe("verify confirmation", expectTitle(/Order confirmed/)),
  navigate("open SPA account", "/account"),
  click("SPA route to addresses", "#route-addresses"),
  click("SPA route to activity", "#route-activity"),
  scroll("scroll feed to bottom", 100_000),
  waitFor("wait for infinite scroll batch", "#feed li:nth-child(80)"),
  scroll("scroll feed again", 200_000),
  waitFor("wait for second batch", "#feed li:nth-child(120)"),
  observe("observe account", expectTitle(/activity/)),
];

export interface JaitFlowHarness {
  surface: BrowserSurface;
  tools: Map<string, ToolDefinition>;
  context: ToolContext;
}

export async function startJaitHarness(sessionId: string, projectRoot: string): Promise<JaitFlowHarness> {
  const surface = new BrowserSurface(`browser-${sessionId}`);
  const context: ToolContext = { sessionId, actionId: "browser-bench", projectRoot, requestedBy: "benchmark" } as ToolContext;
  await surface.start(context as never);
  const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
  const tools = new Map<string, ToolDefinition>();
  for (const tool of [createBrowserNavigateTool(registry), createBrowserSnapshotTool(registry), ...createBrowserInteractionTools(registry)]) {
    tools.set(tool.name, tool as ToolDefinition);
  }
  return { surface, tools, context };
}

export async function runJaitFlow(harness: JaitFlowHarness, base: string, steps = SHOP_JOURNEY): Promise<FlowRun> {
  const timings: StepTiming[] = [];
  const started = performance.now();
  for (const step of steps) {
    const tool = harness.tools.get(step.tool);
    if (!tool) throw new Error(`Unknown tool ${step.tool}`);
    const t0 = performance.now();
    let result: ToolResult;
    try {
      result = await tool.execute(step.input(base), harness.context);
    } catch (error) {
      throw new Error(`Step "${step.name}" threw: ${error instanceof Error ? error.message : String(error)}`);
    }
    const ms = performance.now() - t0;
    if (!result.ok) throw new Error(`Step "${step.name}" failed: ${result.message}`);
    step.verify?.(result);
    timings.push({ name: step.name, tool: step.tool, ms });
  }
  return { steps: timings, totalMs: performance.now() - started };
}

export async function runRawFlow(page: RawPage, base: string, steps = SHOP_JOURNEY, onPopup?: () => Promise<RawPage>): Promise<FlowRun> {
  const timings: StepTiming[] = [];
  const started = performance.now();
  let current = page;
  for (const step of steps) {
    const t0 = performance.now();
    if (step.opensPopup && onPopup) {
      const popup = onPopup();
      await step.raw(current, base);
      current = await popup;
    } else {
      await step.raw(current, base);
    }
    timings.push({ name: step.name, tool: step.tool, ms: performance.now() - t0 });
  }
  return { steps: timings, totalMs: performance.now() - started };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export function summarizeRuns(runs: FlowRun[]) {
  const byTool = new Map<string, number[]>();
  const byStep = new Map<string, number[]>();
  for (const run of runs) {
    for (const step of run.steps) {
      byTool.set(step.tool, [...(byTool.get(step.tool) ?? []), step.ms]);
      byStep.set(step.name, [...(byStep.get(step.name) ?? []), step.ms]);
    }
  }
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    runs: runs.length,
    totalMs: { median: round(percentile(runs.map(run => run.totalMs), 50)), min: round(Math.min(...runs.map(run => run.totalMs))) },
    byTool: Object.fromEntries([...byTool].map(([tool, values]) => [tool, {
      calls: values.length / runs.length, p50: round(percentile(values, 50)), p95: round(percentile(values, 95)), sumPerRun: round(values.reduce((a, b) => a + b, 0) / runs.length),
    }])),
    slowestSteps: [...byStep].map(([name, values]) => ({ name, p50: round(percentile(values, 50)) }))
      .sort((a, b) => b.p50 - a.p50).slice(0, 10),
    stepP50: Object.fromEntries([...byStep].map(([name, values]) => [name, round(percentile(values, 50))])),
  };
}
