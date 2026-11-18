// Translated fixture from packages/gateway/src/routes/providers-node-scope.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js"
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js"
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js"
import { registerProviderRoutes } from "../../../../packages/gateway/src/routes/providers.js"
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/providers-node-scope.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_providers_node_scope_test_ts_118_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const USER = { id: 'user-1', username: 'scope-user' }
function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}
function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}
const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}
const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const proxyProviderOp = vi.fn(async (_nodeId: string, op: string) => (
      op === 'auth-status'
        ? { authenticated: true, login: true, logout: true, deviceCode: true }
        : []
    ))
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({ method: 'GET', url: '/api/providers', headers })
    __jait_capture(0, (response.statusCode))
    const { providers, remoteProviders } = response.json()

    __jait_capture(1, (providers.map((provider: { id: string; nodeId: string }) => [provider.id, provider.nodeId])))
    const windows = providers.find((provider: { id: string }) => provider.id === 'codex-windows')
    __jait_capture(2, (windows.nodeName))
    __jait_capture(3, (windows.installed))
    __jait_capture(4, (windows.available))

    // Grouped view stays available for the settings screen.
    __jait_capture(5, (remoteProviders))
    __jait_capture(6, (remoteProviders[0].providers))

    await app.close()
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_node_scope_test_ts_147_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const USER = { id: 'user-1', username: 'scope-user' }
function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}
function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}
const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}
const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const proxyProviderOp = vi.fn(async (_nodeId: string, op: string) => (
      op === 'auth-status'
        ? { authenticated: false, login: true, logout: false, deviceCode: true }
        : []
    ))
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({ method: 'GET', url: '/api/providers', headers })
    const windows = response.json().providers.find((provider: { id: string }) => provider.id === 'codex-windows')

    __jait_capture(0, (windows.installed))
    __jait_capture(1, (windows.available))
    __jait_capture(2, (windows.unavailableReason))
    __jait_capture(3, (windows.auth.authenticated))

    await app.close()
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_node_scope_test_ts_168_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const USER = { id: 'user-1', username: 'scope-user' }
function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}
function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}
const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}
const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const proxyProviderOp = vi.fn(async () => [{ id: 'windows-model', name: 'Windows model' }])
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/codex-windows/models?nodeId=gateway',
      headers,
    })

    __jait_capture(0, (response.statusCode))
    __jait_capture(1, (response.json().models))
    __jait_capture(2, (proxyProviderOp.mock.calls))

    await app.close()
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_node_scope_test_ts_190_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const USER = { id: 'user-1', username: 'scope-user' }
function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}
function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}
const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}
const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, headers, proxyProviderOp } = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/codex-gateway/models?nodeId=windows-node',
      headers,
    })

    __jait_capture(0, (response.statusCode))
    __jait_capture(1, (response.json().models))
    __jait_capture(2, (proxyProviderOp.mock.calls))

    await app.close()
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_node_scope_test_ts_206_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const USER = { id: 'user-1', username: 'scope-user' }
function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}
function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}
const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}
const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const proxyProviderOp = vi.fn(async (_nodeId: string, op: string) => {
      if (op === 'auth-status') {
        return { authenticated: true, login: true, logout: true, deviceCode: true }
      }
      throw new Error('Codex model discovery exited (code 1) - provider stderr: invalid config')
    })
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/codex-windows/models',
      headers,
    })

    __jait_capture(0, (response.statusCode))
    __jait_capture(1, (response.json()))

    await app.close()
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_node_scope_test_ts_231_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const USER = { id: 'user-1', username: 'scope-user' }
function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}
function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}
const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}
const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = {
      ok: true,
      message: 'Updated Codex to 0.157.0',
      currentVersion: '0.157.0',
      latestVersion: '0.157.0',
      updateAvailable: false,
      checkedAt: '2026-09-23T12:00:00.000Z',
    }
    const proxyProviderOp = vi.fn(async () => result)
    const { app, headers } = await buildApp(proxyProviderOp as never)

    const response = await app.inject({
      method: 'POST',
      url: '/api/providers/codex-windows/update',
      headers,
    })

    __jait_capture(0, (response.statusCode))
    __jait_capture(1, (response.json()), (result))
    __jait_capture(2, (proxyProviderOp.mock.calls))

    await app.close()
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_node_scope_test_ts_261_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const USER = { id: 'user-1', username: 'scope-user' }
function gatewayJaitProvider() {
  return {
    id: 'jait',
    info: {
      id: 'jait',
      name: 'Jait',
      description: 'Gateway provider',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    listModels: async () => [{ id: 'gateway-model', name: 'Gateway model' }],
  }
}
function gatewayCodexAccount() {
  return {
    id: 'codex-gateway',
    providerType: 'codex',
    ownerUserId: USER.id,
    info: {
      id: 'codex-gateway',
      providerType: 'codex',
      name: 'Codex — Gateway',
      description: 'Codex on the gateway',
      available: true,
      modes: ['full-access', 'supervised'],
    },
    checkAvailability: async () => true,
    getAuthStatus: async () => ({ login: true, logout: true, deviceCode: true, authenticated: true }),
    listModels: async () => [{ id: 'gateway-codex-model', name: 'Gateway Codex model' }],
  }
}
const WINDOWS_NODE = {
  id: 'windows-node',
  name: 'Windows workstation',
  platform: 'windows',
  clientId: 'client-1',
  isGateway: false,
  providers: ['codex'],
  registeredAt: new Date().toISOString(),
}
const WINDOWS_ACCOUNT = {
  id: 'codex-windows',
  userId: USER.id,
  providerType: 'codex',
  nodeId: WINDOWS_NODE.id,
  label: 'Windows',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const GATEWAY_ACCOUNT = {
  id: 'codex-gateway',
  userId: USER.id,
  providerType: 'codex',
  nodeId: 'gateway',
  label: 'Gateway',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
async function buildApp(proxyProviderOp = vi.fn(async () => [] as unknown)) {
  const config = { ...loadConfig(), jwtSecret: 'provider-node-scope-test', logLevel: 'silent' }
  const token = await signAuthToken(USER, config.jwtSecret)

  const registry = new ProviderRegistry()
  registry.register(gatewayJaitProvider() as never)
  registry.register(gatewayCodexAccount() as never)

  const accounts = [GATEWAY_ACCOUNT, WINDOWS_ACCOUNT]
  const types: { id: string; name: string }[] = []
  const providerAccountService = {
    list: () => accounts,
    get: (id: string) => accounts.find((account) => account.id === id) ?? null,
    listTypes: () => types,
    // The listing route resolves a display name through this. The stub is cast
    // to `never`, so a missing method is not a type error — it surfaces as a
    // 500 from the route instead. Derived from listTypes like the real service,
    // so filling one keeps the other honest.
    getType: (providerType: string) => types.find((type) => type.id === providerType) ?? null,
  }

  const ws = {
    getFsNodes: () => [WINDOWS_NODE],
    findNodeByDeviceId: (nodeId: string) => nodeId === WINDOWS_NODE.id ? WINDOWS_NODE : undefined,
    proxyProviderOp,
  }

  const app = Fastify({ logger: false })
  registerProviderRoutes(app, config, {
    providerRegistry: registry,
    providerAccountService: providerAccountService as never,
    ws: ws as never,
  })

  return { app, headers: { authorization: `Bearer ${token}` }, proxyProviderOp }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, headers, proxyProviderOp } = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/providers/unknown/update',
      headers,
    })

    __jait_capture(0, (response.statusCode))
    __jait_capture(1, (proxyProviderOp.mock.calls))

    await app.close()
  
})();

} finally {

}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
