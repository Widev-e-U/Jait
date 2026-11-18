// Translated fixture from packages/gateway/src/security/http-auth.test.ts; expected literals are in tail_static.rs.

import {
  AUTH_COOKIE_NAME,
  extractBearerToken,
  isPublicApiPath,
  signAuthToken,
  verifyAuthToken,
} from "../../../../packages/gateway/src/security/http-auth.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/http-auth.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_12_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    // GitHub redirects the browser to the callback during manifest setup and
    // posts App webhooks to the webhook route; neither carries a Jait session.
    __jait_capture(0, (isPublicApiPath("/api/github/apps/callback")));
    __jait_capture(1, (isPublicApiPath("/api/github/apps/webhook")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_19_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isPublicApiPath("/api/github-apps")));
    __jait_capture(1, (isPublicApiPath("/api/agents/abc/github-app")));
    __jait_capture(2, (isPublicApiPath("/api/agents/abc/github-app/setup")));
    __jait_capture(3, (isPublicApiPath("/api/agents/abc/github-app/manual")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_26_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isPublicApiPath("/api/github/apps/callback/extra")));
    __jait_capture(1, (isPublicApiPath("/api/github/apps/webhook/extra")));
    __jait_capture(2, (isPublicApiPath("/preview/api/github/apps/callback")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_32_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const path of [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/refresh",
      "/api/mobile/discovery",
      "/api/email/oauth/callback",
      "/api/calendar/oauth/callback",
    ]) {
      __jait_capture(0, (isPublicApiPath(path)));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_47_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const token = await signAuthToken({ id: "user-1", username: "jakob" }, "secret");
    __jait_capture(0, (await verifyAuthToken(token, "secret")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_52_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const token = await signAuthToken({ id: "user-1", username: "jakob" }, "secret");
    __jait_captureType(0, (await verifyAuthToken(token, "other-secret")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_57_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Signed with the same secret, but carrying a non-session purpose: the
    // purpose check (not the signature) must reject it.
    const token = await new jose.SignJWT({ username: "jakob", purpose: "preview" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode("secret"));
    __jait_captureType(0, (await verifyAuthToken(token, "secret")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_71_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (extractBearerToken("Bearer abc")));
    __jait_capture(1, (extractBearerToken("bearer  abc ")));
    __jait_captureType(2, (extractBearerToken("Basic abc")));
    __jait_captureType(3, (extractBearerToken(undefined)));
    __jait_captureType(4, (extractBearerToken("Bearer   ")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_http_auth_test_ts_79_3": {

const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (AUTH_COOKIE_NAME));
  
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
