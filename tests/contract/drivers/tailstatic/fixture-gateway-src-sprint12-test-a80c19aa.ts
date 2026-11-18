// Translated fixture from packages/gateway/src/sprint12.test.ts; expected literals are in tail_static.rs.
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import { DeviceRegistry } from "../../../../packages/gateway/src/services/device-registry.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint12.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint12_test_ts_19_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const consentManager = new ConsentManager();
    const deviceRegistry = new DeviceRegistry();
    const app = await createServer(testConfig, { consentManager, deviceRegistry });

    const headers = { authorization: "Bearer " + await signAuthToken({ id: "mobile-owner", username: "owner" }, testConfig.jwtSecret) };
    const discovery = await app.inject({ headers, method: "GET", url: "/api/mobile/discovery" });
    __jait_capture(0, (discovery.statusCode));
    const discoveryBody = discovery.json() as { name: string; wsUrl: string };
    __jait_capture(1, (discoveryBody.name));
    __jait_capture(2, (discoveryBody.wsUrl));

    const register = await app.inject({ headers,
      method: "POST",
      url: "/api/mobile/devices/register",
      payload: {
        id: "device-mobile-1",
        name: "Pixel Test",
        platform: "mobile",
        capabilities: ["voice", "screen-view", "consent"],
      },
    });
    __jait_capture(3, (register.statusCode));

    const devices = await app.inject({ headers, method: "GET", url: "/api/mobile/devices" });
    __jait_capture(4, (devices.statusCode));
    const devicesBody = devices.json() as { devices: Array<{ id: string; lastSeen: string }> };
    __jait_capture(5, (devicesBody.devices));
    const lastSeenBefore = devicesBody.devices[0]!.lastSeen;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const heartbeat = await app.inject({ headers,
      method: "POST",
      url: "/api/mobile/devices/device-mobile-1/heartbeat",
    });
    __jait_capture(6, (heartbeat.statusCode));
    const heartbeatBody = heartbeat.json() as { device: { lastSeen: string } };
    __jait_capture(7, (heartbeatBody.device.lastSeen > lastSeenBefore));

    const health = await app.inject({ headers, method: "GET", url: "/health" });
    const healthBody = health.json() as { devices: number };
    __jait_capture(8, (healthBody.devices));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint12_test_ts_66_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test" as const,
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    sessionService.create({ name: "Mobile Control Session", userId: "mobile-owner" });

    const app = await createServer(testConfig, {
      consentManager: new ConsentManager(),
      deviceRegistry: new DeviceRegistry(),
      sessionService,
    });

    const headers = { authorization: "Bearer " + await signAuthToken({ id: "mobile-owner", username: "owner" }, testConfig.jwtSecret) };
    const response = await app.inject({ headers, method: "GET", url: "/api/mobile/os-tool/sessions" });
    __jait_capture(0, (response.statusCode));
    const body = response.json() as { sessions: Array<{ id: string; name: string }> };
    __jait_capture(1, (body.sessions.length));
    __jait_capture(2, (body.sessions[0]!.name));

    await app.close();
    sqlite.close();
  
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
