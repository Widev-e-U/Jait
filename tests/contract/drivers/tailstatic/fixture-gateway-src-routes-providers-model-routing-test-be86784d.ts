// Translated fixture from packages/gateway/src/routes/providers-model-routing.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js"
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js"
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js"
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js"
import { ProviderAccountService } from "../../../../packages/gateway/src/services/provider-accounts.js"
import { UserService } from "../../../../packages/gateway/src/services/users.js"
import { registerProviderRoutes } from "../../../../packages/gateway/src/routes/providers.js"
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/providers-model-routing.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_providers_model_routing_test_ts_12_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), jwtSecret: 'provider-model-reset-test', logLevel: 'silent' }
    const users = new UserService(db)
    const user = users.createUser('refresh-user', 'password123')
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)
    const registry = new ProviderRegistry()
    const resetModels = vi.fn()
    registry.register({
      id: 'codex-account',
      ownerUserId: user.id,
      info: { id: 'codex-account', name: 'Codex', description: 'Codex ACP', available: true, modes: ['full-access'] },
      checkAvailability: async () => true,
      listModels: async () => [],
      resetModels,
    } as any)
    const app = Fastify({ logger: false })
    registerProviderRoutes(app, config, { providerRegistry: registry, userService: users })
    const response = await app.inject({
      method: 'POST',
      url: '/api/providers/models/reset',
      headers: { authorization: `Bearer ${token}` },
    })
    __jait_capture(0, (response.statusCode))
    __jait_capture(1, (resetModels.mock.calls))
    await app.close()
    sqlite.close()
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_providers_model_routing_test_ts_42_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), jwtSecret: 'provider-model-node-test', logLevel: 'silent' }
    const users = new UserService(db)
    const user = users.createUser('model-user', 'password123')
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)
    const headers = { authorization: `Bearer ${token}` }

    const registry = new ProviderRegistry()
    registry.register({
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
    } as any)

    const node = {
      id: 'windows-node',
      name: 'Windows workstation',
      platform: 'windows',
      clientId: 'client-1',
      isGateway: false,
      providers: ['codex'],
      registeredAt: new Date().toISOString(),
    }
    const providerAccounts = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex CLI",
      command: "codex-acp",
      auth: "acp",
    }], "/tmp/jait-provider-model-routing-test")
    const account = providerAccounts.create(user.id, "codex", "Windows", node.id)

    const proxyProviderOp = vi.fn(async () => [
      { id: 'windows-codex-model', name: 'Windows Codex model' },
    ])
    const ws = {
      getFsNodes: () => [node],
      findNodeByDeviceId: (nodeId: string) => nodeId === node.id ? node : undefined,
      proxyProviderOp,
    }

    const app = Fastify({ logger: false })
    registerProviderRoutes(app, config, {
      providerRegistry: registry,
      userService: users,
      providerAccountService: providerAccounts,
      ws: ws as any,
    })

    const remoteResponse = await app.inject({
      method: 'GET',
      url: `/api/providers/${account.id}/models?nodeId=windows-node`,
      headers,
    })
    __jait_capture(0, (remoteResponse.statusCode))
    __jait_capture(1, (remoteResponse.json().models))
    __jait_capture(2, (proxyProviderOp.mock.calls), (['windows-node','list-models',{ providerId: account.id, providerType: 'codex' },90_000]))

    const jaitResponse = await app.inject({
      method: 'GET',
      url: '/api/providers/jait/models?nodeId=windows-node',
      headers,
    })
    __jait_capture(3, (jaitResponse.statusCode))
    __jait_capture(4, (jaitResponse.json().models))
    __jait_capture(5, (proxyProviderOp.mock.calls))

    await app.close()
    sqlite.close()
  
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
