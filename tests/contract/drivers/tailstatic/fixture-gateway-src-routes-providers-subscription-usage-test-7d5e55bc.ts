// Translated fixture from packages/gateway/src/routes/providers-subscription-usage.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { registerProviderRoutes } from "../../../../packages/gateway/src/routes/providers.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/providers-subscription-usage.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_providers_subscription_usage_test_ts_19_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const html = `<div data-usage-meter><div data-usage-track aria-label="Session usage: 40%"></div></div><div data-time="2026-10-09T12:00:00Z"></div><div data-usage-meter><div data-usage-track aria-label="Weekly usage: 80%"></div></div>`;
async function setup(keys: Record<string, string> = {}) {
  const config = loadConfig(); const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const updateSettings = vi.fn(), recordOllamaUsage = vi.fn(), recordOpenCodeGoUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, { providerRegistry: new ProviderRegistry(),
    userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", ...keys } }), updateSettings } as never,
    providerUsageService: { recordOllamaUsage, recordOpenCodeGoUsage, listForUser: () => [] } as never,
  });
  return { app, token, updateSettings, recordOllamaUsage, recordOpenCodeGoUsage };
}
const __jait_hook_538 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  const mock = vi.fn().mockResolvedValue(new Response(html)); vi.stubGlobal("fetch", mock);
  const { app, token, updateSettings } = await setup();
  try {
    const r = await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", headers: { authorization: `Bearer ${token}` }, payload: { session: " private-cookie " } });
    __jait_capture(0, (r.statusCode)); __jait_capture(1, (r.body));
    __jait_capture(2, (updateSettings.mock.calls));
    mock.mockResolvedValue(new Response("login", { status: 303 })); updateSettings.mockClear();
    const failed = await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", headers: { authorization: `Bearer ${token}` }, payload: { session: "expired-cookie" } });
    __jait_capture(3, (failed.statusCode)); __jait_capture(4, (updateSettings.mock.calls));
    const denied = await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", payload: { session: "cookie" } });
    __jait_capture(5, (denied.statusCode)); __jait_capture(6, (mock.mock.calls));
  } finally { await app.close(); }

})();

} finally {
await __jait_hook_538();
}


break;
}
case "tailstatic_packages_gateway_src_routes_providers_subscription_usage_test_ts_33_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const html = `<div data-usage-meter><div data-usage-track aria-label="Session usage: 40%"></div></div><div data-time="2026-10-09T12:00:00Z"></div><div data-usage-meter><div data-usage-track aria-label="Weekly usage: 80%"></div></div>`;
async function setup(keys: Record<string, string> = {}) {
  const config = loadConfig(); const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const updateSettings = vi.fn(), recordOllamaUsage = vi.fn(), recordOpenCodeGoUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, { providerRegistry: new ProviderRegistry(),
    userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", ...keys } }), updateSettings } as never,
    providerUsageService: { recordOllamaUsage, recordOpenCodeGoUsage, listForUser: () => [] } as never,
  });
  return { app, token, updateSettings, recordOllamaUsage, recordOpenCodeGoUsage };
}
const __jait_hook_538 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  const mock = vi.fn(); vi.stubGlobal("fetch", mock);
  const { app, token, updateSettings } = await setup({ OLLAMA_SESSION_COOKIE: "old" });
  try {
    __jait_capture(0, ((await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", headers: { authorization: `Bearer ${token}` }, payload: { session: null } })).statusCode));
    __jait_capture(1, (updateSettings.mock.calls)); __jait_capture(2, (mock.mock.calls));
  } finally { await app.close(); }

})();

} finally {
await __jait_hook_538();
}


break;
}
case "tailstatic_packages_gateway_src_routes_providers_subscription_usage_test_ts_41_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const html = `<div data-usage-meter><div data-usage-track aria-label="Session usage: 40%"></div></div><div data-time="2026-10-09T12:00:00Z"></div><div data-usage-meter><div data-usage-track aria-label="Weekly usage: 80%"></div></div>`;
async function setup(keys: Record<string, string> = {}) {
  const config = loadConfig(); const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const updateSettings = vi.fn(), recordOllamaUsage = vi.fn(), recordOpenCodeGoUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, { providerRegistry: new ProviderRegistry(),
    userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", ...keys } }), updateSettings } as never,
    providerUsageService: { recordOllamaUsage, recordOpenCodeGoUsage, listForUser: () => [] } as never,
  });
  return { app, token, updateSettings, recordOllamaUsage, recordOpenCodeGoUsage };
}
const __jait_hook_538 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  const mock = vi.fn()
    .mockRejectedValueOnce(new Error("daemon offline"))
    .mockResolvedValueOnce(new Response(html));
  vi.stubGlobal("fetch", mock);
  const { app, token, recordOllamaUsage } = await setup({ OLLAMA_URL: "http://localhost:11434", OLLAMA_SESSION_COOKIE: "session" });
  try {
    const headers = { authorization: `Bearer ${token}` };
    __jait_capture(0, ((await app.inject({ url: "/api/provider-usage/summary?refresh=0", headers })).statusCode));
    __jait_capture(1, (mock.mock.calls));
    __jait_capture(2, ((await app.inject({ url: "/api/provider-usage/summary", headers })).statusCode));
    __jait_capture(3, (mock.mock.calls));
    __jait_capture(4, (mock.mock.calls[0]?.[0]));
    __jait_capture(5, (mock.mock.calls[1]?.[0]));
    __jait_capture(6, (recordOllamaUsage.mock.calls));
  } finally { await app.close(); }

})();

} finally {
await __jait_hook_538();
}


break;
}
case "tailstatic_packages_gateway_src_routes_providers_subscription_usage_test_ts_58_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const html = `<div data-usage-meter><div data-usage-track aria-label="Session usage: 40%"></div></div><div data-time="2026-10-09T12:00:00Z"></div><div data-usage-meter><div data-usage-track aria-label="Weekly usage: 80%"></div></div>`;
async function setup(keys: Record<string, string> = {}) {
  const config = loadConfig(); const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const updateSettings = vi.fn(), recordOllamaUsage = vi.fn(), recordOpenCodeGoUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, { providerRegistry: new ProviderRegistry(),
    userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", ...keys } }), updateSettings } as never,
    providerUsageService: { recordOllamaUsage, recordOpenCodeGoUsage, listForUser: () => [] } as never,
  });
  return { app, token, updateSettings, recordOllamaUsage, recordOpenCodeGoUsage };
}
const __jait_hook_538 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  const window = { status: "ok", percent: 10, resetsAt: "2026-10-09T12:00:00Z" };
  const mock = vi.fn().mockResolvedValue(Response.json({ usage: { rolling: window, weekly: window, monthly: window } })); vi.stubGlobal("fetch", mock);
  const { app, token, recordOpenCodeGoUsage } = await setup({ OPENCODE_GO_API_KEY: "go-key" });
  try {
    const headers = { authorization: `Bearer ${token}` };
    const cached = await app.inject({ url: "/api/provider-usage/summary?refresh=0", headers });
    __jait_capture(0, (cached.json().profiles[0].providerLabel)); __jait_capture(1, (mock.mock.calls));
    const r = await app.inject({ url: "/api/provider-usage/summary", headers });
    __jait_capture(2, (r.statusCode)); __jait_capture(3, (r.body));
    __jait_capture(4, (recordOpenCodeGoUsage.mock.calls));
  } finally { await app.close(); }

})();

} finally {
await __jait_hook_538();
}


break;
}
case "tailstatic_packages_gateway_src_routes_providers_subscription_usage_test_ts_72_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const html = `<div data-usage-meter><div data-usage-track aria-label="Session usage: 40%"></div></div><div data-time="2026-10-09T12:00:00Z"></div><div data-usage-meter><div data-usage-track aria-label="Weekly usage: 80%"></div></div>`;
async function setup(keys: Record<string, string> = {}) {
  const config = loadConfig(); const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const updateSettings = vi.fn(), recordOllamaUsage = vi.fn(), recordOpenCodeGoUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, { providerRegistry: new ProviderRegistry(),
    userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", ...keys } }), updateSettings } as never,
    providerUsageService: { recordOllamaUsage, recordOpenCodeGoUsage, listForUser: () => [] } as never,
  });
  return { app, token, updateSettings, recordOllamaUsage, recordOpenCodeGoUsage };
}
const __jait_hook_538 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  let finish!: (value: Response) => void;
  const mock = vi.fn((url: string) => url === "http://localhost:11434/api/me"
    ? Promise.reject(new Error("daemon offline"))
    : new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", mock);
  const { app, token, recordOllamaUsage } = await setup({ OLLAMA_URL: "http://localhost:11434", OLLAMA_SESSION_COOKIE: "session" });
  try {
    const headers = { authorization: `Bearer ${token}` };
    const first = app.inject({ url: "/api/provider-usage/summary", headers }).then(r => r);
    const second = app.inject({ url: "/api/provider-usage/summary", headers }).then(r => r);
    await vi.waitFor(() => __jait_capture(0, (mock.mock.calls)));
    // A cache-only read must not wait behind slow provider work.
    __jait_capture(1, ((await app.inject({ url: "/api/provider-usage/summary?refresh=0", headers })).statusCode));
    finish(new Response(html));
    __jait_capture(2, ((await first).statusCode));
    __jait_capture(3, ((await second).statusCode));
    __jait_capture(4, ((await app.inject({ url: "/api/provider-usage/summary", headers })).statusCode));
    __jait_capture(5, (mock.mock.calls));
    __jait_capture(6, (recordOllamaUsage.mock.calls));
  } finally { await app.close(); }

})();

} finally {
await __jait_hook_538();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
