// Translated fixture from packages/gateway/src/routes/providers-ollama-usage.test.ts; expected literals are in tail_static.rs.







import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/providers-ollama-usage.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_providers_ollama_usage_test_ts_31_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/ollama-device-auth.ts",import.meta.url)), async (original) => ({ ...await original<typeof import("../services/ollama-device-auth.js")>(), fetchSignedInOllamaUsage: vi.fn() }));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { ProviderRegistry } = await import("../../../../packages/gateway/src/providers/registry.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { fetchSignedInOllamaUsage } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { OllamaUsageError } = await import("../../../../packages/gateway/src/services/provider-quota-fetchers.js");
const { registerProviderRoutes } = await import("../../../../packages/gateway/src/routes/providers.js");
const account = { email: "me@example.com", name: "Me", plan: "pro" };
const usage = { limits: { weekly: { usage: 0.09, models: [] } } };
async function setup(apiKey?: string) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const recordOllamaUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerUsageService: { recordOllamaUsage, listForUser: () => [] } as never,
    userService: { getSettings: () => ({ jaitBackend: "ollama", apiKeys: { OLLAMA_URL: "http://localhost:11434", ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}) } }) } as never,
  });
  const request = () => app.inject({ method: "GET", url: "/api/provider-usage/summary", headers: { authorization: `Bearer ${token}` } });
  return { app, recordOllamaUsage, request };
}
const __jait_hook_795 = () => { vi.mocked(fetchSignedInOllamaUsage).mockReset().mockResolvedValue(usage); };
const __jait_hook_892 = () => { vi.unstubAllGlobals(); };
/*__jait_scope_open__*/{
await __jait_hook_795();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ Email: account.email, Name: account.name, Plan: account.plan })));
    const { app, recordOllamaUsage, request } = await setup();
    try {
      __jait_capture(0, ((await request()).statusCode));
      __jait_capture(1, (fetchSignedInOllamaUsage.mock.calls), (["http://localhost:11434",account]));
      __jait_capture(2, (recordOllamaUsage.mock.calls), (["jait-backend:user-1:ollama",usage,"pro",account.email]));
    } finally { await app.close(); }
  
})();

} finally {
await __jait_hook_892();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_ollama_usage_test_ts_41_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/ollama-device-auth.ts",import.meta.url)), async (original) => ({ ...await original<typeof import("../services/ollama-device-auth.js")>(), fetchSignedInOllamaUsage: vi.fn() }));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { ProviderRegistry } = await import("../../../../packages/gateway/src/providers/registry.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { fetchSignedInOllamaUsage } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { OllamaUsageError } = await import("../../../../packages/gateway/src/services/provider-quota-fetchers.js");
const { registerProviderRoutes } = await import("../../../../packages/gateway/src/routes/providers.js");
const account = { email: "me@example.com", name: "Me", plan: "pro" };
const usage = { limits: { weekly: { usage: 0.09, models: [] } } };
async function setup(apiKey?: string) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const recordOllamaUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerUsageService: { recordOllamaUsage, listForUser: () => [] } as never,
    userService: { getSettings: () => ({ jaitBackend: "ollama", apiKeys: { OLLAMA_URL: "http://localhost:11434", ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}) } }) } as never,
  });
  const request = () => app.inject({ method: "GET", url: "/api/provider-usage/summary", headers: { authorization: `Bearer ${token}` } });
  return { app, recordOllamaUsage, request };
}
const __jait_hook_795 = () => { vi.mocked(fetchSignedInOllamaUsage).mockReset().mockResolvedValue(usage); };
const __jait_hook_892 = () => { vi.unstubAllGlobals(); };
/*__jait_scope_open__*/{
await __jait_hook_795();
try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json(usage));
    vi.stubGlobal("fetch", fetchMock);
    const { app, recordOllamaUsage, request } = await setup("cloud-key");
    try {
      __jait_capture(0, ((await request()).statusCode));
      __jait_capture(1, (fetchSignedInOllamaUsage.mock.calls));
      __jait_capture(2, (fetchMock.mock.calls[1][0]));
      __jait_capture(3, (fetchMock.mock.calls[1][1].headers.Authorization));
      __jait_capture(4, (recordOllamaUsage.mock.calls));
    } finally { await app.close(); }
  
})();

} finally {
await __jait_hook_892();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_ollama_usage_test_ts_54_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/ollama-device-auth.ts",import.meta.url)), async (original) => ({ ...await original<typeof import("../services/ollama-device-auth.js")>(), fetchSignedInOllamaUsage: vi.fn() }));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { ProviderRegistry } = await import("../../../../packages/gateway/src/providers/registry.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { fetchSignedInOllamaUsage } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { OllamaUsageError } = await import("../../../../packages/gateway/src/services/provider-quota-fetchers.js");
const { registerProviderRoutes } = await import("../../../../packages/gateway/src/routes/providers.js");
const account = { email: "me@example.com", name: "Me", plan: "pro" };
const usage = { limits: { weekly: { usage: 0.09, models: [] } } };
async function setup(apiKey?: string) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const recordOllamaUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerUsageService: { recordOllamaUsage, listForUser: () => [] } as never,
    userService: { getSettings: () => ({ jaitBackend: "ollama", apiKeys: { OLLAMA_URL: "http://localhost:11434", ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}) } }) } as never,
  });
  const request = () => app.inject({ method: "GET", url: "/api/provider-usage/summary", headers: { authorization: `Bearer ${token}` } });
  return { app, recordOllamaUsage, request };
}
const __jait_hook_795 = () => { vi.mocked(fetchSignedInOllamaUsage).mockReset().mockResolvedValue(usage); };
const __jait_hook_892 = () => { vi.unstubAllGlobals(); };
/*__jait_scope_open__*/{
await __jait_hook_795();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(account)));
    vi.mocked(fetchSignedInOllamaUsage).mockRejectedValue(new OllamaUsageError("Ollama device authentication request failed (401)", 401));
    const { app, recordOllamaUsage, request } = await setup();
    try {
      const response = await request();
      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (response.body));
      __jait_capture(2, (response.body));
      __jait_capture(3, (recordOllamaUsage.mock.calls));
    } finally { await app.close(); }
  
})();

} finally {
await __jait_hook_892();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_ollama_usage_test_ts_81_4": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/ollama-device-auth.ts",import.meta.url)), async (original) => ({ ...await original<typeof import("../services/ollama-device-auth.js")>(), fetchSignedInOllamaUsage: vi.fn() }));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { ProviderRegistry } = await import("../../../../packages/gateway/src/providers/registry.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { fetchSignedInOllamaUsage } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { OllamaUsageError } = await import("../../../../packages/gateway/src/services/provider-quota-fetchers.js");
const { registerProviderRoutes } = await import("../../../../packages/gateway/src/routes/providers.js");
const account = { email: "me@example.com", name: "Me", plan: "pro" };
const usage = { limits: { weekly: { usage: 0.09, models: [] } } };
async function setup(apiKey?: string) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const recordOllamaUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerUsageService: { recordOllamaUsage, listForUser: () => [] } as never,
    userService: { getSettings: () => ({ jaitBackend: "ollama", apiKeys: { OLLAMA_URL: "http://localhost:11434", ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}) } }) } as never,
  });
  const request = () => app.inject({ method: "GET", url: "/api/provider-usage/summary", headers: { authorization: `Bearer ${token}` } });
  return { app, recordOllamaUsage, request };
}
const __jait_hook_795 = () => { vi.mocked(fetchSignedInOllamaUsage).mockReset().mockResolvedValue(usage); };
const __jait_hook_892 = () => { vi.unstubAllGlobals(); };
/*__jait_scope_open__*/{
async function keySetup() {
     const config = loadConfig();
     const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
     const updateSettings = vi.fn();
     const app = Fastify({ logger: false });
     registerProviderRoutes(app, config, {
       providerRegistry: new ProviderRegistry(),
       userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", OLLAMA_API_KEY: "old" } }), updateSettings } as never,
     });
     const request = (apiKey: unknown, authenticated = true) => app.inject({ method: "POST", url: "/api/provider-usage/ollama/api-key", headers: authenticated ? { authorization: `Bearer ${token}` } : {}, payload: { apiKey } });
     return { app, request, updateSettings };
   }
await __jait_hook_795();
try {
await (async()=>{

     vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(usage)));
     const { app, request, updateSettings } = await keySetup();
     try {
       const response = await request("  new-key  ");
       __jait_capture(0, (response.statusCode));
       __jait_capture(1, (updateSettings.mock.calls));
       __jait_capture(2, (response.body));
     } finally { await app.close(); }
   
})();

} finally {
await __jait_hook_892();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_ollama_usage_test_ts_91_4": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/ollama-device-auth.ts",import.meta.url)), async (original) => ({ ...await original<typeof import("../services/ollama-device-auth.js")>(), fetchSignedInOllamaUsage: vi.fn() }));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { ProviderRegistry } = await import("../../../../packages/gateway/src/providers/registry.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { fetchSignedInOllamaUsage } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { OllamaUsageError } = await import("../../../../packages/gateway/src/services/provider-quota-fetchers.js");
const { registerProviderRoutes } = await import("../../../../packages/gateway/src/routes/providers.js");
const account = { email: "me@example.com", name: "Me", plan: "pro" };
const usage = { limits: { weekly: { usage: 0.09, models: [] } } };
async function setup(apiKey?: string) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const recordOllamaUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerUsageService: { recordOllamaUsage, listForUser: () => [] } as never,
    userService: { getSettings: () => ({ jaitBackend: "ollama", apiKeys: { OLLAMA_URL: "http://localhost:11434", ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}) } }) } as never,
  });
  const request = () => app.inject({ method: "GET", url: "/api/provider-usage/summary", headers: { authorization: `Bearer ${token}` } });
  return { app, recordOllamaUsage, request };
}
const __jait_hook_795 = () => { vi.mocked(fetchSignedInOllamaUsage).mockReset().mockResolvedValue(usage); };
const __jait_hook_892 = () => { vi.unstubAllGlobals(); };
/*__jait_scope_open__*/{
async function keySetup() {
     const config = loadConfig();
     const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
     const updateSettings = vi.fn();
     const app = Fastify({ logger: false });
     registerProviderRoutes(app, config, {
       providerRegistry: new ProviderRegistry(),
       userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", OLLAMA_API_KEY: "old" } }), updateSettings } as never,
     });
     const request = (apiKey: unknown, authenticated = true) => app.inject({ method: "POST", url: "/api/provider-usage/ollama/api-key", headers: authenticated ? { authorization: `Bearer ${token}` } : {}, payload: { apiKey } });
     return { app, request, updateSettings };
   }
await __jait_hook_795();
try {
await (async()=>{

     vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret-provider-detail", { status: 401 })));
     const { app, request, updateSettings } = await keySetup();
     try {
       const response = await request("bad-key");
       __jait_capture(0, (response.statusCode));
       __jait_capture(1, (response.body));
       __jait_capture(2, (updateSettings.mock.calls));
     } finally { await app.close(); }
   
})();

} finally {
await __jait_hook_892();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_ollama_usage_test_ts_101_4": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/ollama-device-auth.ts",import.meta.url)), async (original) => ({ ...await original<typeof import("../services/ollama-device-auth.js")>(), fetchSignedInOllamaUsage: vi.fn() }));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { ProviderRegistry } = await import("../../../../packages/gateway/src/providers/registry.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { fetchSignedInOllamaUsage } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { OllamaUsageError } = await import("../../../../packages/gateway/src/services/provider-quota-fetchers.js");
const { registerProviderRoutes } = await import("../../../../packages/gateway/src/routes/providers.js");
const account = { email: "me@example.com", name: "Me", plan: "pro" };
const usage = { limits: { weekly: { usage: 0.09, models: [] } } };
async function setup(apiKey?: string) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const recordOllamaUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerUsageService: { recordOllamaUsage, listForUser: () => [] } as never,
    userService: { getSettings: () => ({ jaitBackend: "ollama", apiKeys: { OLLAMA_URL: "http://localhost:11434", ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}) } }) } as never,
  });
  const request = () => app.inject({ method: "GET", url: "/api/provider-usage/summary", headers: { authorization: `Bearer ${token}` } });
  return { app, recordOllamaUsage, request };
}
const __jait_hook_795 = () => { vi.mocked(fetchSignedInOllamaUsage).mockReset().mockResolvedValue(usage); };
const __jait_hook_892 = () => { vi.unstubAllGlobals(); };
/*__jait_scope_open__*/{
async function keySetup() {
     const config = loadConfig();
     const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
     const updateSettings = vi.fn();
     const app = Fastify({ logger: false });
     registerProviderRoutes(app, config, {
       providerRegistry: new ProviderRegistry(),
       userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", OLLAMA_API_KEY: "old" } }), updateSettings } as never,
     });
     const request = (apiKey: unknown, authenticated = true) => app.inject({ method: "POST", url: "/api/provider-usage/ollama/api-key", headers: authenticated ? { authorization: `Bearer ${token}` } : {}, payload: { apiKey } });
     return { app, request, updateSettings };
   }
await __jait_hook_795();
try {
await (async()=>{

     const fetchMock = vi.fn();
     vi.stubGlobal("fetch", fetchMock);
     const { app, request, updateSettings } = await keySetup();
     try {
       for (const key of [null, 42, "", "  ", "x".repeat(4097)]) __jait_capture(0, ((await request(key)).statusCode));
       __jait_capture(1, ((await request("valid", false)).statusCode));
       __jait_capture(2, (fetchMock.mock.calls));
       __jait_capture(3, (updateSettings.mock.calls));
     } finally { await app.close(); }
   
})();

} finally {
await __jait_hook_892();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
