// Translated fixture from packages/gateway/src/surfaces/browser-bench/browser-flow.bench.test.ts; expected literals are in tail_static.rs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { startFixtureSite, type FixtureSite } from "../../../../packages/gateway/src/surfaces/browser-bench/fixture-site.js";
import { SHOP_JOURNEY, runJaitFlow, runRawFlow, startJaitHarness, summarizeRuns, type FlowRun, type FlowStep, type RawPage } from "../../../../packages/gateway/src/surfaces/browser-bench/flow.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/surfaces/browser-bench/browser-flow.bench.test.ts",import.meta.url).href;
const __jait_require=__jait_createRequire(__jait_original_url);
const __jait_original_dir=__jait_fileURLToPath(new URL('.',__jait_original_url));
const __jait_fixture_dir=__jait_fileURLToPath(new URL('../../../../.jait/artifacts/gateway-rust-readiness/tailstatic-fixtures/',import.meta.url));
const __jait_symbols=new Map<symbol,number>();
const __jait_nestedRefs=new WeakMap<object,number>();let __jait_nextNestedRef=1;
function __jait_nestedRef(value:object):number{let id=__jait_nestedRefs.get(value);if(!id){id=__jait_nextNestedRef++;__jait_nestedRefs.set(value,id)}return id;}
// Fixture transport only. Rust owns all comparison semantics.
function __jait_boxed(value: any): any {
 const type=typeof value;
 if(type==='symbol'){let id=__jait_symbols.get(value);if(!id){id=__jait_symbols.size+1;__jait_symbols.set(value,id)}return {type,value:id};}
 if(type==='function')return {type,name:value.name};
 if(type==='undefined')return {type};
 if(type==='bigint')return {type,value:String(value)};
 if(type==='number'&&!Number.isFinite(value))return {type:'nonfinite',value:String(value)};
 const prototype=type==='object'&&value!==null?(Object.getPrototypeOf(value)?.constructor?.name??null):null;
 if(value instanceof Error)value={...value,name:value.name,message:value.message,...('cause' in value?{cause:value.cause}:{})};
 return JSON.parse(JSON.stringify({type,value,prototype},function(this:any,_key:string,child:any){const original=Object.getOwnPropertyDescriptor(this,_key)?.value;if(original instanceof Date)return {__jait_type:'date',value:Number.isNaN(original.getTime())?'NaN':original.toISOString()};if(typeof child==='string'&&!child.isWellFormed())return {__jait_type:'utf16',units:Array.from({length:child.length},(_,i)=>child.charCodeAt(i))};if(typeof AbortSignal!=='undefined'&&child instanceof AbortSignal)return {__jait_type:'AbortSignal',aborted:child.aborted,ref:__jait_nestedRef(child)};if(child instanceof Map)return {__jait_type:'map',entries:[...child]};if(child instanceof Set)return {__jait_type:'set',values:[...child]};if(child instanceof RegExp)return {__jait_type:'regexp',source:child.source,flags:child.flags};if(ArrayBuffer.isView(child)&&!(child instanceof DataView))return {__jait_type:child.constructor.name,values:Array.from(child as any)};if(typeof child==='number'&&!Number.isFinite(child))return {__jait_type:'nonfinite',value:String(child)};return typeof child==='bigint'?{__jait_type:'bigint',value:String(child)}:typeof child==='undefined'?{__jait_type:'undefined'}:typeof child==='function'?{__jait_type:'function',ref:__jait_nestedRef(child)}:child;}));
}

export async function run(name: string): Promise<unknown> {
 await __jait_mkdir(__jait_fixture_dir,{recursive:true});
 const __jait_observations: any[]=[];
 const __jait_record=(row:any)=>{__jait_observations.push(row);__jait_observe(row)};
 const __jait_refs=new WeakMap<object,number>(); let __jait_nextRef=1;
 const __jait_ref=(v:any)=>{if((typeof v!=='object'||v===null)&&typeof v!=='function')return null;let n=__jait_refs.get(v);if(!n){n=__jait_nextRef++;__jait_refs.set(v,n)}return n};
 const __jait_capture=(slot:number,actual:any,...other:any[])=>{const row:any={slot,actual:__jait_boxed(actual),ref:__jait_ref(actual)};if(Array.isArray(actual)||actual instanceof Set)row.itemRefs=Array.from(actual,__jait_ref);if(other.length){row.other=__jait_boxed(other[0]);row.otherRef=__jait_ref(other[0])}__jait_record(row)};
 const __jait_captureType=(slot:number,actual:any)=>__jait_record({slot,actual:(typeof actual==='object'&&actual!==null)?{type:'object',value:{}}:__jait_boxed(actual)});
 const __jait_captureResolved=async(slot:number,p:Promise<unknown>,...other:any[])=>__jait_capture(slot,await p,...other);
 const __jait_errorRow=(slot:number,e:any,expected?:any)=>{const errorTypes=[],prototypes=[];let p=e&&typeof e==='object'?Object.getPrototypeOf(e):null;while(p){if(p.constructor?.name)errorTypes.push(p.constructor.name);prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}const identity=typeof expected==='function';if(identity&&(expected[Symbol.hasInstance]!==Function.prototype[Symbol.hasInstance]||expected.prototype===null||typeof expected.prototype!=='object'))throw new Error('unsupported exception constructor identity');return {slot,threw:true,error:String(e instanceof Error?e.message:e),errorTypes,...(identity?{prototypes,expectedPrototype:__jait_ref(expected.prototype)}:{})}};
 const __jait_thrown=(slot:number,fn:()=>unknown,...other:any[])=>{let row:any;try{fn();row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_rejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{await p;row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_captureRejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{const actual=await p;row={slot,threw:false,actual:__jait_boxed(actual)}}catch(e){row={...__jait_errorRow(slot,e,other[0]),actual:__jait_boxed(e)}}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_instance=(slot:number,actual:any,expected:any,threw?:boolean)=>{const prototypes=[];let p=actual==null?null:Object.getPrototypeOf(actual);while(p){prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}__jait_record({slot,prototypes,expectedPrototype:__jait_ref(expected.prototype),...(threw===undefined?{}:{threw})})};
 const __jait_instanceRejected=async(slot:number,p:Promise<unknown>,expected:any)=>{let actual:any,threw=false;try{actual=await p}catch(e){actual=e;threw=true}__jait_instance(slot,actual,expected,threw)};
 switch(name){
case "tailstatic_packages_gateway_src_surfaces_browser_bench_browser_flow_bench_test_ts_67_3": {


const enabled = process.env["JAIT_BROWSER_BENCH"] === "1";
const repoRoot = resolve(__jait_original_dir, "../../../../..");
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
    const raw = report.raw?.stepP50;
    if (raw) {
      const overhead = Object.entries(summary.stepP50)
        .map(([name, p50]) => ({ name, extra: Math.round(p50 - (raw[name] ?? 0)) }))
        .sort((a, b) => b.extra - a.extra).slice(0, 12);
      lines.push("", "Largest overhead vs raw Playwright (p50 difference):", "", ...overhead.map(step => `- ${step.name}: +${step.extra} ms`));
    }
  }
  if (report.live) {
    for (const [runtime, steps] of Object.entries(report.live)) {
      lines.push("", `## Live internet (${runtime})`, "", "| Step | ms | ok |", "|---|---:|---|", ...steps.map(step => `| ${step.name} | ${step.ms} | ${step.ok ? "yes" : `no: ${step.error ?? ""}`} |`));
    }
  }
  return lines.join("\n");
}
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
let site: FixtureSite;
const __jait_hook_2169 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    site = await startFixtureSite();
  };
const __jait_hook_2417 = async () => {
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
  };
await __jait_hook_2169();
try {
await (async()=>{

    const { chromium } = await import(Bun.resolveSync("playwright", __jait_original_dir));
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
  
})();
__jait_record({slot:0,completed:true});
} finally {
await __jait_hook_2417();
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_bench_browser_flow_bench_test_ts_89_5_runtime": {


const enabled = process.env["JAIT_BROWSER_BENCH"] === "1";
const repoRoot = resolve(__jait_original_dir, "../../../../..");
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
    const raw = report.raw?.stepP50;
    if (raw) {
      const overhead = Object.entries(summary.stepP50)
        .map(([name, p50]) => ({ name, extra: Math.round(p50 - (raw[name] ?? 0)) }))
        .sort((a, b) => b.extra - a.extra).slice(0, 12);
      lines.push("", "Largest overhead vs raw Playwright (p50 difference):", "", ...overhead.map(step => `- ${step.name}: +${step.extra} ms`));
    }
  }
  if (report.live) {
    for (const [runtime, steps] of Object.entries(report.live)) {
      lines.push("", `## Live internet (${runtime})`, "", "| Step | ms | ok |", "|---|---:|---|", ...steps.map(step => `| ${step.name} | ${step.ms} | ${step.ok ? "yes" : `no: ${step.error ?? ""}`} |`));
    }
  }
  return lines.join("\n");
}
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
let site: FixtureSite;
const __jait_hook_2169 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    site = await startFixtureSite();
  };
const __jait_hook_2417 = async () => {
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
  };
/*__jait_loop_open__*/for (const runtime of runtimes) {
await __jait_hook_2169();
try {
await (async()=>{

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
        __jait_capture(0, (results), (runs));
      } finally {
        await harness.surface.stop();
      }
    
})();

} finally {
await __jait_hook_2417();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_bench_browser_flow_bench_test_ts_107_3": {


const enabled = process.env["JAIT_BROWSER_BENCH"] === "1";
const repoRoot = resolve(__jait_original_dir, "../../../../..");
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
    const raw = report.raw?.stepP50;
    if (raw) {
      const overhead = Object.entries(summary.stepP50)
        .map(([name, p50]) => ({ name, extra: Math.round(p50 - (raw[name] ?? 0)) }))
        .sort((a, b) => b.extra - a.extra).slice(0, 12);
      lines.push("", "Largest overhead vs raw Playwright (p50 difference):", "", ...overhead.map(step => `- ${step.name}: +${step.extra} ms`));
    }
  }
  if (report.live) {
    for (const [runtime, steps] of Object.entries(report.live)) {
      lines.push("", `## Live internet (${runtime})`, "", "| Step | ms | ok |", "|---|---:|---|", ...steps.map(step => `| ${step.name} | ${step.ms} | ${step.ok ? "yes" : `no: ${step.error ?? ""}`} |`));
    }
  }
  return lines.join("\n");
}
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
let site: FixtureSite;
const __jait_hook_2169 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    site = await startFixtureSite();
  };
const __jait_hook_2417 = async () => {
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
  };
/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_BENCH_LIVE"] !== "1" */
await __jait_hook_2169();
try {
await (async()=>{

    vi.stubEnv("BROWSER_RUNTIME", runtimes[0] ?? "in-process");
    const harness = await startJaitHarness(`bench-live-${Date.now()}`, repoRoot);
    const steps: Array<Pick<FlowStep, "name" | "tool"> & { input: Record<string, unknown> }> = [
      { name: "open Wikipedia article", tool: "browser.navigate", input: { url: "https://en.wikipedia.org/wiki/Web_browser" } },
      { name: "observe Wikipedia article", tool: "browser.snapshot", input: { maxElements: 30 } },
      { name: "follow first article link", tool: "browser.click", input: { selector: "#mw-content-text p a[href^='https://en.wikipedia.org/wiki/']" } },
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
    __jait_capture(0, (results.filter(result => result.ok).length), (steps.length / 2));
  
})();

} finally {
await __jait_hook_2417();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
