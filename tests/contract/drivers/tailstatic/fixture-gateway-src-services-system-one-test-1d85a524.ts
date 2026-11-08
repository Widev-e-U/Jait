// Translated fixture from packages/gateway/src/services/system-one.test.ts; expected literals are in tail_static.rs.
import { evaluateDecision, rankSystemOne, resolveSystemOne, systemOneEnabled } from "../../../../packages/gateway/src/services/system-one.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { buildSystemOneToolSchemas, buildTieredToolSchemas } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { createDecisionEvaluateTool } from "../../../../packages/gateway/src/tools/decision.js";
import { buildSystemPrompt } from "../../../../packages/gateway/src/tools/prompts/index.js";
import { buildCliProviderSystemPrompt } from "../../../../packages/gateway/src/routes/chat.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/system-one.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_system_one_test_ts_25_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const r = registry(); const opts = { query: "read project file" };
    __jait_capture(0, (systemOneEnabled({ JEV_API_KEY: "  " })));
    __jait_capture(1, (await buildSystemOneToolSchemas(r, undefined, opts)), (buildTieredToolSchemas(r, undefined, opts)));
    __jait_capture(2, (await r.rankSearchWithSystemOne("read files")), (r.rankSearch("read files")));
    await __jait_rejected(3, evaluateDecision({}, "some context", questions));
    __jait_capture(4, (fetcher.mock.calls));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_35_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status: 503 })));
    const account = keys();
    const context = { sessionId: "decision-test", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: account };
    const input = { state: "fixture", questions: [{ id: "relevant", type: "noul" as const, instructions: "Relevant?" }] };
    const tool = createDecisionEvaluateTool();
    const first = await tool.execute(input, context);
    __jait_capture(0, (first));
    __jait_capture(1, (first.message));
    __jait_capture(2, (await tool.execute(input, context)));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_47_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json")));
    await __jait_captureRejected(0, (evaluateDecision(keys(), "fixture", questions)));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_52_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetcher = vi.fn().mockImplementation(async () => response({ relevant: { type: "noul", noul: 0.9 } })); vi.stubGlobal("fetch", fetcher);
    const account = keys();
    await evaluateDecision(account, "user request", questions);
    await evaluateDecision(account, "user request", questions);
    await evaluateDecision(keys(), "user request", questions);
    __jait_capture(0, (fetcher.mock.calls));
    const [url, init] = fetcher.mock.calls[0]!;
    __jait_capture(1, (url));
    __jait_capture(2, (init.headers.Authorization), (`Bearer ${account.JEV_API_KEY}`));
    __jait_capture(3, (JSON.parse(init.body)), ({ model: "jev-latest", state: "user request", questions }));
    __jait_capture(4, (init.redirect));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_66_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      __jait_capture(0, (init.body));
      return response(Object.fromEntries(Object.entries(body.questions).map(([id, q]) => [id, { type: "noul", noul: (q as { instructions: string }).instructions.includes("web.search") ? 0.95 : 0.1 }])));
    }); vi.stubGlobal("fetch", fetcher);
    const r = registry();
    const schemas = await buildSystemOneToolSchemas(r, new Set(["secret.read"]), { query: "read project files but need public information", selectionLimit: 1 }, keys());
    const names = schemas.map(s => s.function.name);
    __jait_capture(1, (names)); __jait_capture(2, (names));
    __jait_capture(3, (names)); __jait_capture(4, (names));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_79_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetcher = vi.fn().mockResolvedValue(new Response("outage", { status: 503 })); vi.stubGlobal("fetch", fetcher);
    const r = registry(); const account = keys();
    __jait_capture(0, (await r.rankSearchWithSystemOne("zzzzzzzz", {}, account)));
    __jait_capture(1, (await r.rankSearchWithSystemOne("read files", {}, account)), (r.rankSearch("read files")));
    __jait_capture(2, (fetcher.mock.calls));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_87_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ item0: { type: "noul", noul: 4 } })));
    const memories = ["prefers concise replies", "uses Linux"];
    __jait_capture(0, (await rankSystemOne(keys(), "user preferences", memories, x => x, "memory")), (memories));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_93_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    })));
    const items = ["memory one", "memory two"];
    __jait_capture(0, (await rankSystemOne(keys(), "request", items, x => x, "memory")), (items));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_101_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController(); controller.abort();
    const items = ["one", "two"];
    __jait_capture(0, (await rankSystemOne(keys(), "request", items, x => x, "memory", controller.signal)), (items));
    __jait_capture(1, (fetcher.mock.calls));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_109_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetcher = vi.fn().mockResolvedValue(response({
      route: { type: "choice", choice: "technical", confidence: 0.9 },
      severity: { type: "score", score: 1.2, confidence: 0.7 }, urgent: { type: "noul", noul: 0.8 },
    })); vi.stubGlobal("fetch", fetcher);
    const result = await createDecisionEvaluateTool().execute({ state: "Payment integration fails for all customers", questions: [
      { id: "route", type: "choice", instructions: "Which team?", options: [{ id: "billing", description: "Invoices" }, { id: "technical", description: "Integration errors" }] },
      { id: "severity", type: "score", instructions: "How severe?", levels: ["Minor", "Major", "Critical"] },
      { id: "urgent", type: "noul", instructions: "Is this urgent?" },
    ] }, { sessionId: "s", actionId: "a", projectRoot: "/tmp", requestedBy: "test", apiKeys: keys() });
    __jait_capture(0, (result.ok)); __jait_capture(1, (fetcher.mock.calls));
    __jait_capture(2, (JSON.parse(fetcher.mock.calls[0]![1].body).questions.route.criteria));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_123_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ route: { type: "choice", choice: "invented" } })));
    await __jait_rejected(0, evaluateDecision(keys(), "request", { route: { type: "choice", instructions: "Pick", criteria: { a: "a", b: "b" } } }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ level: { type: "score", score: 8 } })));
    await __jait_rejected(1, evaluateDecision(keys(), "request", { level: { type: "score", instructions: "Rate", criteria: ["low", "high"] } }));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_130_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const endpoint = { model: "test-model" };
    __jait_capture(0, (buildSystemPrompt("agent", endpoint, {})));
    __jait_capture(1, (buildSystemPrompt("agent", endpoint, { systemOne: true })));
    __jait_capture(2, (buildCliProviderSystemPrompt("codex", undefined, "agent", {})));
    __jait_capture(3, (buildCliProviderSystemPrompt("codex", undefined, "agent", { systemOne: true })));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_138_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (resolveSystemOne({ JEV_API_KEY: "legacy", SYSTEM_ONE_API_KEY: "generic", SYSTEM_ONE_MODEL: "gpt-4o-mini" })));
    __jait_capture(1, (resolveSystemOne({ JEV_API_KEY: "legacy", JEV_MODEL: "jev-latest" })));
    // A generic endpoint may be keyless (e.g. a local Ollama server).
    __jait_capture(2, (resolveSystemOne({ SYSTEM_ONE_BASE_URL: "http://localhost:11434/v1" })));
    __jait_captureType(3, (resolveSystemOne({})));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_149_3": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answers: { relevant: { type: "noul", noul: 0.9 } } }) } }],
    }))); vi.stubGlobal("fetch", fetcher);
    const account = { SYSTEM_ONE_BASE_URL: "https://api.example.com/v1/", SYSTEM_ONE_API_KEY: `generic-${++sequence}`, SYSTEM_ONE_MODEL: "gpt-4o-mini" };
    __jait_capture(0, (systemOneEnabled(account)));
    const result = await evaluateDecision(account, "user request", questions);
    __jait_capture(1, (result.answers.relevant.noul));
    const [url, init] = fetcher.mock.calls[0]!;
    __jait_capture(2, (url));
    __jait_capture(3, (init.headers.Authorization), (`Bearer ${account.SYSTEM_ONE_API_KEY}`));
    __jait_capture(4, (JSON.parse(init.body)));
    __jait_capture(5, (JSON.parse(init.body).messages[0].role));
  
})();

} finally {
await __jait_hook_790();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_system_one_test_ts_165_1": {


let sequence = 0;
const keys = () => ({ JEV_API_KEY: `test-account-${++sequence}` });
const questions = { relevant: { type: "noul" as const, instructions: "Is this relevant?" } };
const response = (answers: unknown) => new Response(JSON.stringify({ model: "jev-latest", answers }));
function registry() {
  const r = new ToolRegistry();
  for (const [name, description, tier] of [
    ["tools.search", "Find tools", "core"], ["file.read", "Read project files", "standard"],
    ["web.search", "Search the web", "standard"], ["secret.read", "Read confidential record", "standard"],
  ] as const) r.register({ name, description, tier, parameters: { type: "object", properties: {} }, execute: async () => ({ ok: true, message: "ok" }) });
  r.register(createDecisionEvaluateTool());
  return r;
}
const __jait_hook_790 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  vi.stubGlobal("fetch", vi.fn(async () => response({ item0: { type: "noul", noul: 0.1 }, item1: { type: "noul", noul: 0.9 } })));
  __jait_capture(0, (await rankSystemOne(keys(), "fixture file", ["network notes", "fixture instructions"], x => x, "memory", undefined, undefined, 0.5)));

})();

} finally {
await __jait_hook_790();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
