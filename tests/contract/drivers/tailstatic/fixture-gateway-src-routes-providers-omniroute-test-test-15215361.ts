// Translated fixture from packages/gateway/src/routes/providers-omniroute-test.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js"
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js"
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js"
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js"
import { UserService } from "../../../../packages/gateway/src/services/users.js"
import { registerProviderRoutes } from "../../../../packages/gateway/src/routes/providers.js"
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/providers-omniroute-test.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_42_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ id: 'auto/coding' }, { id: 'openai/gpt-4o' }, { id: 'x/y' }, { id: 'a/b' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/providers/omniroute/test', headers, payload: {} })

    __jait_capture(0, (res.statusCode))
    const body = res.json()
    __jait_capture(1, (body.ok))
    __jait_capture(2, (body.modelCount))
    __jait_capture(3, (body.sampleModels))
    __jait_capture(4, (body.authenticated))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_60_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The button exists so a user can check a URL *before* committing it.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { app, headers } = await buildApp({ OMNIROUTE_BASE_URL: 'http://saved:20128/v1' })
    await app.inject({
      method: 'POST',
      url: '/api/providers/omniroute/test',
      headers,
      payload: { base_url: 'http://draft:20128/v1' },
    })

    __jait_capture(0, (fetchMock.mock.calls[0]?.[0]))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_77_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/providers/omniroute/test',
      headers,
      payload: { api_key: 'wrong-key' },
    })

    const body = res.json()
    __jait_capture(0, (body.ok))
    __jait_capture(1, (body.error))
    __jait_capture(2, (body.error))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_95_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    globalThis.fetch = vi.fn(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:20128') }) as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/providers/omniroute/test', headers, payload: {} })

    const body = res.json()
    __jait_capture(0, (body.ok))
    __jait_capture(1, (body.error))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_107_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { app, headers } = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/providers/omniroute/test',
      headers,
      payload: { base_url: 'not a url' },
    })

    __jait_capture(0, (res.statusCode))
    __jait_capture(1, (fetchMock.mock.calls))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_124_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app } = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/providers/omniroute/test', payload: {} })
    __jait_capture(0, (res.statusCode))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_133_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const {app, headers} = await buildApp()
    const fetcher = vi.fn()
    globalThis.fetch = fetcher
    const response = await app.inject({method:'POST',url:'/api/providers/backend/test',headers,payload:{backend:'opencode-go'}})
    __jait_capture(0, (response.statusCode))
    __jait_capture(1, (fetcher.mock.calls))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_142_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const {app, headers} = await buildApp()
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({choices:[{message:{content:'OK'}}]})
      : Response.json({data:[{id:'glm-5.2'}]}))
    globalThis.fetch = fetcher
    const response = await app.inject({method:'POST',url:'/api/providers/backend/test',headers,payload:{backend:'opencode-go',api_key:'test-go-key'}})
    __jait_capture(0, (response.json()))
    __jait_capture(1, (fetcher.mock.calls))
    __jait_capture(2, (fetcher.mock.calls[1]![0]))
    const requestHeaders = new Headers(fetcher.mock.calls[1]![1]?.headers)
    __jait_captureType(3, (requestHeaders.get('x-opencode-session')))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_omniroute_test_test_ts_156_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const originalFetch = globalThis.fetch
async function buildApp(apiKeys: Record<string, string> = {}) {
  const { db, sqlite } = await openDatabase(':memory:')
  migrateDatabase(sqlite)
  const config = {
    ...loadConfig(),
    jwtSecret: 'omniroute-test',
    logLevel: 'silent',
    omnirouteBaseUrl: 'http://localhost:20128/v1',
    omnirouteApiKey: '',
  }
  const users = new UserService(db)
  const user = users.createUser('omni-user', 'password123')
  if (Object.keys(apiKeys).length > 0) users.updateSettings(user.id, { apiKeys })
  const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    userService: users,
  } as any)

  return { app, headers: { authorization: `Bearer ${token}` } }
}
const __jait_hook_461 = () => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const {app, headers} = await buildApp()
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({error:{message:'Invalid Go API key'}},{status:401})
      : Response.json({data:[{id:'glm-5.2'}]}))
    const response = await app.inject({method:'POST',url:'/api/providers/backend/test',headers,payload:{backend:'opencode-go',api_key:'rejected-key'}})
    __jait_capture(0, (response.json()))
    await app.close()
  
})();

} finally {
await __jait_hook_461();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
