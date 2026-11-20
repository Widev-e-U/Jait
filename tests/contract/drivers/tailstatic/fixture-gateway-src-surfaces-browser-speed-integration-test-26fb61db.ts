// Translated fixture from packages/gateway/src/surfaces/browser-speed.integration.test.ts; expected literals are in tail_static.rs.
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { startFixtureSite, type FixtureSite } from "../../../../packages/gateway/src/surfaces/browser-bench/fixture-site.js";
import { percentile, startJaitHarness, type JaitFlowHarness } from "../../../../packages/gateway/src/surfaces/browser-bench/flow.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/surfaces/browser-speed.integration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_53_3_each0": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/?fresh=1` });
    const { data } = await run("browser.snapshot", { maxElements: 30 });
    const overlays = JSON.stringify(data);
    __jait_capture(0, (overlays));
    __jait_capture(1, (await timed("snapshot heavy page", 7, () => run("browser.snapshot", { maxElements: 30 }))));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_61_3_each0": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/checkout/shipping` });
    __jait_capture(0, (await timed("type", 5, () => run("browser.type", { selector: "#full-name", text: "Ada Lovelace" }))));
    __jait_capture(1, (await timed("select 200 options", 5, () => run("browser.select", { selector: "#country", value: "Country 150" }))));
    __jait_capture(2, (await timed("click checkbox", 6, () => run("browser.click", { selector: "#terms" }))));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_68_3_each0": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/cart` });
    await run("browser.click", { selector: "#checkout" });
    const { data, ms } = await run("browser.wait", { selector: "#shipping-form", timeoutMs: 10_000 });
    __jait_capture(0, (data.title));
    __jait_capture(1, (ms));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_76_3_each0": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/product/3` });
    const { data, ms } = await run("browser.click", { selector: "#size-guide" });
    // No wait step: the snapshot returned with the click is already the new tab.
    __jait_capture(0, (data.title));
    latencies["click opening popup"] = Math.round(ms);
    __jait_capture(1, (ms));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_85_3_each0": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/checkout/payment` });
    await run("browser.type", { selector: "#card-holder", text: "Ada" });
    await run("browser.type", { selector: "#card-number", text: "4242424242424242" });
    const { data } = await run("browser.click", { selector: "#place-order" });
    __jait_capture(0, (JSON.stringify(data)));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_93_3_each0": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/size-guide` });
    __jait_capture(0, (await timed("snapshot small page", 9, () => run("browser.snapshot", { maxElements: 30 }))));
    __jait_capture(1, (await timed("scroll small page", 5, () => run("browser.scroll", { x: 0, y: 200 }))));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_53_3_each1": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/?fresh=1` });
    const { data } = await run("browser.snapshot", { maxElements: 30 });
    const overlays = JSON.stringify(data);
    __jait_capture(0, (overlays));
    __jait_capture(1, (await timed("snapshot heavy page", 7, () => run("browser.snapshot", { maxElements: 30 }))));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_61_3_each1": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/checkout/shipping` });
    __jait_capture(0, (await timed("type", 5, () => run("browser.type", { selector: "#full-name", text: "Ada Lovelace" }))));
    __jait_capture(1, (await timed("select 200 options", 5, () => run("browser.select", { selector: "#country", value: "Country 150" }))));
    __jait_capture(2, (await timed("click checkbox", 6, () => run("browser.click", { selector: "#terms" }))));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_68_3_each1": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/cart` });
    await run("browser.click", { selector: "#checkout" });
    const { data, ms } = await run("browser.wait", { selector: "#shipping-form", timeoutMs: 10_000 });
    __jait_capture(0, (data.title));
    __jait_capture(1, (ms));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_76_3_each1": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/product/3` });
    const { data, ms } = await run("browser.click", { selector: "#size-guide" });
    // No wait step: the snapshot returned with the click is already the new tab.
    __jait_capture(0, (data.title));
    latencies["click opening popup"] = Math.round(ms);
    __jait_capture(1, (ms));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_85_3_each1": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/checkout/payment` });
    await run("browser.type", { selector: "#card-holder", text: "Ada" });
    await run("browser.type", { selector: "#card-number", text: "4242424242424242" });
    const { data } = await run("browser.click", { selector: "#place-order" });
    __jait_capture(0, (JSON.stringify(data)));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_speed_integration_test_ts_93_3_each1": {


const repoRoot = resolve(__jait_original_dir, "../../../..");
const enabled = process.env["JAIT_BROWSER_INTEGRATION"] === "1";
/*__jait_source_gate__ skipIf !enabled */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
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
const __jait_hook_1698 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "false");
    vi.stubEnv("BROWSER_HEADLESS", "true");
    vi.stubEnv("BROWSER_CHANNEL", "");
    vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
    vi.stubEnv("BROWSER_RUNTIME", runtime);
    site = await startFixtureSite();
    harness = await startJaitHarness(`speed-${runtime}-${Date.now()}`, repoRoot);
  };
const __jait_hook_2080 = async () => {
    console.log(`[browser speed ${runtime}] p50 ms`, JSON.stringify(latencies));
    await harness?.surface.stop();
    await site?.close();
    vi.unstubAllEnvs();
  };
await __jait_hook_1698();
try {
await (async()=>{

    await run("browser.navigate", { url: `${site.baseUrl}/size-guide` });
    __jait_capture(0, (await timed("snapshot small page", 9, () => run("browser.snapshot", { maxElements: 30 }))));
    __jait_capture(1, (await timed("scroll small page", 5, () => run("browser.scroll", { x: 0, y: 200 }))));
  
})();

} finally {
await __jait_hook_2080();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
