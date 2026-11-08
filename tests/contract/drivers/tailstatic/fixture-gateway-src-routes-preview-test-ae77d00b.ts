// Translated fixture from packages/gateway/src/routes/preview.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { registerPreviewRoutes } from "../../../../packages/gateway/src/routes/preview.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/preview.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_preview_test_ts_13_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = { reload: vi.fn().mockResolvedValue({ browserId: "browser-1" }) };
    const sessionService = { getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null) };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });
    const payload = { sessionId: "session-1" };
    __jait_capture(0, ((await app.inject({ method: "POST", url: "/api/preview/reload", payload })).statusCode));
    __jait_capture(1, ((await app.inject({ method: "POST", url: "/api/preview/reload", headers: await authHeader(config.jwtSecret, "user-2"), payload })).statusCode));
    __jait_capture(2, (previewService.reload.mock.calls));
    const headers = await authHeader(config.jwtSecret, "user-1");
    __jait_capture(3, ((await app.inject({ method: "POST", url: "/api/preview/reload", headers, payload })).statusCode));
    __jait_capture(4, (previewService.reload.mock.calls));
    previewService.reload.mockRejectedValueOnce(new Error("Take control before refreshing."));
    const blocked = await app.inject({ method: "POST", url: "/api/preview/reload", headers, payload });
    __jait_capture(5, (blocked.statusCode));
    __jait_capture(6, (blocked.json().error));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_preview_test_ts_33_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = { history: vi.fn().mockResolvedValue({ sessionId: "session-1" }) };
    const sessionService = { getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null) };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });
    const payload = { sessionId: "session-1", direction: "back" };
    __jait_capture(0, ((await app.inject({ method: "POST", url: "/api/preview/history", payload })).statusCode));
    __jait_capture(1, ((await app.inject({ method: "POST", url: "/api/preview/history", headers: await authHeader(config.jwtSecret, "user-2"), payload })).statusCode));
    __jait_capture(2, (previewService.history.mock.calls));
    const headers = await authHeader(config.jwtSecret, "user-1");
    __jait_capture(3, ((await app.inject({ method: "POST", url: "/api/preview/history", headers, payload: { ...payload, direction: "invalid" } })).statusCode));
    __jait_capture(4, ((await app.inject({ method: "POST", url: "/api/preview/history", headers, payload })).statusCode));
    __jait_capture(5, (previewService.history.mock.calls));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_preview_test_ts_50_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = { navigate: vi.fn().mockResolvedValue({ sessionId: "session-1" }) };
    const sessionService = { getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null) };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });
    const payload = { sessionId: "session-1", url: "https://example.com/" };
    __jait_capture(0, ((await app.inject({ method: "POST", url: "/api/preview/navigate", payload })).statusCode));
    __jait_capture(1, ((await app.inject({ method: "POST", url: "/api/preview/navigate", headers: await authHeader(config.jwtSecret, "user-2"), payload })).statusCode));
    __jait_capture(2, (previewService.navigate.mock.calls));
    __jait_capture(3, ((await app.inject({ method: "POST", url: "/api/preview/navigate", headers: await authHeader(config.jwtSecret, "user-1"), payload })).statusCode));
    __jait_capture(4, (previewService.navigate.mock.calls), (["session-1",payload.url]));
    previewService.navigate.mockRejectedValueOnce(new Error("Take control before navigating."));
    __jait_capture(5, ((await app.inject({ method: "POST", url: "/api/preview/navigate", headers: await authHeader(config.jwtSecret, "user-1"), payload })).statusCode));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_preview_test_ts_67_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = {
      setSharedWithAgent: vi.fn().mockReturnValue({ sessionId: "session-1", sharedWithAgent: true }),
    };
    const sessionService = {
      getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null),
    };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });

    const body = { sessionId: "session-1", sharedWithAgent: true };
    const denied = await app.inject({ method: "POST", url: "/api/preview/share", headers: await authHeader(config.jwtSecret, "user-2"), payload: body });
    __jait_capture(0, (denied.statusCode));
    __jait_capture(1, (previewService.setSharedWithAgent.mock.calls));

    const allowed = await app.inject({ method: "POST", url: "/api/preview/share", headers: await authHeader(config.jwtSecret, "user-1"), payload: body });
    __jait_capture(2, (allowed.statusCode));
    __jait_capture(3, (previewService.setSharedWithAgent.mock.calls));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_preview_test_ts_89_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = {
      inspect: vi.fn().mockResolvedValue({
        status: "ready",
        url: "/api/dev-proxy/4173/",
        browserEvents: [],
        logs: [],
        screenshot: null,
        page: {
          title: "Preview App",
          url: "http://127.0.0.1:4173/",
          text: "Ready",
          elements: [],
          activeElement: null,
          dialogs: [],
          obstruction: null,
        },
        snapshot: "Title: Preview App",
        target: {
          selector: "#submit",
          found: true,
          obscured: true,
        },
      }),
    };
    registerPreviewRoutes(app, config, {
      previewService: previewService as any,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/preview/inspect/session-1?selector=%23submit",
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (previewService.inspect.mock.calls));
    __jait_capture(2, (response.json()));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_preview_test_ts_138_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = {
      inspect: vi.fn(),
    };
    const browserCollaborationService = {
      getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "bs_1", secretSafe: true }),
    };
    registerPreviewRoutes(app, config, {
      previewService: previewService as any,
      browserCollaborationService: browserCollaborationService as any,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/preview/inspect/session-1",
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (previewService.inspect.mock.calls));
    __jait_capture(2, (response.json()));

    await app.close();
  
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
