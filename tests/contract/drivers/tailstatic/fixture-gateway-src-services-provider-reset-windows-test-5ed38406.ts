// Translated fixture from packages/gateway/src/services/provider-reset-windows.test.ts; expected literals are in tail_static.rs.
import {
  deriveOllamaResetWindow,
  describeOllamaResetSource,
  parseOllamaResetSource,
  OLLAMA_MONTH_MINS,
  OLLAMA_SESSION_MINS,
  OLLAMA_WEEK_MINS,
} from "../../../../packages/gateway/src/services/provider-reset-windows.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/provider-reset-windows.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_16_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const now = new Date("2026-03-11T09:37:00.000Z");
    // Ollama's activity period ends "now", which is what used to leak into resetsAt.
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now,
      utilization: 0.42,
      anchorIso: now.toISOString(),
    });
    __jait_capture(0, (new Date(window.resetsAt).getTime()), (now.getTime()));
    __jait_capture(1, (window.windowStartAt));
    __jait_capture(2, (window.resetsAt));
    __jait_capture(3, (window.source));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_31_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The anchor Ollama reports is week-aligned; using it directly would shift a
    // 5-hour grid by three hours every week.
    const first = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: 0.4,
      anchorIso: "2026-03-09T00:00:00.000Z",
    });
    const second = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-18T09:37:00.000Z"),
      utilization: 0.4,
      anchorIso: "2026-03-16T00:00:00.000Z",
    });
    __jait_capture(0, (new Date(first.resetsAt).getUTCHours()), (new Date(second.resetsAt).getUTCHours()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_49_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const window = deriveOllamaResetWindow({
      windowDurationMins: WEEK,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: 0.2,
      anchorIso: "2026-03-09T00:00:00.000Z",
    });
    __jait_capture(0, (window.windowStartAt));
    __jait_capture(1, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_60_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const window = deriveOllamaResetWindow({
      windowDurationMins: MONTH,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: 0.2,
      anchorIso: "2026-01-31T00:00:00.000Z",
    });
    __jait_capture(0, (window.windowStartAt));
    __jait_capture(1, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_71_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T10:20:00.000Z"),
      utilization: 0.03,
      previous: {
        utilization: 0.81,
        resetsAt: "2026-03-11T10:00:00.000Z",
        source: "observed",
        observedAt: "2026-03-11T09:37:00.000Z",
      },
    });
    __jait_capture(0, (window.source));
    __jait_capture(1, (window.windowStartAt));
    __jait_capture(2, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_88_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The stale grid point (05:00) predates the previous snapshot, so it cannot
    // be the boundary the drop crossed; "now" is the honest upper bound.
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T09:50:00.000Z"),
      utilization: 0.05,
      previous: {
        utilization: 0.6,
        resetsAt: "2026-03-11T10:00:00.000Z",
        source: "window-grid",
        observedAt: "2026-03-11T09:40:00.000Z",
      },
    });
    __jait_capture(0, (window.source));
    __jait_capture(1, (window.windowStartAt));
    __jait_capture(2, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_107_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const now = new Date("2026-03-11T16:20:00.000Z");
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now,
      utilization: 0.55,
      previous: { utilization: 0.5, resetsAt: "2026-03-11T20:00:00.000Z", source: "observed" },
    });
    __jait_capture(0, (window.source));
    __jait_capture(1, (window.resetsAt));
    __jait_capture(2, (window.windowStartAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_120_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T21:30:00.000Z"),
      utilization: 0.6,
      previous: { utilization: 0.6, resetsAt: "2026-03-11T20:00:00.000Z", source: "observed" },
    });
    __jait_capture(0, (window.source));
    __jait_capture(1, (window.windowStartAt));
    __jait_capture(2, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_132_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T21:30:00.000Z"),
      utilization: 0.4,
      previous: { utilization: 0.4, resetsAt: "2026-03-11T20:00:00.000Z", source: "window-grid" },
    });
    __jait_capture(0, (window.source));
    __jait_capture(1, (window.windowStartAt));
    __jait_capture(2, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_144_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T12:00:00.000Z"),
      utilization: 0.799,
      previous: { utilization: 0.8, resetsAt: "2026-03-11T15:00:00.000Z", source: "window-grid" },
    });
    __jait_capture(0, (window.source));
    __jait_capture(1, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_155_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const window = deriveOllamaResetWindow({
      windowDurationMins: WEEK,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: null,
      previous: { utilization: null, resetsAt: null, source: null },
      anchorIso: null,
    });
    __jait_capture(0, (window.source));
    __jait_capture(1, (window.windowStartAt));
    __jait_capture(2, (window.resetsAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_170_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseOllamaResetSource("observed")));
    __jait_captureType(1, (parseOllamaResetSource("bogus")));
    __jait_captureType(2, (parseOllamaResetSource(undefined)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_reset_windows_test_ts_176_3": {


const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;
/*__jait_scope_open__*/{

try {
await (async()=>{

    const messages = [
      describeOllamaResetSource("observed"),
      describeOllamaResetSource("window-boundary"),
      describeOllamaResetSource("window-grid"),
      describeOllamaResetSource(null),
    ];
    __jait_capture(0, (new Set(messages).size), (messages.length));
  
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
