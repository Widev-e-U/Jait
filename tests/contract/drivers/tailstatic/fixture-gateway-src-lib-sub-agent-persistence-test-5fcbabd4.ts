// Translated fixture from packages/gateway/src/lib/sub-agent-persistence.test.ts; expected literals are in tail_static.rs.
import { extractSubAgentPayloads, stripSubAgentPayloads } from "../../../../packages/gateway/src/lib/sub-agent-persistence.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/lib/sub-agent-persistence.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_15_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (extractSubAgentPayloads(undefined)));
    __jait_capture(1, (extractSubAgentPayloads(null)));
    __jait_capture(2, (extractSubAgentPayloads("")));
    __jait_capture(3, (extractSubAgentPayloads("not-json")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_22_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
      { callId: "call-2", tool: "agent", data: fullSubAgentData },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    __jait_capture(0, (payloads));
    __jait_capture(1, (payloads[0]), ({
      subAgentId: "sub-1",
      content: "full body text",
      performative: "delegation",
      rounds: 3,
      durationMs: 1200,
      segments: fullSubAgentData.segments,
      toolCalls: fullSubAgentData.toolCalls,
    }));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_41_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "agent", data: { subAgentId: "sub-2", partialContent: "partial body" } },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    __jait_capture(0, (payloads[0]?.content));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_50_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify({ callId: "call-1", tool: "agent", data: fullSubAgentData });

    const payloads = extractSubAgentPayloads(toolCalls);
    __jait_capture(0, (payloads));
    __jait_capture(1, (payloads[0]?.subAgentId));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_58_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
      { callId: "call-2", tool: "agent", data: { subAgentId: "sub-1" } },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    __jait_capture(0, (payloads));
    __jait_capture(1, (payloads[0]?.subAgentId));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_69_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify([
      "plain-string",
      { callId: "call-1", tool: "agent", data: "not-an-object" },
      { callId: "call-2", tool: "agent", data: { subAgentId: "sub-1" } },
    ]);

    const payloads = extractSubAgentPayloads(toolCalls);
    __jait_capture(0, (payloads));
    __jait_capture(1, (payloads[0]?.subAgentId));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_83_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (stripSubAgentPayloads(undefined)));
    __jait_captureType(1, (stripSubAgentPayloads(null)));
    __jait_captureType(2, (stripSubAgentPayloads("")));
    __jait_captureType(3, (stripSubAgentPayloads("not-json")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_90_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
      { callId: "call-2", tool: "agent", data: fullSubAgentData },
    ]);

    const stripped = stripSubAgentPayloads(toolCalls)!;
    const parsed = JSON.parse(stripped) as Array<Record<string, unknown>>;

    __jait_capture(0, (parsed));
    // Non-sub-agent entry is untouched.
    __jait_capture(1, (parsed[0]));
    // Sub-agent entry keeps only the stub fields.
    __jait_capture(2, (parsed[1]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_110_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "agent", data: { subAgentId: "sub-1", content: "body" } },
    ]);

    const parsed = JSON.parse(stripSubAgentPayloads(toolCalls)!) as Array<Record<string, unknown>>;
    __jait_capture(0, (parsed[0]?.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_119_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify({ callId: "call-1", tool: "agent", data: fullSubAgentData });

    const parsed = JSON.parse(stripSubAgentPayloads(toolCalls)!) as Record<string, unknown>;
    __jait_capture(0, (parsed["data"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_sub_agent_persistence_test_ts_131_3": {


const fullSubAgentData = {
  subAgentId: "sub-1",
  content: "full body text",
  performative: "delegation",
  rounds: 3,
  durationMs: 1200,
  segments: [{ type: "text", text: "hello" }],
  toolCalls: [{ callId: "call-1", tool: "file.read" }],
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolCalls = JSON.stringify([
      { callId: "call-1", tool: "file.read", data: { path: "a.ts" } },
    ]);

    __jait_capture(0, (stripSubAgentPayloads(toolCalls)), (toolCalls));
  
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
