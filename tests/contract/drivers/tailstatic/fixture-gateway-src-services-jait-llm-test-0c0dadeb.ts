// Translated fixture from packages/gateway/src/services/jait-llm.test.ts; expected literals are in tail_static.rs.

import {
  JaitConfigError,
  callJaitLlmCompletion,
  normalizeOpenRouterModelId,
  resolveJaitLlmConfig,
} from "../../../../packages/gateway/src/services/jait-llm.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/jait-llm.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_49_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const llm = resolveJaitLlmConfig({
      config,
      apiKeys: { OPENROUTER_API_KEY: "or-key" },
      requestedModel: "gpt-4o",
      jaitBackend: "openrouter",
    });

    __jait_capture(0, (llm.openaiApiKey));
    __jait_capture(1, (llm.openaiBaseUrl));
    __jait_capture(2, (llm.openaiModel));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_62_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const llm = resolveJaitLlmConfig({
      config,
      apiKeys: { OPENROUTER_API_KEY: "or-key" },
      requestedModel: "anthropic/claude-sonnet-4-20250514",
      jaitBackend: "openrouter",
    });

    __jait_capture(0, (llm.openaiModel));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_73_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeOpenRouterModelId("mimo v2 pro")));
    __jait_capture(1, (normalizeOpenRouterModelId("MiMo V3 Pro")));
    __jait_capture(2, (normalizeOpenRouterModelId("hunter-alpha")));
    __jait_capture(3, (normalizeOpenRouterModelId("xiaomi/mimo-v2-flash")));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_80_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression: a swarm specialist inheriting the parent session's ACP
    // model name ("opus") while routed through the user's Ollama backend
    // used to reach Ollama's /v1/chat/completions with model="opus", which
    // 404s ("model 'opus' not found") deep inside the LLM call — the
    // specialist (and often the whole swarm turn) then silently produced
    // nothing. This must fail fast and clearly instead.
    __jait_thrown(0, () =>
      resolveJaitLlmConfig({
        config,
        requestedModel: "opus",
        jaitBackend: "ollama",
      }), (JaitConfigError));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_96_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression guard: OmniRoute model ids almost always contain a slash
    // ("openai/gpt-4o", "auto/coding"). The OpenRouter branch keys off
    // `requestedModel.includes("/")`, so without an explicit omniroute
    // early-return every OmniRoute request would silently be sent to
    // openrouter.ai — with the user's OpenRouter key, or none at all.
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys: { OPENROUTER_API_KEY: "or-key" },
      requestedModel: "openai/gpt-4o",
      jaitBackend: "omniroute",
    });

    __jait_capture(0, (llm.backend));
    __jait_capture(1, (llm.openaiBaseUrl));
    __jait_capture(2, (llm.openaiModel));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_114_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const llm = resolveJaitLlmConfig({
      config,
      requestedModel: "gpt-4o",
      jaitBackend: "omniroute",
    });

    __jait_capture(0, (llm.openaiModel));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_124_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const llm = resolveJaitLlmConfig({ config, jaitBackend: "omniroute" });

    __jait_capture(0, (llm.openaiModel));
    // Placeholder key: OmniRoute serves keyless free-tier providers, but an
    // empty bearer breaks some upstreams.
    __jait_capture(1, (llm.openaiApiKey));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_133_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const llm = resolveJaitLlmConfig({
      config: { ...config, omnirouteBaseUrl: "http://gateway:20128/v1", omnirouteApiKey: "cfg-key" },
      apiKeys: { OMNIROUTE_BASE_URL: "http://nas:20128/v1/", OMNIROUTE_API_KEY: "user-key" },
      requestedModel: "auto/coding",
      jaitBackend: "omniroute",
    });

    __jait_capture(0, (llm.openaiBaseUrl));
    __jait_capture(1, (llm.openaiApiKey));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_145_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const alias of ["default", "fable", "sonnet", "opus", "haiku", "opusplan"]) {
      __jait_thrown(0, () =>
        resolveJaitLlmConfig({ config, requestedModel: alias, jaitBackend: "openai" }), (JaitConfigError));
    }
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_153_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const apiKeys = {
      JAIT_BACKEND_INSTANCES: serializeJaitBackendInstances([
        {
          id: "desktop",
          type: "ollama",
          name: "Desktop",
          baseUrl: "http://desktop:11434",
          numCtx: 65536,
        },
        {
          id: "server",
          type: "ollama",
          name: "Server",
          baseUrl: "http://server:11434",
          numCtx: 131072,
        },
      ]),
    };
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys,
      requestedModel: encodeJaitModelId("ollama", "server", "qwen3:32b"),
      jaitBackend: "openai",
    });

    __jait_capture(0, (llm.backend));
    __jait_capture(1, (llm.openaiBaseUrl));
    __jait_capture(2, (llm.openaiModel));
    __jait_capture(3, (llm.numCtx));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_185_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const apiKeys = {
      JAIT_BACKEND_INSTANCES: serializeJaitBackendInstances([
        {
          id: "glm",
          type: "openai",
          name: "GLM",
          baseUrl: "https://api.example.com/v1/",
          apiKey: "instance-key",
        },
      ]),
    };
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys,
      requestedModel: encodeJaitModelId("openai", "glm", "glm-5"),
      jaitBackend: "ollama",
    });

    __jait_capture(0, (llm.backend));
    __jait_capture(1, (llm.openaiBaseUrl));
    __jait_capture(2, (llm.openaiApiKey));
    __jait_capture(3, (llm.openaiModel));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_210_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_thrown(0, () => resolveJaitLlmConfig({
      config,
      apiKeys: { JAIT_BACKEND_INSTANCES: "[]" },
      requestedModel: encodeJaitModelId("ollama", "gone", "qwen3"),
      jaitBackend: "ollama",
    }));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_219_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression: a turn with no model used to fall through the ladder to
    // apiKeys.OLLAMA_MODEL — so a session ran (and was billed) on
    // deepseek-v4-pro while the user's selector said deepseek-v4.1-flash.
    // Strict callers must fail instead of silently choosing a model.
    __jait_thrown(0, () => resolveJaitLlmConfig({
      config,
      apiKeys: { OLLAMA_MODEL: "expensive-model" },
      jaitBackend: "ollama",
      strictModel: true,
    }), (JaitConfigError));

    // Same call without the strict flag keeps the documented fallback ladder,
    // which background utilities still rely on.
    __jait_capture(1, (resolveJaitLlmConfig({
      config,
      apiKeys: { OLLAMA_MODEL: "expensive-model" },
      jaitBackend: "ollama",
    }).openaiModel));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_240_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const llm = resolveJaitLlmConfig({
      config,
      apiKeys: { OLLAMA_MODEL: "expensive-model" },
      requestedModel: "deepseek-v4.1-flash:cloud",
      jaitBackend: "ollama",
      strictModel: true,
    });

    __jait_capture(0, (llm.openaiModel));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_254_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [{ finish_reason: "stop", message: { content: "  hello world  " } }],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await __jait_captureResolved(0, (callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 512 })));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_267_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [
          {
            finish_reason: "stop",
            message: { content: [{ type: "text", text: "part one " }, { type: "text", text: "part two" }] },
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await __jait_captureResolved(0, (callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 512 })));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_285_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression: reasoning models (GLM thinking, DeepSeek-R1, Qwen thinking)
    // put their thought in `message.reasoning` / `reasoning_content` and leave
    // `content` empty with finish_reason "length" when the budget runs out
    // mid-thought. This used to surface as "" and made e.g. chat title
    // generation silently fall back to the user's first message.
    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning: "the user wants me to name this chat..." },
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await __jait_rejected(0, callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 24 }));
    __jait_capture(1, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_309_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning_content: "thinking..." },
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await __jait_rejected(0, callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 24 }));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_327_3": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({ choices: [{ finish_reason: "error", message: { content: "" } }] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await __jait_rejected(0, callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 24 }));
  
})();

} finally {
await __jait_hook_316();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_jait_llm_test_ts_339_1": {

const { encodeJaitModelId, serializeJaitBackendInstances } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const originalFetch = globalThis.fetch;
function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}
function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};
const __jait_hook_316 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};

try {
await (async()=>{

  __jait_thrown(0, () => resolveJaitLlmConfig({config, jaitBackend:"opencode-go"}));
  const resolved = resolveJaitLlmConfig({config, jaitBackend:"opencode-go",apiKeys:{OPENCODE_GO_API_KEY:"key"}});
  __jait_capture(1, (resolved.openaiModel));
  __jait_capture(2, (resolved.openaiBaseUrl));

})();

} finally {
await __jait_hook_316();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
