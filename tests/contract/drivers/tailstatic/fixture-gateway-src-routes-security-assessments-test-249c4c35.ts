// Translated fixture from packages/gateway/src/routes/security-assessments.test.ts; expected literals are in tail_static.rs.

import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { registerSecurityAssessmentRoutes } from "../../../../packages/gateway/src/routes/security-assessments.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { getAssessmentService } from "../../../../packages/gateway/src/security/assessment.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/security-assessments.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_security_assessments_test_ts_21_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const apps: ReturnType<typeof Fastify>[] = [];
async function setup(sqlite?: SqliteDatabase) {
  const app = Fastify(); apps.push(app);
  const config = { ...loadConfig(), jwtSecret: "assessment-route-test-secret" };
  registerSecurityAssessmentRoutes(app, config, sqlite);
  const token = await signAuthToken({ id: "route-owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "route-other", username: "other" }, config.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token }, otherHeaders: { authorization: "Bearer " + other } };
}
const __jait_hook_446 = async () => { await Promise.all(apps.splice(0).map(app => app.close())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app } = await setup();
    __jait_capture(0, ((await app.inject({ url: "/api/security/assessments" })).statusCode));
    __jait_capture(1, ((await app.inject({ method: "POST", url: "/api/security/scopes", payload: {} })).statusCode));
  
})();

} finally {
await __jait_hook_446();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_security_assessments_test_ts_26_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const apps: ReturnType<typeof Fastify>[] = [];
async function setup(sqlite?: SqliteDatabase) {
  const app = Fastify(); apps.push(app);
  const config = { ...loadConfig(), jwtSecret: "assessment-route-test-secret" };
  registerSecurityAssessmentRoutes(app, config, sqlite);
  const token = await signAuthToken({ id: "route-owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "route-other", username: "other" }, config.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token }, otherHeaders: { authorization: "Bearer " + other } };
}
const __jait_hook_446 = async () => { await Promise.all(apps.splice(0).map(app => app.close())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, headers } = await setup();
    for (const payload of [{}, { authorized: true, targets: ["router.local"] }])
      __jait_capture(0, ((await app.inject({ method: "POST", url: "/api/security/scopes", headers, payload })).statusCode));
  
})();

} finally {
await __jait_hook_446();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_security_assessments_test_ts_31_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const apps: ReturnType<typeof Fastify>[] = [];
async function setup(sqlite?: SqliteDatabase) {
  const app = Fastify(); apps.push(app);
  const config = { ...loadConfig(), jwtSecret: "assessment-route-test-secret" };
  registerSecurityAssessmentRoutes(app, config, sqlite);
  const token = await signAuthToken({ id: "route-owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "route-other", username: "other" }, config.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token }, otherHeaders: { authorization: "Bearer " + other } };
}
const __jait_hook_446 = async () => { await Promise.all(apps.splice(0).map(app => app.close())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, headers, otherHeaders } = await setup();
    const response = await app.inject({ method: "POST", url: "/api/security/scopes", headers, payload: {
      targets: ["127.0.0.1"], exclusions: [], ports: [1], expiresAt: new Date(Date.now() + 60_000).toISOString(),
      authorized: true, operatorId: "forged", nodeId: "remote-node",
    } });
    __jait_capture(0, (response.statusCode));
    const scope = response.json();
    __jait_capture(1, (scope.operatorId));
    __jait_capture(2, (scope.nodeId));
    const denied = await app.inject({ method: "POST", url: "/api/security/assessments", headers: otherHeaders, payload: { scopeId: scope.id } });
    __jait_capture(3, (denied.statusCode));
    const started = await app.inject({ method: "POST", url: "/api/security/assessments", headers, payload: { scopeId: scope.id } });
    __jait_capture(4, (started.statusCode));
    const run = started.json();
    __jait_capture(5, ((await app.inject({ url: "/api/security/assessments/" + run.id, headers: otherHeaders })).statusCode));
    __jait_capture(6, ((await app.inject({ method: "POST", url: "/api/security/assessments/" + run.id + "/cancel", headers: otherHeaders, payload: {} })).statusCode));
    await getAssessmentService().wait(run.id, "route-owner");
    const final = await app.inject({ url: "/api/security/assessments/" + run.id, headers });
    __jait_capture(7, (final.statusCode));
    __jait_capture(8, (final.json().status));
    const otherHistory = await app.inject({ url: "/api/security/assessments", headers: otherHeaders });
    __jait_capture(9, (otherHistory.json()));
  
})();

} finally {
await __jait_hook_446();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_security_assessments_test_ts_57_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const apps: ReturnType<typeof Fastify>[] = [];
async function setup(sqlite?: SqliteDatabase) {
  const app = Fastify(); apps.push(app);
  const config = { ...loadConfig(), jwtSecret: "assessment-route-test-secret" };
  registerSecurityAssessmentRoutes(app, config, sqlite);
  const token = await signAuthToken({ id: "route-owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "route-other", username: "other" }, config.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token }, otherHeaders: { authorization: "Bearer " + other } };
}
const __jait_hook_446 = async () => { await Promise.all(apps.splice(0).map(app => app.close())); };

try {
await (async()=>{

 let session:{project_path:string;metadata?:string;node_id?:string}|undefined={project_path:process.cwd()};
 const get=vi.fn((id,owner)=>id==="owned"&&owner==="route-owner"?session:undefined);
 const sqlite={prepare:vi.fn(()=>({get}))} as unknown as SqliteDatabase;
 const {app,headers}=await setup(sqlite);
 const payload={sessionId:"owned",projectRoot:"/forged",targets:["127.0.0.1"],exclusions:[],ports:[1],methods:["trivy"],paths:["package.json"],authorized:true,expiresAt:new Date(Date.now()+60_000).toISOString()};
 const local=await app.inject({method:"POST",url:"/api/security/scopes",headers,payload});
 __jait_capture(0, (local.statusCode));__jait_capture(1, (local.json().projectRoot), (process.cwd()));
 __jait_capture(2, (get.mock.calls));
 session={project_path:process.cwd(),node_id:"remote-fixture"};
 __jait_capture(3, ((await app.inject({method:"POST",url:"/api/security/scopes",headers,payload})).statusCode));
 session={project_path:process.cwd(),metadata:JSON.stringify({executionNodeId:"remote-fixture"})};
 __jait_capture(4, ((await app.inject({method:"POST",url:"/api/security/scopes",headers,payload})).statusCode));
 __jait_capture(5, ((await app.inject({method:"POST",url:"/api/security/scopes",headers,payload:{...payload,sessionId:"other"}})).statusCode));

})();

} finally {
await __jait_hook_446();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
