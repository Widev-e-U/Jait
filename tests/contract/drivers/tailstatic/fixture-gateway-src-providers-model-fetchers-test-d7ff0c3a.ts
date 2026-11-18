// Translated fixture from packages/gateway/src/providers/model-fetchers.test.ts; expected literals are in tail_static.rs.
import {
  fetchOllamaModels,
  fetchOmniRouteModels,
  fetchOpenAIModels,
  fetchOpenRouterModels,
  isChatCapableOpenAIModelId,
  resetModelFetcherCaches,
} from "../../../../packages/gateway/src/providers/model-fetchers.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/model-fetchers.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_53_3_each0": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "gpt-4o";
const expected = true;
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_53_3_each1": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "gpt-4o-mini";
const expected = true;
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_53_3_each2": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "o1-preview";
const expected = true;
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_53_3_each3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "o3-mini";
const expected = true;
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_53_3_each4": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "o4-mini";
const expected = true;
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_53_3_each5": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "chatgpt-4o-latest";
const expected = true;
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each0": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "text-embedding-3-large";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each1": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "dall-e-3";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each2": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "whisper-1";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "tts-1";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each4": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "gpt-4o-realtime-preview";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each5": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "gpt-4o-audio-preview";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each6": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "gpt-4o-transcribe";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each7": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "gpt-image-1";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each8": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "gpt-3.5-turbo:ft-acme";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_64_3_each9": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const id = "";
await __jait_hook_1365();
try {
await (async()=>{

    __jait_capture(0, (isChatCapableOpenAIModelId(id)));
  
})();

} finally {
await __jait_hook_1418();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_81_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({
      data: [
        { id: "gpt-4o", owned_by: "openai" },
        { id: "gpt-4o-mini", owned_by: "openai" },
        { id: "gpt-4o-realtime-preview" },
        { id: "dall-e-3" },
        { id: "whisper-1" },
        { id: "o3-mini" },
        { id: "text-embedding-3-large" },
      ],
    });

    const models = await fetchOpenAIModels("k", "https://api.openai.com/v1");

    __jait_capture(0, (models.map((m) => m.id)));
    __jait_capture(1, (models[0]));
    __jait_capture(2, (models[1]));
    __jait_capture(3, (models[2]));
    __jait_captureType(4, (models[2].description));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_103_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({ error: "unauthorized" }, { status: 401 });
    await __jait_captureResolved(0, (fetchOpenAIModels("bad-key", "https://api.openai.com/v1")));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_108_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock = mockFetchOnce({ data: [{ id: "gpt-4o" }] });
    await fetchOpenAIModels("k", "https://api.openai.com/v1///");
    __jait_capture(0, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_117_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock = mockFetchOnce({ data: [{ id: "gpt-4o" }] });
    await fetchOpenAIModels("k", "https://api.openai.com/v1");
    await fetchOpenAIModels("k", "https://api.openai.com/v1");
    __jait_capture(0, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_124_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({ data: [{ id: "gpt-4o" }] });
    await fetchOpenAIModels("k", "https://api.openai.com/v1");
    const fetchMock2 = mockFetchOnce({ data: [{ id: "gpt-4o-mini" }] });
    const result = await fetchOpenAIModels("k", "https://proxy.example.com/v1");
    __jait_capture(0, (fetchMock2.mock.calls));
    __jait_capture(1, (result.map((m) => m.id)));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_133_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({ data: [{ id: "qwen3-coder" }, { id: "glm-5" }] });
    const models = await fetchOpenAIModels("k", "https://compatible.example.com/v1");
    __jait_capture(0, (models.map((model) => model.id)));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_139_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const id = url.includes("first") ? "first-model" : "second-model";
      return new Response(JSON.stringify({ data: [{ id }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      fetchOpenAIModels("first-key", "https://first.example.com/v1"),
      fetchOpenAIModels("second-key", "https://second.example.com/v1"),
    ]);

    __jait_capture(0, (first.map((model) => model.id)));
    __jait_capture(1, (second.map((model) => model.id)));
    __jait_capture(2, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_162_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const longList = Array.from({ length: 150 }, (_, i) => ({
      id: `vendor/model-${i}`,
      ...(i % 7 === 0 ? {} : { name: `Model ${i}` }),
    }));
    longList.push({ id: "vendor/model-free:free", name: "Free Variant" });

    mockFetchOnce({ data: longList });

    const models = await fetchOpenRouterModels("key");

    __jait_capture(0, (models));
    __jait_capture(1, (models.every((m) => !m.id.includes(":free"))));
    const fallback = models.find((m) => m.id === "vendor/model-0");
    __jait_capture(2, (fallback?.name));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_179_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const longDescription = "x".repeat(200);
    mockFetchOnce({
      data: [{ id: "vendor/m1", name: "M1", description: longDescription }],
    });
    const models = await fetchOpenRouterModels("key");
    __jait_capture(0, (models[0].description));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_188_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({}, { status: 502 });
    await __jait_captureResolved(0, (fetchOpenRouterModels("k")));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_193_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock = mockFetchOnce({ data: [{ id: "vendor/m1" }] });
    await fetchOpenRouterModels("k");
    await fetchOpenRouterModels("k");
    __jait_capture(0, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_202_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    // The OpenAI fetcher filters to gpt-*/o* prefixes; applying that here would
    // discard almost all of OmniRoute's ~290-provider catalogue.
    mockFetchOnce({
      data: [
        { id: "deepseek/deepseek-r1", owned_by: "deepseek" },
        { id: "google/gemini-2.5-flash" },
        { id: "openai/gpt-4o" },
      ],
    });

    const models = await fetchOmniRouteModels("k", "http://localhost:20128/v1");

    // Bare "auto" is usable but absent from /v1/models, so it is added by hand.
    __jait_capture(0, (models[0]));
    __jait_capture(1, (models.slice(1).map((m) => m.id)));
    __jait_capture(2, (models.find((m) => m.id === "deepseek/deepseek-r1")?.reasoningEffortSupported));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_225_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({ data: [{ id: "auto" }, { id: "auto/coding" }, { id: "openai/gpt-4o" }] });
    const models = await fetchOmniRouteModels("", "http://localhost:20128/v1");
    __jait_capture(0, (models.filter((m) => m.id === "auto")));
    // The narrower strategies come straight from the catalogue.
    __jait_capture(1, (models.map((m) => m.id)));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_233_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({ data: Array.from({ length: 400 }, (_, i) => ({ id: `vendor/model-${i}` })) });
    const models = await fetchOmniRouteModels("k", "http://localhost:20128/v1");
    __jait_capture(0, (models)); // "auto" + 150 catalogue entries
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_239_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    vi.resetModules();
    vi.stubEnv("OMNIROUTE_MAX_MODELS", "5");
    const { fetchOmniRouteModels: fetchCapped, resetModelFetcherCaches: resetCapped } = await vi.importFresh(new URL("../../../../packages/gateway/src/providers/model-fetchers.js",import.meta.url).href);
    resetCapped();
    mockFetchOnce({ data: Array.from({ length: 400 }, (_, i) => ({ id: `vendor/model-${i}` })) });
    const models = await fetchCapped("k", "http://localhost:20128/v1");
    __jait_capture(0, (models)); // "auto" + 5 catalogue entries
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_249_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    vi.resetModules();
    vi.stubEnv("OMNIROUTE_MAX_MODELS", "0");
    const { fetchOmniRouteModels: fetchAll, resetModelFetcherCaches: resetAll } = await vi.importFresh(new URL("../../../../packages/gateway/src/providers/model-fetchers.js",import.meta.url).href);
    resetAll();
    mockFetchOnce({ data: Array.from({ length: 400 }, (_, i) => ({ id: `vendor/model-${i}` })) });
    const models = await fetchAll("k", "http://localhost:20128/v1");
    __jait_capture(0, (models)); // "auto" + all 400 catalogue entries
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_259_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    // OmniRoute works keyless against its free-tier providers.
    const fetchMock = mockFetchOnce({ data: [] });
    await fetchOmniRouteModels("", "http://localhost:20128/v1/");
    __jait_capture(0, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_266_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await __jait_captureResolved(0, (fetchOmniRouteModels("k", "http://localhost:20128/v1")));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_273_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({}, { status: 503 });
    await __jait_captureResolved(0, (fetchOmniRouteModels("k", "http://localhost:20128/v1")));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_278_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock1 = mockFetchOnce({ data: [{ id: "vendor/a" }] });
    await fetchOmniRouteModels("k", "http://localhost:20128/v1");
    await fetchOmniRouteModels("k", "http://localhost:20128/v1");
    __jait_capture(0, (fetchMock1.mock.calls));

    const fetchMock2 = mockFetchOnce({ data: [{ id: "vendor/b" }] });
    const result = await fetchOmniRouteModels("k", "http://nas:20128/v1");
    __jait_capture(1, (fetchMock2.mock.calls));
    __jait_capture(2, (result.map((m) => m.id)));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_292_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({
      models: [
        { name: "llama3:8b", details: { family: "llama", parameter_size: "8B" } },
        { name: "qwen2", details: { family: "qwen" } },
        { name: "naked" },
      ],
    });

    const models = await fetchOllamaModels("http://localhost:11434");

    __jait_capture(0, (models.map((m) => m.id)));
    __jait_capture(1, (models[0].description));
    __jait_capture(2, (models[1].description));
    __jait_captureType(3, (models[2].description));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_309_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchOnce({}, { status: 500 });
    await __jait_captureResolved(0, (fetchOllamaModels("http://localhost:11434")));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_314_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock = mockFetchOnce({ models: [] });
    await fetchOllamaModels("http://localhost:11434//");
    __jait_capture(0, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_323_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock1 = mockFetchOnce({ models: [{ name: "a" }] });
    await fetchOllamaModels("http://a:11434");
    __jait_capture(0, (fetchMock1.mock.calls));

    const fetchMock2 = mockFetchOnce({ models: [{ name: "b" }] });
    const result = await fetchOllamaModels("http://b:11434");
    __jait_capture(1, (fetchMock2.mock.calls));
    __jait_capture(2, (result.map((m) => m.id)));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_334_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ plan: "pro", email: "a@b.c" });
      if (url === "https://ollama.com/api/tags") {
        return jsonResponse({
          models: [
            { name: "llama3:8b-cloud", capabilities: ["completion", "tools"] },
            { name: "gpt-oss:120b", capabilities: ["completion"] },
            { name: "kimi-k2:1t-cloud", capabilities: ["completion", "thinking"] },
          ],
        });
      }
      return jsonResponse({
        models: [{ name: "llama3:8b", details: { family: "llama", parameter_size: "8B" } }],
      });
    });

    const models = await fetchOllamaModels("http://localhost:11434", { includeCloud: true });
    const ids = models.map((m) => m.id);

    __jait_capture(0, (ids[0]));
    // The locally pulled cloud tag suppresses the bare hosted duplicate.
    __jait_capture(1, (ids));
    __jait_capture(2, (ids));
    __jait_captureType(3, (models[0].group));
    __jait_capture(4, (models[1]));
    __jait_capture(5, (models[2].description));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_363_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock = mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ error: "unauthorized" }, 401);
      if (url === "https://ollama.com/api/tags") throw new Error("must not be called");
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    const models = await fetchOllamaModels("http://localhost:11434", { includeCloud: true });

    __jait_capture(0, (models.map((m) => m.id)));
    __jait_capture(1, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_376_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    const fetchMock = mockFetchRoutes((url) => {
      if (url === "https://ollama.com/api/tags") throw new Error("must not be called");
      if (url.endsWith("/api/me")) throw new Error("must not be called");
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    await fetchOllamaModels("http://localhost:11434");

    __jait_capture(0, (fetchMock.mock.calls));
    __jait_capture(1, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_389_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    let cloudCalls = 0;
    const fetchMock = mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ plan: "pro" });
      if (url === "https://ollama.com/api/tags") {
        cloudCalls += 1;
        return jsonResponse({ models: [{ name: "gpt-oss:120b" }] });
      }
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    await fetchOllamaModels("http://localhost:11434", { includeCloud: true });
    await fetchOllamaModels("http://localhost:11434", { includeCloud: true });
    __jait_capture(0, (cloudCalls));

    const forced = await fetchOllamaModels("http://localhost:11434", { includeCloud: true, force: true });
    __jait_capture(1, (cloudCalls));
    __jait_capture(2, (forced.map((m) => m.id)));
    __jait_capture(3, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_model_fetchers_test_ts_410_3": {


const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const __jait_hook_1365 = () => {
  resetModelFetcherCaches();
};
const __jait_hook_1418 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
};
/*__jait_scope_open__*/{
await __jait_hook_1365();
try {
await (async()=>{

    mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ plan: "pro" });
      if (url === "https://ollama.com/api/tags") return jsonResponse({ error: "boom" }, 503);
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    const models = await fetchOllamaModels("http://localhost:11434", { includeCloud: true });

    __jait_capture(0, (models.map((m) => m.id)));
  
})();

} finally {
await __jait_hook_1418();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
